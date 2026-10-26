import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError, type ZodTypeAny } from 'zod';
import type { Db } from './db/db';
import type { AppConfig } from './config';
import type { ObjectStorage } from './storage';
import type { LlmProvider } from './ai/llm';
import type { ResearchService } from './research/researchService';
import type { SourceVerificationService } from './research/verification';
import type { JobRunner } from './documents/jobs';
import type { PipelineDeps } from './ai/pipeline';
import { HttpError, badRequest } from './errors';
import { DUMMY_HASH, createSession, hashPassword, makeAuthenticate, revokeToken, verifyPassword } from './auth';
import { FEDERAL_STATES, SYSTEM_SUBJECTS, isValidSchool, schoolTypesFor } from './reference';
import { PRIVACY_VERSION, hasConsent } from './services/guards';
import { documentRoutes } from './routes/documents';
import { learningRoutes } from './routes/learning';
import { plannerRoutes } from './routes/planner';

export interface AppContext {
  db: Db;
  config: AppConfig;
  storage: ObjectStorage;
  llm: LlmProvider | null;
  research: ResearchService | null;
  verifier: SourceVerificationService | null;
  jobs: JobRunner;
  pipeline: PipelineDeps;
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest('VALIDATION_ERROR', 'Ungültige Eingabe.', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

export const uuid = z.string().uuid();

export async function seedSubjects(db: Db) {
  for (const s of SYSTEM_SUBJECTS) {
    await db.query(
      `INSERT INTO subjects (id, name_de, name_en, icon, color, learning_objectives, sort_order, study_language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET name_de=$2, name_en=$3, icon=$4, color=$5, learning_objectives=$6, sort_order=$7, study_language=$8`,
      [s.id, s.name_de, s.name_en, s.icon, s.color, JSON.stringify(s.objectives), s.sort_order, (s as any).study_language ?? null],
    );
  }
}

export async function getProfile(db: Db, userId: string) {
  const r = await db.query(
    `SELECT p.*, s.federal_state, s.school_type FROM student_profiles p LEFT JOIN school_profiles s ON s.user_id=p.user_id WHERE p.user_id=$1`,
    [userId],
  );
  return r.rows[0] as undefined | { display_name: string; grade: number; ui_language: 'de' | 'en'; time_zone: string; learning_goals: string[]; onboarding_completed_at: Date | null; federal_state: string | null; school_type: string | null };
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const { db, config } = ctx;
  const app = Fastify({
    logger: config.port === 0 ? false : { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'], serializers: { req: (r) => ({ method: r.method, url: (r.url ?? '').split('?')[0] }) } },
    bodyLimit: 1_000_000,
    trustProxy: false,
  });
  await app.register(cors, { origin: config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10, fieldSize: 2000 } });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    if (err instanceof ZodError) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Ungültige Eingabe.' } });
    if (err.code === 'AI_NOT_CONFIGURED') return reply.status(503).send({ error: { code: err.code, message: err.message } });
    if (err.code === 'AI_PROVIDER_ERROR') return reply.status(502).send({ error: { code: err.code, message: 'Der KI-Anbieter ist gerade nicht erreichbar. Bitte versuche es später erneut.' } });
    if (err.statusCode === 429) return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Zu viele Anfragen. Bitte warte einen Moment.' } });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: `Die Datei ist größer als ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.` } });
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: { code: 'BAD_REQUEST', message: 'Ungültige Anfrage.' } });
    req.log.error({ err: { message: err.message, code: err.code } }, 'unhandled error'); // never log bodies
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Etwas ist schiefgelaufen.' } });
  });

  const auth = makeAuthenticate(db);
  const authed = { preHandler: auth };

  app.get('/health', async () => ({ ok: true }));

  /** Capability report so the UI can be honest about what is configured. */
  app.get('/api/capabilities', async () => ({
    ai: { configured: !!ctx.llm, provider: ctx.llm?.name ?? null, model: ctx.llm?.model ?? null },
    ocr: { configured: !!ctx.llm?.ocr && config.ocr.enabled },
    research: { configured: !!ctx.research, providers: ctx.research ? ['wikipedia'] : [] },
    maxUploadBytes: config.maxUploadBytes,
    digitalConsentAge: config.digitalConsentAge,
    privacyVersion: PRIVACY_VERSION,
  }));

  app.get('/api/reference/schools', async () => ({
    federalStates: FEDERAL_STATES.map((s) => ({ ...s, schoolTypes: schoolTypesFor(s.id) })),
  }));

  // ---------------- auth ----------------
  const registerSchema = z.object({
    email: z.string().email().max(200),
    password: z.string().min(10, 'Mindestens 10 Zeichen').max(200),
    birthYear: z.number().int().min(1900).max(2100),
    acceptPrivacy: z.literal(true),
    guardianConsent: z.boolean().optional(),
    aiConsent: z.boolean().optional(),
  });

  app.post('/api/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = parse(registerSchema, req.body);
    const age = new Date().getFullYear() - b.birthYear;
    if (age < 5 || age > 100) throw badRequest('INVALID_BIRTH_YEAR', 'Bitte gib ein gültiges Geburtsjahr an.');
    const minor = age < config.digitalConsentAge;
    if (minor && !b.guardianConsent) throw new HttpError(400, 'GUARDIAN_CONSENT_REQUIRED', `Unter ${config.digitalConsentAge} Jahren ist die Einwilligung der Erziehungsberechtigten erforderlich.`);
    const email = b.email.trim().toLowerCase();
    const exists = await db.query(`SELECT 1 FROM users WHERE lower(email)=$1`, [email]);
    if (exists.rows[0]) throw new HttpError(409, 'EMAIL_TAKEN', 'Diese E-Mail-Adresse ist bereits registriert.');
    const passwordHash = hashPassword(b.password);
    const userId = await db.tx(async (tx) => {
      const u = await tx.query<{ id: string }>(`INSERT INTO users (email, password_hash, birth_year, guardian_consent_at) VALUES ($1,$2,$3,$4) RETURNING id`, [email, passwordHash, b.birthYear, minor ? new Date() : null]);
      const id = u.rows[0].id;
      await tx.query(`INSERT INTO consents (user_id, kind, version) VALUES ($1,'privacy_policy',$2), ($1,'terms',$2)`, [id, PRIVACY_VERSION]);
      if (minor) await tx.query(`INSERT INTO consents (user_id, kind, version) VALUES ($1,'guardian',$2)`, [id, PRIVACY_VERSION]);
      if (b.aiConsent) await tx.query(`INSERT INTO consents (user_id, kind, version) VALUES ($1,'ai_processing',$2)`, [id, PRIVACY_VERSION]);
      return id;
    });
    const s = await createSession(db, userId, config.sessionTtlDays);
    return reply.status(201).send({ token: s.token, expiresAt: s.expiresAt, user: { id: userId, email } });
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(z.object({ email: z.string().email(), password: z.string().min(1).max(200) }), req.body);
    const r = await db.query<{ id: string; password_hash: string }>(`SELECT id, password_hash FROM users WHERE lower(email)=$1`, [b.email.trim().toLowerCase()]);
    const ok = verifyPassword(b.password, r.rows[0]?.password_hash ?? DUMMY_HASH);
    if (!r.rows[0] || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-Mail oder Passwort ist falsch.');
    const s = await createSession(db, r.rows[0].id, config.sessionTtlDays);
    return { token: s.token, expiresAt: s.expiresAt, user: { id: r.rows[0].id, email: b.email.trim().toLowerCase() } };
  });

  app.post('/api/auth/logout', authed, async (req) => {
    const m = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i);
    if (m) await revokeToken(db, m[1]);
    return { ok: true };
  });

  // ---------------- me / profile ----------------
  async function meView(userId: string, email: string) {
    const [profile, subjects, ai, guardian, u] = await Promise.all([
      getProfile(db, userId),
      db.query(`SELECT subject_id FROM user_subjects WHERE user_id=$1`, [userId]),
      hasConsent(db, userId, 'ai_processing'),
      hasConsent(db, userId, 'guardian'),
      db.query<{ birth_year: number; created_at: Date }>(`SELECT birth_year, created_at FROM users WHERE id=$1`, [userId]),
    ]);
    return {
      id: userId,
      email,
      birthYear: u.rows[0].birth_year,
      onboardingCompleted: !!profile?.onboarding_completed_at,
      profile: profile ? { displayName: profile.display_name, grade: profile.grade, uiLanguage: profile.ui_language, timeZone: profile.time_zone, learningGoals: profile.learning_goals, federalState: profile.federal_state, schoolType: profile.school_type } : null,
      subjectIds: subjects.rows.map((s: any) => s.subject_id),
      consents: { aiProcessing: ai, guardian },
    };
  }

  app.get('/api/me', authed, async (req) => meView(req.user!.id, req.user!.email));

  const profileSchema = z.object({
    displayName: z.string().trim().min(1).max(40),
    grade: z.number().int().min(1).max(13),
    uiLanguage: z.enum(['de', 'en']).default('de'),
    timeZone: z.string().max(60).default('Europe/Berlin'),
    learningGoals: z.array(z.string().max(80)).max(8).default([]),
    federalState: z.string().length(2),
    schoolType: z.string().max(40),
    subjectIds: z.array(z.string().max(60)).max(30),
  });

  app.put('/api/me/profile', authed, async (req) => {
    const b = parse(profileSchema, req.body);
    if (!isValidSchool(b.federalState, b.schoolType)) throw badRequest('INVALID_SCHOOL', 'Diese Schulform passt nicht zum gewählten Bundesland.');
    try {
      new Intl.DateTimeFormat('de-DE', { timeZone: b.timeZone });
    } catch {
      throw badRequest('INVALID_TIMEZONE', 'Ungültige Zeitzone.');
    }
    const uid = req.user!.id;
    const valid = await db.query<{ id: string }>(`SELECT id FROM subjects WHERE id = ANY($1) AND (owner_user_id IS NULL OR owner_user_id=$2)`, [b.subjectIds, uid]);
    await db.tx(async (tx) => {
      await tx.query(
        `INSERT INTO student_profiles (user_id, display_name, grade, ui_language, time_zone, learning_goals, onboarding_completed_at)
         VALUES ($1,$2,$3,$4,$5,$6, now())
         ON CONFLICT (user_id) DO UPDATE SET display_name=$2, grade=$3, ui_language=$4, time_zone=$5, learning_goals=$6, updated_at=now(),
           onboarding_completed_at = COALESCE(student_profiles.onboarding_completed_at, now())`,
        [uid, b.displayName, b.grade, b.uiLanguage, b.timeZone, JSON.stringify(b.learningGoals)],
      );
      await tx.query(`INSERT INTO school_profiles (user_id, federal_state, school_type) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET federal_state=$2, school_type=$3`, [uid, b.federalState, b.schoolType]);
      await tx.query(`DELETE FROM user_subjects WHERE user_id=$1 AND NOT (subject_id = ANY($2))`, [uid, valid.rows.map((r) => r.id)]);
      for (const s of valid.rows) await tx.query(`INSERT INTO user_subjects (user_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [uid, s.id]);
    });
    return meView(uid, req.user!.email);
  });

  app.post('/api/me/consents', authed, async (req) => {
    const b = parse(z.object({ kind: z.literal('ai_processing'), granted: z.boolean() }), req.body);
    const uid = req.user!.id;
    if (b.granted) {
      const u = await db.query<{ birth_year: number }>(`SELECT birth_year FROM users WHERE id=$1`, [uid]);
      const minor = new Date().getFullYear() - u.rows[0].birth_year < config.digitalConsentAge;
      if (minor && !(await hasConsent(db, uid, 'guardian'))) throw new HttpError(403, 'GUARDIAN_CONSENT_REQUIRED', 'Die Einwilligung der Erziehungsberechtigten fehlt.');
      if (!(await hasConsent(db, uid, 'ai_processing'))) await db.query(`INSERT INTO consents (user_id, kind, version) VALUES ($1,'ai_processing',$2)`, [uid, PRIVACY_VERSION]);
    } else await db.query(`UPDATE consents SET withdrawn_at=now() WHERE user_id=$1 AND kind='ai_processing' AND withdrawn_at IS NULL`, [uid]);
    return meView(uid, req.user!.email);
  });

  /** GDPR Art. 20: machine-readable export of the student's own data (no file bytes, no other users). */
  app.get('/api/me/export', authed, async (req) => {
    const uid = req.user!.id;
    const q = async (sql: string) => (await db.query(sql, [uid])).rows;
    return {
      exportedAt: new Date().toISOString(),
      user: (await q(`SELECT id, email, birth_year, guardian_consent_at, created_at FROM users WHERE id=$1`))[0],
      profile: await getProfile(db, uid),
      consents: await q(`SELECT kind, version, granted_at, withdrawn_at FROM consents WHERE user_id=$1`),
      documents: await q(`SELECT id, name, original_filename, mime_type, size_bytes, subject_id, created_at FROM documents WHERE user_id=$1`),
      segments: await q(`SELECT document_id, ordinal, page, heading, text FROM document_segments WHERE user_id=$1 ORDER BY document_id, ordinal`),
      programs: await q(`SELECT id, title, description, source_mode, created_at, warnings FROM learning_programs WHERE user_id=$1`),
      lessons: await q(`SELECT l.* FROM lessons l JOIN learning_programs p ON p.id=l.program_id WHERE p.user_id=$1`),
      progress: await q(`SELECT lesson_id, status, started_at, completed_at FROM lesson_progress WHERE user_id=$1`),
      studySessions: await q(`SELECT lesson_id, subject_id, seconds, recorded_at FROM study_sessions WHERE user_id=$1`),
      exams: await q(`SELECT id, subject_id, title, exam_date FROM exams WHERE user_id=$1`),
      planItems: await q(`SELECT * FROM plan_items WHERE user_id=$1`),
      tutorConversations: await q(`SELECT id, title, created_at FROM tutor_conversations WHERE user_id=$1`),
      tutorMessages: await q(`SELECT conversation_id, role, content, provenance, created_at FROM tutor_messages WHERE user_id=$1 ORDER BY created_at`),
    };
  });

  /** Account deletion: re-auth with password, delete files, cascade-delete all rows. */
  app.delete('/api/me', authed, async (req) => {
    const b = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
    const uid = req.user!.id;
    const u = await db.query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id=$1`, [uid]);
    if (!verifyPassword(b.password, u.rows[0].password_hash)) throw new HttpError(403, 'INVALID_CREDENTIALS', 'Das Passwort ist falsch.');
    await ctx.storage.deletePrefix(uid);
    await db.query(`DELETE FROM users WHERE id=$1`, [uid]);
    return { ok: true };
  });

  // ---------------- subjects / topics / collections ----------------
  app.get('/api/subjects', authed, async (req) => {
    const uid = req.user!.id;
    const r = await db.query(
      `SELECT s.*, (us.user_id IS NOT NULL) AS selected,
         (SELECT count(*)::int FROM documents d WHERE d.user_id=$1 AND d.subject_id=s.id) AS document_count,
         (SELECT count(*)::int FROM learning_programs p WHERE p.user_id=$1 AND p.subject_id=s.id) AS program_count
       FROM subjects s LEFT JOIN user_subjects us ON us.subject_id=s.id AND us.user_id=$1
       WHERE s.owner_user_id IS NULL OR s.owner_user_id=$1 ORDER BY s.sort_order, s.name_de`,
      [uid],
    );
    return { subjects: r.rows.map(subjectView) };
  });

  app.put('/api/me/subjects', authed, async (req) => {
    const b = parse(z.object({ subjectIds: z.array(z.string().max(60)).max(30) }), req.body);
    const uid = req.user!.id;
    const valid = await db.query<{ id: string }>(`SELECT id FROM subjects WHERE id = ANY($1) AND (owner_user_id IS NULL OR owner_user_id=$2)`, [b.subjectIds, uid]);
    await db.tx(async (tx) => {
      await tx.query(`DELETE FROM user_subjects WHERE user_id=$1`, [uid]);
      for (const s of valid.rows) await tx.query(`INSERT INTO user_subjects (user_id, subject_id) VALUES ($1,$2)`, [uid, s.id]);
    });
    return { subjectIds: valid.rows.map((r) => r.id) };
  });

  app.post('/api/subjects', authed, async (req, reply) => {
    const b = parse(z.object({ name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7A61E8'), icon: z.string().max(40).default('school-outline'), objectives: z.array(z.string().max(160)).max(8).default([]) }), req.body);
    const id = `u-${req.user!.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`;
    await db.query(`INSERT INTO subjects (id, owner_user_id, name_de, name_en, icon, color, learning_objectives, sort_order) VALUES ($1,$2,$3,$3,$4,$5,$6,200)`, [id, req.user!.id, b.name, b.icon, b.color, JSON.stringify(b.objectives)]);
    await db.query(`INSERT INTO user_subjects (user_id, subject_id) VALUES ($1,$2)`, [req.user!.id, id]);
    return reply.status(201).send({ id });
  });

  app.delete('/api/subjects/:id', authed, async (req) => {
    const id = parse(z.object({ id: z.string().max(60) }), req.params).id;
    const r = await db.query(`DELETE FROM subjects WHERE id=$1 AND owner_user_id=$2`, [id, req.user!.id]);
    if (!r.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Eigenes Fach nicht gefunden (Standardfächer können nicht gelöscht werden).');
    return { ok: true };
  });

  app.get('/api/subjects/:id', authed, async (req) => {
    const uid = req.user!.id;
    const id = parse(z.object({ id: z.string().max(60) }), req.params).id;
    const s = await db.query(`SELECT * FROM subjects WHERE id=$1 AND (owner_user_id IS NULL OR owner_user_id=$2)`, [id, uid]);
    if (!s.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Fach nicht gefunden.');
    const [topics, docs, programs, collections, prog] = await Promise.all([
      db.query(`SELECT id, title FROM topics WHERE user_id=$1 AND subject_id=$2 ORDER BY created_at`, [uid, id]),
      db.query(`SELECT d.id, d.name, d.created_at, (SELECT status FROM processing_jobs j WHERE j.document_id=d.id ORDER BY j.created_at DESC LIMIT 1) AS status FROM documents d WHERE d.user_id=$1 AND d.subject_id=$2 ORDER BY d.created_at DESC`, [uid, id]),
      db.query(`SELECT p.id, p.title, p.estimated_minutes, (SELECT count(*)::int FROM lessons l WHERE l.program_id=p.id) AS lesson_count,
                (SELECT count(*)::int FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id WHERE l.program_id=p.id AND lp.user_id=$1 AND lp.status='completed') AS completed_count
                FROM learning_programs p WHERE p.user_id=$1 AND p.subject_id=$2 ORDER BY p.created_at DESC`, [uid, id]),
      db.query(`SELECT id, name FROM collections WHERE user_id=$1 AND subject_id=$2 ORDER BY created_at`, [uid, id]),
      db.query(`SELECT (SELECT count(*)::int FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id JOIN learning_programs p ON p.id=l.program_id WHERE lp.user_id=$1 AND p.subject_id=$2 AND lp.status='completed') AS completed,
                       (SELECT count(*)::int FROM lessons l JOIN learning_programs p ON p.id=l.program_id WHERE p.user_id=$1 AND p.subject_id=$2) AS total`, [uid, id]),
    ]);
    return { subject: subjectView(s.rows[0]), topics: topics.rows, collections: collections.rows, documents: docs.rows, programs: programs.rows, progress: prog.rows[0] };
  });

  app.post('/api/subjects/:id/topics', authed, async (req, reply) => {
    const id = parse(z.object({ id: z.string().max(60) }), req.params).id;
    const b = parse(z.object({ title: z.string().trim().min(1).max(100) }), req.body);
    const s = await db.query(`SELECT 1 FROM subjects WHERE id=$1 AND (owner_user_id IS NULL OR owner_user_id=$2)`, [id, req.user!.id]);
    if (!s.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Fach nicht gefunden.');
    const r = await db.query(`INSERT INTO topics (user_id, subject_id, title) VALUES ($1,$2,$3) RETURNING id, title`, [req.user!.id, id, b.title]);
    return reply.status(201).send(r.rows[0]);
  });
  app.delete('/api/topics/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const r = await db.query(`DELETE FROM topics WHERE id=$1 AND user_id=$2`, [id, req.user!.id]);
    if (!r.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Thema nicht gefunden.');
    return { ok: true };
  });
  app.post('/api/subjects/:id/collections', authed, async (req, reply) => {
    const id = parse(z.object({ id: z.string().max(60) }), req.params).id;
    const b = parse(z.object({ name: z.string().trim().min(1).max(100) }), req.body);
    const r = await db.query(`INSERT INTO collections (user_id, subject_id, name) VALUES ($1,$2,$3) RETURNING id, name`, [req.user!.id, id, b.name]);
    return reply.status(201).send(r.rows[0]);
  });
  app.delete('/api/collections/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const r = await db.query(`DELETE FROM collections WHERE id=$1 AND user_id=$2`, [id, req.user!.id]);
    if (!r.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Sammlung nicht gefunden.');
    return { ok: true };
  });

  await documentRoutes(app, ctx, authed);
  await learningRoutes(app, ctx, authed);
  await plannerRoutes(app, ctx, authed);
  return app;
}

function subjectView(r: any) {
  return { id: r.id, nameDe: r.name_de, nameEn: r.name_en, icon: r.icon, color: r.color, objectives: r.learning_objectives, studyLanguage: r.study_language, isCustom: !!r.owner_user_id, selected: !!r.selected, documentCount: r.document_count ?? 0, programCount: r.program_count ?? 0 };
}

export type AuthedRequest = FastifyRequest;
