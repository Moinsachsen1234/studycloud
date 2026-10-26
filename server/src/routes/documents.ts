import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app';
import { parse, uuid } from '../app';
import { HttpError, badRequest } from '../errors';
import { safeFilename, validateUpload } from '../documents/validate';

const docSelect = `
  d.id, d.name, d.original_filename, d.mime_type, d.size_bytes, d.subject_id, d.topic_id, d.collection_id, d.page_count, d.created_at,
  j.id AS job_id, j.status AS job_status, j.analysis_state, j.analysis_note, j.error_code, j.error_message, j.attempt, j.created_at AS job_created_at, j.started_at, j.finished_at`;
const docFrom = `FROM documents d LEFT JOIN LATERAL (SELECT * FROM processing_jobs WHERE document_id=d.id ORDER BY created_at DESC, attempt DESC LIMIT 1) j ON true`;

function docView(r: any) {
  return {
    id: r.id,
    name: r.name,
    originalFilename: r.original_filename,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    subjectId: r.subject_id,
    topicId: r.topic_id,
    collectionId: r.collection_id,
    pageCount: r.page_count,
    createdAt: r.created_at,
    // NOTE: no storage key, no URL. Files are only reachable via the authorized /file endpoint.
    job: r.job_id && {
      id: r.job_id,
      status: r.job_status,
      analysisState: r.analysis_state,
      analysisNote: r.analysis_note,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      attempt: r.attempt,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    },
  };
}

export async function documentRoutes(app: FastifyInstance, ctx: AppContext, authed: { preHandler: any }) {
  const { db, storage, config } = ctx;

  app.post('/api/documents', { ...authed, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!req.isMultipart()) throw badRequest('MULTIPART_REQUIRED', 'Bitte als Formular-Upload senden.');
    const fields: Record<string, string> = {};
    let file: { filename: string; mimetype: string; data: Buffer } | null = null;
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (file) throw badRequest('TOO_MANY_FILES', 'Bitte nur eine Datei pro Upload.');
          file = { filename: part.filename, mimetype: part.mimetype, data: await part.toBuffer() }; // throws on size limit
        } else fields[part.fieldname] = String(part.value);
      }
    } catch (e: any) {
      if (e instanceof HttpError || e?.code === 'FST_REQ_FILE_TOO_LARGE') throw e;
      throw badRequest('MALFORMED_UPLOAD', 'Der Upload konnte nicht gelesen werden.');
    }
    if (!file) throw badRequest('NO_FILE', 'Keine Datei empfangen.');
    const f = parse(z.object({ subjectId: z.string().max(60), topicId: uuid.optional().or(z.literal('')), collectionId: uuid.optional().or(z.literal('')), name: z.string().max(150).optional(), rightsAck: z.literal('true') }), fields);

    const uid = req.user!.id;
    const subj = await db.query(`SELECT 1 FROM subjects WHERE id=$1 AND (owner_user_id IS NULL OR owner_user_id=$2)`, [f.subjectId, uid]);
    if (!subj.rows[0]) throw badRequest('INVALID_SUBJECT', 'Unbekanntes Fach.');
    if (f.topicId) {
      const t = await db.query(`SELECT 1 FROM topics WHERE id=$1 AND user_id=$2 AND subject_id=$3`, [f.topicId, uid, f.subjectId]);
      if (!t.rows[0]) throw badRequest('INVALID_TOPIC', 'Unbekanntes Thema.');
    }
    if (f.collectionId) {
      const c = await db.query(`SELECT 1 FROM collections WHERE id=$1 AND user_id=$2`, [f.collectionId, uid]);
      if (!c.rows[0]) throw badRequest('INVALID_COLLECTION', 'Unbekannte Sammlung.');
    }
    const v = validateUpload(file.filename, file.mimetype, file.data, config.maxUploadBytes);
    if (!v.ok) throw new HttpError(v.code === 'FILE_TOO_LARGE' ? 413 : 415, v.code, v.message);

    const original = safeFilename(file.filename);
    const key = await storage.put(uid, file.data);
    let docId: string;
    let jobId: string;
    try {
      const out = await db.tx(async (tx) => {
        const d = await tx.query<{ id: string }>(
          `INSERT INTO documents (user_id, subject_id, topic_id, collection_id, name, original_filename, mime_type, size_bytes, sha256, storage_key, rights_acknowledged_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now()) RETURNING id`,
          [uid, f.subjectId, f.topicId || null, f.collectionId || null, (f.name?.trim() || original).slice(0, 150), original, v.mime, file.data.length, crypto.createHash('sha256').update(file.data).digest('hex'), key],
        );
        const j = await tx.query<{ id: string }>(`INSERT INTO processing_jobs (document_id, user_id, status) VALUES ($1,$2,'queued') RETURNING id`, [d.rows[0].id, uid]);
        return { d: d.rows[0].id, j: j.rows[0].id };
      });
      docId = out.d;
      jobId = out.j;
    } catch (e) {
      await storage.delete(key);
      throw e;
    }
    ctx.jobs.enqueue(jobId);
    const r = await db.query(`SELECT ${docSelect} ${docFrom} WHERE d.id=$1`, [docId]);
    return reply.status(201).send(docView(r.rows[0]));
  });

  app.get('/api/documents', authed, async (req) => {
    const q = parse(z.object({ query: z.string().max(100).optional(), subjectId: z.string().max(60).optional(), topicId: uuid.optional(), status: z.enum(['queued', 'uploading', 'processing', 'analyzing', 'completed', 'failed']).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
    const args: unknown[] = [req.user!.id];
    const where = ['d.user_id=$1'];
    if (q.subjectId) { args.push(q.subjectId); where.push(`d.subject_id=$${args.length}`); }
    if (q.topicId) { args.push(q.topicId); where.push(`d.topic_id=$${args.length}`); }
    if (q.query) {
      args.push(`%${q.query.replace(/[%_\\]/g, '\\$&')}%`);
      where.push(`(d.name ILIKE $${args.length} OR EXISTS (SELECT 1 FROM document_segments s WHERE s.document_id=d.id AND s.text ILIKE $${args.length}))`);
    }
    if (q.status) { args.push(q.status); where.push(`j.status=$${args.length}`); }
    args.push(q.limit);
    const r = await db.query(`SELECT ${docSelect} ${docFrom} WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC LIMIT $${args.length}`, args);
    return { documents: r.rows.map(docView) };
  });

  async function ownedDoc(userId: string, id: string) {
    const r = await db.query(`SELECT ${docSelect}, d.storage_key ${docFrom} WHERE d.id=$1 AND d.user_id=$2`, [id, userId]);
    if (!r.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Dokument nicht gefunden.'); // 404, not 403: don't reveal existence
    return r.rows[0];
  }

  app.get('/api/documents/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const r = await ownedDoc(req.user!.id, id);
    const [concepts, objectives, programs] = await Promise.all([
      db.query(`SELECT id, kind, name, description FROM concepts WHERE document_id=$1 AND user_id=$2 ORDER BY kind, name`, [id, req.user!.id]),
      db.query(`SELECT id, text FROM learning_objectives WHERE document_id=$1 AND user_id=$2 AND program_id IS NULL`, [id, req.user!.id]),
      db.query(`SELECT p.id, p.title FROM learning_programs p JOIN program_documents pd ON pd.program_id=p.id WHERE pd.document_id=$1 AND p.user_id=$2`, [id, req.user!.id]),
    ]);
    return { ...docView(r), concepts: concepts.rows, objectives: objectives.rows, programs: programs.rows };
  });

  app.get('/api/documents/:id/text', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    await ownedDoc(req.user!.id, id);
    const r = await db.query(`SELECT id, ordinal, page, heading, text FROM document_segments WHERE document_id=$1 AND user_id=$2 ORDER BY ordinal`, [id, req.user!.id]);
    return { segments: r.rows };
  });

  /** Authorized in-app preview/download. Never a public or signed-public URL. */
  app.get('/api/documents/:id/file', authed, async (req, reply) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const d = await ownedDoc(req.user!.id, id);
    const data = await storage.get(d.storage_key);
    const inline = ['application/pdf', 'image/png', 'image/jpeg'].includes(d.mime_type);
    return reply
      .header('content-type', d.mime_type)
      .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.original_filename)}`)
      .header('cache-control', 'private, no-store')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .send(data);
  });

  app.patch('/api/documents/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const b = parse(z.object({ name: z.string().trim().min(1).max(150).optional(), subjectId: z.string().max(60).optional(), topicId: uuid.nullable().optional(), collectionId: uuid.nullable().optional() }), req.body);
    await ownedDoc(req.user!.id, id);
    const uid = req.user!.id;
    if (b.subjectId) {
      const s = await db.query(`SELECT 1 FROM subjects WHERE id=$1 AND (owner_user_id IS NULL OR owner_user_id=$2)`, [b.subjectId, uid]);
      if (!s.rows[0]) throw badRequest('INVALID_SUBJECT', 'Unbekanntes Fach.');
    }
    if (b.topicId) {
      const t = await db.query(`SELECT 1 FROM topics WHERE id=$1 AND user_id=$2`, [b.topicId, uid]);
      if (!t.rows[0]) throw badRequest('INVALID_TOPIC', 'Unbekanntes Thema.');
    }
    if (b.collectionId) {
      const c = await db.query(`SELECT 1 FROM collections WHERE id=$1 AND user_id=$2`, [b.collectionId, uid]);
      if (!c.rows[0]) throw badRequest('INVALID_COLLECTION', 'Unbekannte Sammlung.');
    }
    await db.query(
      `UPDATE documents SET name=COALESCE($3,name), subject_id=COALESCE($4,subject_id),
        topic_id = CASE WHEN $5::boolean THEN $6::uuid ELSE topic_id END, collection_id = CASE WHEN $7::boolean THEN $8::uuid ELSE collection_id END WHERE id=$1 AND user_id=$2`,
      [id, uid, b.name ?? null, b.subjectId ?? null, 'topicId' in b, b.topicId ?? null, 'collectionId' in b, b.collectionId ?? null],
    );
    return docView(await ownedDoc(uid, id));
  });

  app.delete('/api/documents/:id', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const d = await ownedDoc(req.user!.id, id);
    await db.query(`DELETE FROM documents WHERE id=$1 AND user_id=$2`, [id, req.user!.id]);
    await storage.delete(d.storage_key);
    return { ok: true };
  });

  app.post('/api/documents/:id/retry', authed, async (req) => {
    const id = parse(z.object({ id: uuid }), req.params).id;
    const d = await ownedDoc(req.user!.id, id);
    const retryable = d.job_status === 'failed' || (d.job_status === 'completed' && d.analysis_state !== 'done');
    if (!retryable) throw new HttpError(409, 'NOT_RETRYABLE', 'Dieses Dokument wird gerade verarbeitet oder wurde vollständig analysiert.');
    const j = await db.query<{ id: string }>(`INSERT INTO processing_jobs (document_id, user_id, status, attempt) VALUES ($1,$2,'queued',$3) RETURNING id`, [id, req.user!.id, (d.attempt ?? 1) + 1]);
    ctx.jobs.enqueue(j.rows[0].id);
    return docView(await ownedDoc(req.user!.id, id));
  });
}
