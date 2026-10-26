import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app';
import { getProfile, parse, uuid } from '../app';
import { HttpError, badRequest } from '../errors';
import { buildPlan } from '../services/planner';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Ungültiges Datum');

export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export async function plannerRoutes(app: FastifyInstance, ctx: AppContext, authed: { preHandler: any }) {
  const { db } = ctx;
  const tz = async (uid: string) => (await getProfile(db, uid))?.time_zone ?? 'Europe/Berlin';

  // ---- exams
  app.get('/api/exams', authed, async (req) => {
    const r = await db.query(`SELECT id, subject_id, title, to_char(exam_date,'YYYY-MM-DD') AS exam_date, goal FROM exams WHERE user_id=$1 ORDER BY exam_date`, [req.user!.id]);
    return { exams: r.rows.map((e: any) => ({ id: e.id, subjectId: e.subject_id, title: e.title, examDate: e.exam_date, goal: e.goal })) };
  });
  app.post('/api/exams', authed, async (req, reply) => {
    const b = parse(z.object({ subjectId: z.string().max(60), title: z.string().trim().min(1).max(100), examDate: dateStr, goal: z.string().max(200).optional() }), req.body);
    const s = await db.query(`SELECT 1 FROM subjects WHERE id=$1 AND (owner_user_id IS NULL OR owner_user_id=$2)`, [b.subjectId, req.user!.id]);
    if (!s.rows[0]) throw badRequest('INVALID_SUBJECT', 'Unbekanntes Fach.');
    if (b.examDate < todayIn(await tz(req.user!.id))) throw badRequest('DATE_IN_PAST', 'Das Prüfungsdatum liegt in der Vergangenheit.');
    const r = await db.query(`INSERT INTO exams (user_id, subject_id, title, exam_date, goal) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.user!.id, b.subjectId, b.title, b.examDate, b.goal ?? null]);
    return reply.status(201).send({ id: (r.rows[0] as any).id });
  });
  app.delete('/api/exams/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const r = await db.query(`DELETE FROM exams WHERE id=$1 AND user_id=$2`, [id, req.user!.id]);
    if (!r.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Prüfung nicht gefunden.');
    return { ok: true };
  });

  // ---- availability
  app.get('/api/plan/availability', authed, async (req) => {
    const r = await db.query(`SELECT weekday, minutes FROM study_availability WHERE user_id=$1`, [req.user!.id]);
    const minutes = [0, 0, 0, 0, 0, 0, 0];
    r.rows.forEach((x: any) => (minutes[x.weekday] = x.minutes));
    return { configured: r.rows.length > 0, minutes };
  });
  app.put('/api/plan/availability', authed, async (req) => {
    const b = parse(z.object({ minutes: z.array(z.number().int().min(0).max(600)).length(7) }), req.body);
    await db.tx(async (tx) => {
      await tx.query(`DELETE FROM study_availability WHERE user_id=$1`, [req.user!.id]);
      for (let i = 0; i < 7; i++) await tx.query(`INSERT INTO study_availability (user_id, weekday, minutes) VALUES ($1,$2,$3)`, [req.user!.id, i, b.minutes[i]]);
    });
    return { configured: true, minutes: b.minutes };
  });

  // ---- plan
  app.post('/api/plan/generate', authed, async (req) => {
    const uid = req.user!.id;
    const today = todayIn(await tz(uid));
    const av = await db.query(`SELECT weekday, minutes FROM study_availability WHERE user_id=$1`, [uid]);
    if (!av.rows.length || av.rows.every((a: any) => a.minutes === 0)) throw badRequest('AVAILABILITY_REQUIRED', 'Bitte lege zuerst fest, wann du lernen kannst.');
    const availability = [0, 0, 0, 0, 0, 0, 0];
    av.rows.forEach((x: any) => (availability[x.weekday] = x.minutes));
    const exams = (await db.query(`SELECT id, subject_id, title, to_char(exam_date,'YYYY-MM-DD') AS d FROM exams WHERE user_id=$1 AND exam_date > $2::date`, [uid, today])).rows as any[];
    if (!exams.length) throw badRequest('NO_EXAMS', 'Lege zuerst mindestens eine bevorstehende Prüfung an.');
    const lessons = (
      await db.query(
        `SELECT l.id, p.subject_id, l.title, l.estimated_minutes FROM lessons l JOIN learning_programs p ON p.id=l.program_id
         LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=$1
         WHERE p.user_id=$1 AND COALESCE(lp.status,'') <> 'completed' ORDER BY p.created_at, l.ordinal`,
        [uid],
      )
    ).rows as any[];
    const plan = buildPlan({
      exams: exams.map((e) => ({ id: e.id, subjectId: e.subject_id, title: e.title, examDate: e.d })),
      lessons: lessons.map((l) => ({ id: l.id, subjectId: l.subject_id, title: l.title, minutes: l.estimated_minutes })),
      availability, today,
    });
    await db.tx(async (tx) => {
      await tx.query(`DELETE FROM plan_items WHERE user_id=$1 AND status='planned' AND scheduled_for >= $2::date`, [uid, today]);
      for (const i of plan.items) {
        await tx.query(`INSERT INTO plan_items (user_id, exam_id, subject_id, lesson_id, kind, title, scheduled_for, minutes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [uid, i.examId, i.subjectId, i.lessonId, i.kind, i.title, i.scheduledFor, i.minutes]);
      }
    });
    return { created: plan.items.length, unscheduledLessons: plan.unscheduledLessons.length, hasLessons: lessons.length > 0 };
  });

  const itemView = (r: any) => ({ id: r.id, kind: r.kind, title: r.title, subjectId: r.subject_id, lessonId: r.lesson_id, examId: r.exam_id, scheduledFor: r.d, minutes: r.minutes, status: r.status, completedAt: r.completed_at, rescheduledFrom: r.rf });

  app.get('/api/plan', authed, async (req) => {
    const uid = req.user!.id;
    const today = todayIn(await tz(uid));
    const q = parse(z.object({ from: dateStr.optional(), to: dateStr.optional() }), req.query);
    const r = await db.query(
      `SELECT *, to_char(scheduled_for,'YYYY-MM-DD') AS d, to_char(rescheduled_from,'YYYY-MM-DD') AS rf FROM plan_items WHERE user_id=$1 AND scheduled_for BETWEEN $2::date AND $3::date ORDER BY scheduled_for, created_at`,
      [uid, q.from ?? today, q.to ?? new Date(Date.parse(today) + 28 * 86400_000).toISOString().slice(0, 10)],
    );
    return { today, items: r.rows.map(itemView) };
  });

  app.patch('/api/plan/items/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const b = parse(z.object({ status: z.enum(['planned', 'done', 'skipped']).optional(), scheduledFor: dateStr.optional() }), req.body);
    const uid = req.user!.id;
    const cur = await db.query(`SELECT to_char(scheduled_for,'YYYY-MM-DD') AS d FROM plan_items WHERE id=$1 AND user_id=$2`, [id, uid]);
    if (!cur.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Eintrag nicht gefunden.');
    if (b.scheduledFor && b.scheduledFor < todayIn(await tz(uid))) throw badRequest('DATE_IN_PAST', 'Das neue Datum liegt in der Vergangenheit.');
    await db.query(
      `UPDATE plan_items SET status=COALESCE($3,status), completed_at = CASE WHEN $3='done' THEN now() WHEN $3 IN ('planned','skipped') THEN NULL ELSE completed_at END,
        rescheduled_from = CASE WHEN $4::date IS NOT NULL AND $4::date <> scheduled_for THEN scheduled_for ELSE rescheduled_from END,
        scheduled_for = COALESCE($4::date, scheduled_for) WHERE id=$1 AND user_id=$2`,
      [id, uid, b.status ?? null, b.scheduledFor ?? null],
    );
    const r = await db.query(`SELECT *, to_char(scheduled_for,'YYYY-MM-DD') AS d, to_char(rescheduled_from,'YYYY-MM-DD') AS rf FROM plan_items WHERE id=$1`, [id]);
    return itemView(r.rows[0]);
  });

  // ---- progress (only real recorded activity)
  async function progressFor(uid: string, today: string) {
    const [lessons, programs, time, topics, plan] = await Promise.all([
      db.query(`SELECT count(*)::int AS n FROM lesson_progress WHERE user_id=$1 AND status='completed'`, [uid]),
      db.query(
        `SELECT count(*) FILTER (WHERE started > 0)::int AS started, count(*) FILTER (WHERE total > 0 AND done = total)::int AS completed FROM (
           SELECT p.id, (SELECT count(*) FROM lessons l WHERE l.program_id=p.id) AS total,
                  (SELECT count(*) FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id WHERE l.program_id=p.id AND lp.user_id=$1) AS started,
                  (SELECT count(*) FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id WHERE l.program_id=p.id AND lp.user_id=$1 AND lp.status='completed') AS done
           FROM learning_programs p WHERE p.user_id=$1) x`, [uid]),
      db.query(`SELECT COALESCE(sum(seconds),0)::int AS s FROM study_sessions WHERE user_id=$1`, [uid]),
      db.query(`SELECT count(DISTINCT p.topic_id)::int AS n FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id JOIN learning_programs p ON p.id=l.program_id WHERE lp.user_id=$1 AND lp.status='completed' AND p.topic_id IS NOT NULL`, [uid]),
      db.query(`SELECT count(*) FILTER (WHERE status='done')::int AS done, count(*) FILTER (WHERE scheduled_for <= $2::date)::int AS due FROM plan_items WHERE user_id=$1`, [uid, today]),
    ]);
    const p: any = plan.rows[0];
    return {
      lessonsCompleted: (lessons.rows[0] as any).n,
      programsStarted: (programs.rows[0] as any).started,
      programsCompleted: (programs.rows[0] as any).completed,
      studySeconds: (time.rows[0] as any).s,
      topicsReviewed: (topics.rows[0] as any).n,
      planItemsDone: p.done,
      planItemsDue: p.due,
    };
  }

  app.get('/api/progress', authed, async (req) => progressFor(req.user!.id, todayIn(await tz(req.user!.id))));

  app.get('/api/dashboard', authed, async (req) => {
    const uid = req.user!.id;
    const profile = await getProfile(db, uid);
    const today = todayIn(profile?.time_zone ?? 'Europe/Berlin');
    const [progress, subjects, exams, planToday, docs, cont] = await Promise.all([
      progressFor(uid, today),
      db.query(
        `SELECT s.id, s.name_de, s.name_en, s.icon, s.color,
           (SELECT count(*)::int FROM documents d WHERE d.user_id=$1 AND d.subject_id=s.id) AS documents,
           (SELECT count(*)::int FROM lessons l JOIN learning_programs p ON p.id=l.program_id WHERE p.user_id=$1 AND p.subject_id=s.id) AS lessons,
           (SELECT count(*)::int FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id JOIN learning_programs p ON p.id=l.program_id WHERE lp.user_id=$1 AND p.subject_id=s.id AND lp.status='completed') AS completed
         FROM subjects s JOIN user_subjects us ON us.subject_id=s.id AND us.user_id=$1 ORDER BY s.sort_order, s.name_de`, [uid]),
      db.query(`SELECT id, subject_id, title, to_char(exam_date,'YYYY-MM-DD') AS d, (exam_date - $2::date)::int AS days_left FROM exams WHERE user_id=$1 AND exam_date >= $2::date ORDER BY exam_date LIMIT 5`, [uid, today]),
      db.query(`SELECT *, to_char(scheduled_for,'YYYY-MM-DD') AS d, to_char(rescheduled_from,'YYYY-MM-DD') AS rf FROM plan_items WHERE user_id=$1 AND scheduled_for=$2::date ORDER BY created_at`, [uid, today]),
      db.query(`SELECT d.id, d.name, d.subject_id, d.created_at, (SELECT status FROM processing_jobs j WHERE j.document_id=d.id ORDER BY created_at DESC, attempt DESC LIMIT 1) AS status FROM documents d WHERE d.user_id=$1 ORDER BY d.created_at DESC LIMIT 5`, [uid]),
      db.query(
        `WITH last AS (
           SELECT l.program_id FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id WHERE lp.user_id=$1 ORDER BY COALESCE(lp.completed_at, lp.started_at) DESC LIMIT 1
         ), prog AS (
           SELECT COALESCE((SELECT program_id FROM last), (SELECT id FROM learning_programs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1)) AS id
         )
         SELECT l.id, l.title, p.title AS program_title, p.id AS program_id FROM lessons l JOIN learning_programs p ON p.id=l.program_id
         LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=$1
         WHERE l.program_id=(SELECT id FROM prog) AND COALESCE(lp.status,'') <> 'completed' ORDER BY l.ordinal LIMIT 1`, [uid]),
    ]);
    return {
      displayName: profile?.display_name ?? null,
      today,
      continueLearning: cont.rows[0] ? { lessonId: (cont.rows[0] as any).id, title: (cont.rows[0] as any).title, programId: (cont.rows[0] as any).program_id, programTitle: (cont.rows[0] as any).program_title } : null,
      subjects: subjects.rows.map((s: any) => ({ id: s.id, nameDe: s.name_de, nameEn: s.name_en, icon: s.icon, color: s.color, documents: s.documents, lessons: s.lessons, completed: s.completed })),
      upcomingExams: exams.rows.map((e: any) => ({ id: e.id, subjectId: e.subject_id, title: e.title, examDate: e.d, daysLeft: e.days_left })),
      todayPlan: planToday.rows.map(itemView),
      recentDocuments: docs.rows,
      progress,
    };
  });
}
