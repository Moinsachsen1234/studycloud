import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app';
import { getProfile, parse, uuid } from '../app';
import type { Db } from '../db/db';
import { HttpError, badRequest } from '../errors';
import { generateProgram } from '../ai/pipeline';
import { askTutor, publicSource, resolveProvenance } from '../ai/tutor';

/** Resolve claim ids → claims with their real sources (external records or in-app document references). */
export async function resolveClaims(db: Db, userId: string, claimIds: string[]) {
  if (!claimIds.length) return {};
  const rows = await db.query(
    `SELECT c.id AS claim_id, c.claim_text, c.verification_status, cs.source_id, cs.document_id, cs.segment_id, cs.supporting_location, cs.support_status,
            d.name AS document_name, seg.page AS segment_page
     FROM educational_claims c JOIN claim_sources cs ON cs.claim_id=c.id
     LEFT JOIN documents d ON d.id=cs.document_id AND d.user_id=$2
     LEFT JOIN document_segments seg ON seg.id=cs.segment_id
     WHERE c.id = ANY($1::uuid[]) AND c.user_id=$2`,
    [claimIds, userId],
  );
  const srcIds = [...new Set(rows.rows.map((r: any) => r.source_id).filter(Boolean))];
  const srcs = srcIds.length ? await db.query(`SELECT * FROM external_sources WHERE id = ANY($1::uuid[])`, [srcIds]) : { rows: [] };
  const byId = new Map(srcs.rows.map((s: any) => [s.id, publicSource(s)]));
  const out: Record<string, { text: string; status: string; sources: any[] }> = {};
  for (const r of rows.rows as any[]) {
    const c = (out[r.claim_id] ??= { text: r.claim_text, status: r.verification_status, sources: [] });
    if (r.source_id) c.sources.push({ kind: 'external', source: byId.get(r.source_id), location: r.supporting_location, support: r.support_status });
    else if (r.document_id && r.document_name) c.sources.push({ kind: 'document', documentId: r.document_id, documentName: r.document_name, page: r.segment_page, location: r.supporting_location, support: r.support_status });
  }
  return out;
}

export async function programSources(db: Db, userId: string, programId: string) {
  const links = await db.query(
    `SELECT cs.source_id, cs.document_id, c.claim_text FROM claim_sources cs JOIN educational_claims c ON c.id=cs.claim_id WHERE c.program_id=$1 AND c.user_id=$2`,
    [programId, userId],
  );
  const docIds = [...new Set(links.rows.map((r: any) => r.document_id).filter(Boolean))];
  const srcIds = [...new Set(links.rows.map((r: any) => r.source_id).filter(Boolean))];
  const docs = docIds.length ? await db.query(`SELECT id, name FROM documents WHERE id = ANY($1::uuid[]) AND user_id=$2`, [docIds, userId]) : { rows: [] };
  const srcs = srcIds.length ? await db.query(`SELECT * FROM external_sources WHERE id = ANY($1::uuid[])`, [srcIds]) : { rows: [] };
  const usedFor = (match: (r: any) => boolean) => links.rows.filter(match).map((r: any) => r.claim_text).slice(0, 4);
  const external = srcs.rows.map((s: any) => ({ ...publicSource(s), usedFor: usedFor((r) => r.source_id === s.id) }));
  return {
    myMaterials: docs.rows.map((d: any) => ({ documentId: d.id, name: d.name, usedFor: usedFor((r) => r.document_id === d.id) })),
    verifiedExternal: external.filter((s) => !s.license && s.verificationStatus === 'verified'),
    licensedResources: external.filter((s) => !!s.license),
    unverifiedExternal: external.filter((s) => s.verificationStatus !== 'verified' && !s.license), // should always be empty; surfaced for transparency
  };
}

async function ownedLesson(db: Db, userId: string, lessonId: string) {
  const r = await db.query(
    `SELECT l.*, p.title AS program_title, p.subject_id FROM lessons l JOIN learning_programs p ON p.id=l.program_id WHERE l.id=$1 AND p.user_id=$2`,
    [lessonId, userId],
  );
  if (!r.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Lektion nicht gefunden.');
  return r.rows[0] as any;
}

export async function learningRoutes(app: FastifyInstance, ctx: AppContext, authed: { preHandler: any }) {
  const { db } = ctx;
  const aiLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.post('/api/programs/generate', { ...authed, ...aiLimit }, async (req, reply) => {
    const b = parse(z.object({ documentIds: z.array(uuid).min(1).max(5), subjectId: z.string().max(60).optional(), topicId: uuid.optional(), sourceMode: z.enum(['materials_only', 'materials_plus_research']).default('materials_only') }), req.body);
    if (!ctx.llm) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Auf diesem Server ist noch kein KI-Anbieter eingerichtet. Lernprogramme können erst nach der Einrichtung erstellt werden.');
    if (b.sourceMode === 'materials_plus_research' && !ctx.research) throw new HttpError(503, 'RESEARCH_NOT_AVAILABLE', 'Die Recherche ist auf diesem Server deaktiviert. Nutze „Nur meine Materialien“.');
    const uid = req.user!.id;
    const profile = await getProfile(db, uid);
    if (!profile) throw badRequest('ONBOARDING_REQUIRED', 'Bitte schließe zuerst das Onboarding ab.');
    const docs = await db.query(
      `SELECT d.id, d.subject_id, d.topic_id, (SELECT status FROM processing_jobs j WHERE j.document_id=d.id ORDER BY created_at DESC, attempt DESC LIMIT 1) AS status
       FROM documents d WHERE d.user_id=$1 AND d.id = ANY($2::uuid[])`,
      [uid, b.documentIds],
    );
    if (docs.rows.length !== new Set(b.documentIds).size) throw new HttpError(404, 'NOT_FOUND', 'Dokument nicht gefunden.');
    if (docs.rows.some((d: any) => d.status !== 'completed')) throw new HttpError(409, 'DOCUMENT_NOT_READY', 'Mindestens ein Dokument ist noch nicht fertig verarbeitet.');
    const subjectId = b.subjectId ?? (docs.rows[0] as any).subject_id;
    const subj = subjectId ? await db.query(`SELECT study_language FROM subjects WHERE id=$1`, [subjectId]) : { rows: [] };
    const out = await generateProgram(ctx.pipeline, {
      userId: uid, documentIds: b.documentIds, subjectId, topicId: b.topicId ?? (docs.rows[0] as any).topic_id ?? null,
      sourceMode: b.sourceMode, uiLanguage: profile.ui_language, studyLanguage: (subj.rows[0] as any)?.study_language ?? undefined, grade: profile.grade,
    });
    return reply.status(201).send(out);
  });

  app.get('/api/programs', authed, async (req) => {
    const q = parse(z.object({ subjectId: z.string().max(60).optional() }), req.query);
    const args: unknown[] = [req.user!.id];
    let where = 'p.user_id=$1';
    if (q.subjectId) { args.push(q.subjectId); where += ` AND p.subject_id=$2`; }
    const r = await db.query(
      `SELECT p.id, p.title, p.description, p.subject_id, p.estimated_minutes, p.source_mode, p.created_at,
         (SELECT count(*)::int FROM lessons l WHERE l.program_id=p.id) AS lesson_count,
         (SELECT count(*)::int FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id WHERE l.program_id=p.id AND lp.user_id=$1 AND lp.status='completed') AS completed_count
       FROM learning_programs p WHERE ${where} ORDER BY p.created_at DESC`, args);
    return { programs: r.rows };
  });

  app.get('/api/programs/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const uid = req.user!.id;
    const p = await db.query(`SELECT * FROM learning_programs WHERE id=$1 AND user_id=$2`, [id, uid]);
    if (!p.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Programm nicht gefunden.');
    const [lessons, objectives, sources, docs] = await Promise.all([
      db.query(`SELECT l.id, l.ordinal, l.title, l.estimated_minutes, lp.status FROM lessons l LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=$2 WHERE l.program_id=$1 ORDER BY l.ordinal`, [id, uid]),
      db.query(`SELECT id, objective_key, text FROM learning_objectives WHERE program_id=$1 AND user_id=$2 ORDER BY objective_key`, [id, uid]),
      programSources(db, uid, id),
      db.query(`SELECT d.id, d.name FROM documents d JOIN program_documents pd ON pd.document_id=d.id WHERE pd.program_id=$1 AND d.user_id=$2`, [id, uid]),
    ]);
    const r = p.rows[0] as any;
    return {
      id: r.id, title: r.title, description: r.description, subjectId: r.subject_id, gradeMin: r.grade_min, gradeMax: r.grade_max,
      estimatedMinutes: r.estimated_minutes, sourceMode: r.source_mode, warnings: r.warnings, generation: r.generation_meta, createdAt: r.created_at,
      lessons: lessons.rows.map((l: any) => ({ id: l.id, ordinal: l.ordinal, title: l.title, estimatedMinutes: l.estimated_minutes, status: l.status ?? 'not_started' })),
      objectives: objectives.rows, documents: docs.rows, sources,
      progress: { completed: lessons.rows.filter((l: any) => l.status === 'completed').length, total: lessons.rows.length },
    };
  });

  app.get('/api/programs/:id/sources', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const p = await db.query(`SELECT 1 FROM learning_programs WHERE id=$1 AND user_id=$2`, [id, req.user!.id]);
    if (!p.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Programm nicht gefunden.');
    return programSources(db, req.user!.id, id);
  });

  app.delete('/api/programs/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const r = await db.query(`DELETE FROM learning_programs WHERE id=$1 AND user_id=$2`, [id, req.user!.id]);
    if (!r.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Programm nicht gefunden.');
    return { ok: true };
  });

  app.get('/api/lessons/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const uid = req.user!.id;
    const l = await ownedLesson(db, uid, id);
    const claimIds: string[] = (l.blocks as any[]).flatMap((b) => b.claim_ids ?? []);
    const [claims, nav, prog] = await Promise.all([
      resolveClaims(db, uid, claimIds),
      db.query(`SELECT id, ordinal FROM lessons WHERE program_id=$1 AND ordinal IN ($2, $3)`, [l.program_id, l.ordinal - 1, l.ordinal + 1]),
      db.query(`SELECT status, completed_at FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2`, [uid, id]),
    ]);
    return {
      id: l.id, programId: l.program_id, programTitle: l.program_title, subjectId: l.subject_id, ordinal: l.ordinal, title: l.title, estimatedMinutes: l.estimated_minutes,
      blocks: (l.blocks as any[]).map((b) => ({ id: b.id, type: b.type, title: b.title, text: b.text, origin: b.origin, mathChecked: b.math_checked, claimIds: b.claim_ids })),
      claims,
      prevLessonId: (nav.rows as any[]).find((n) => n.ordinal === l.ordinal - 1)?.id ?? null,
      nextLessonId: (nav.rows as any[]).find((n) => n.ordinal === l.ordinal + 1)?.id ?? null,
      progress: prog.rows[0] ? { status: (prog.rows[0] as any).status, completedAt: (prog.rows[0] as any).completed_at } : { status: 'not_started', completedAt: null },
    };
  });

  app.post('/api/lessons/:id/progress', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const b = parse(z.object({ status: z.enum(['in_progress', 'completed']), seconds: z.number().int().min(1).max(14400).optional() }), req.body);
    const uid = req.user!.id;
    const l = await ownedLesson(db, uid, id);
    await db.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, status, completed_at) VALUES ($1,$2,$3, CASE WHEN $3='completed' THEN now() END)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET status = CASE WHEN lesson_progress.status='completed' THEN 'completed' ELSE $3 END,
         completed_at = CASE WHEN lesson_progress.completed_at IS NOT NULL THEN lesson_progress.completed_at WHEN $3='completed' THEN now() END`,
      [uid, id, b.status],
    );
    if (b.seconds) await db.query(`INSERT INTO study_sessions (user_id, lesson_id, subject_id, seconds) VALUES ($1,$2,$3,$4)`, [uid, id, l.subject_id, b.seconds]);
    return { ok: true };
  });

  app.post('/api/study-sessions', authed, async (req, reply) => {
    const b = parse(z.object({ seconds: z.number().int().min(1).max(14400), lessonId: uuid.optional(), subjectId: z.string().max(60).optional() }), req.body);
    if (b.lessonId) await ownedLesson(db, req.user!.id, b.lessonId);
    await db.query(`INSERT INTO study_sessions (user_id, lesson_id, subject_id, seconds) VALUES ($1,$2,$3,$4)`, [req.user!.id, b.lessonId ?? null, b.subjectId ?? null, b.seconds]);
    return reply.status(201).send({ ok: true });
  });

  // ---- sources: only sources that are linked to the caller's own claims or messages
  app.get('/api/sources/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const uid = req.user!.id;
    const linked = await db.query(`SELECT 1 FROM claim_sources cs JOIN educational_claims c ON c.id=cs.claim_id WHERE cs.source_id=$1 AND c.user_id=$2 LIMIT 1`, [id, uid]);
    if (!linked.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Quelle nicht gefunden.');
    const r = await db.query(`SELECT * FROM external_sources WHERE id=$1`, [id]);
    const perms = await db.query(`SELECT intended_use, permission_status, restriction_details FROM source_usage_permissions WHERE source_id=$1 ORDER BY intended_use`, [id]);
    return { ...publicSource(r.rows[0]), permissions: perms.rows };
  });

  // ---- tutor
  app.post('/api/tutor/messages', { ...authed, ...aiLimit }, async (req) => {
    const b = parse(z.object({
      conversationId: uuid.optional(), question: z.string().trim().min(1).max(2000), withResearch: z.boolean().default(false),
      scope: z.object({ programId: uuid.optional(), lessonId: uuid.optional(), documentId: uuid.optional(), subjectId: z.string().max(60).optional() }).default({}),
    }), req.body);
    if (!ctx.llm) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Auf diesem Server ist noch kein KI-Anbieter eingerichtet. Cloudy kann erst nach der Einrichtung antworten.');
    if (b.withResearch && !ctx.research) throw new HttpError(503, 'RESEARCH_NOT_AVAILABLE', 'Die Recherche ist auf diesem Server deaktiviert.');
    const profile = await getProfile(db, req.user!.id);
    const out = await askTutor(ctx.pipeline, { userId: req.user!.id, conversationId: b.conversationId, question: b.question, scope: b.scope, withResearch: b.withResearch, uiLanguage: profile?.ui_language ?? 'de', grade: profile?.grade ?? 8 });
    return { conversationId: out.conversationId, message: { id: out.messageId, role: 'assistant', content: out.content, provenance: await resolveProvenance(db, req.user!.id, out.provenance), researchUsed: out.researchUsed } };
  });

  app.get('/api/tutor/conversations', authed, async (req) => {
    const r = await db.query(`SELECT id, title, created_at, subject_id, program_id, lesson_id FROM tutor_conversations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user!.id]);
    return { conversations: r.rows };
  });

  app.get('/api/tutor/conversations/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const c = await db.query(`SELECT id, title FROM tutor_conversations WHERE id=$1 AND user_id=$2`, [id, req.user!.id]);
    if (!c.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Unterhaltung nicht gefunden.');
    const m = await db.query(`SELECT id, role, content, provenance, created_at FROM tutor_messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY seq`, [id, req.user!.id]);
    const messages = [];
    for (const row of m.rows as any[]) messages.push({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at, provenance: row.role === 'assistant' ? await resolveProvenance(db, req.user!.id, row.provenance) : [] });
    return { conversation: c.rows[0], messages };
  });

  app.delete('/api/tutor/conversations/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const r = await db.query(`DELETE FROM tutor_conversations WHERE id=$1 AND user_id=$2`, [id, req.user!.id]);
    if (!r.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Unterhaltung nicht gefunden.');
    return { ok: true };
  });
}
