import type { Db } from '../db/db';
import type { ObjectStorage } from '../storage';
import type { LlmProvider } from '../ai/llm';
import { analyzeDocument, type PipelineDeps } from '../ai/pipeline';
import { extract, ExtractionError } from './extract';
import type { FileKind } from './validate';
import { HttpError } from '../errors';
import { assertMaySendToAi } from '../services/guards';

interface JobRow {
  id: string;
  document_id: string;
  user_id: string;
}

export class JobRunner {
  private queue: string[] = [];
  private running = 0;
  private idleWaiters: (() => void)[] = [];
  constructor(
    private db: Db,
    private storage: ObjectStorage,
    private llm: LlmProvider | null,
    private pipeline: PipelineDeps,
    private opts: { concurrency?: number; log?: (msg: string, extra?: object) => void } = {},
  ) {}

  enqueue(jobId: string) {
    this.queue.push(jobId);
    this.pump();
  }

  /** On startup: fail jobs that were interrupted mid-run, re-enqueue queued ones. */
  async recover() {
    await this.db.query(
      `UPDATE processing_jobs SET status='failed', error_code='INTERRUPTED', error_message='Die Verarbeitung wurde durch einen Neustart unterbrochen. Bitte erneut versuchen.', finished_at=now() WHERE status IN ('processing','analyzing','uploading')`,
    );
    const q = await this.db.query<{ id: string }>(`SELECT id FROM processing_jobs WHERE status='queued' ORDER BY created_at`);
    q.rows.forEach((r) => this.enqueue(r.id));
  }

  /** Resolves when the queue is empty and nothing is running (used by tests). */
  drain(): Promise<void> {
    if (!this.queue.length && !this.running) return Promise.resolve();
    return new Promise((res) => this.idleWaiters.push(res));
  }

  private pump() {
    const max = this.opts.concurrency ?? 2;
    while (this.running < max && this.queue.length) {
      const id = this.queue.shift()!;
      this.running++;
      this.run(id)
        .catch((e) => this.opts.log?.('job crashed', { jobId: id, err: (e as Error).message }))
        .finally(() => {
          this.running--;
          if (!this.queue.length && !this.running) this.idleWaiters.splice(0).forEach((r) => r());
          this.pump();
        });
    }
  }

  private async setStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    const sets = ['status=$2'];
    const vals: unknown[] = [id, status];
    for (const [k, v] of Object.entries(extra)) {
      vals.push(v);
      sets.push(`${k}=$${vals.length}`);
    }
    await this.db.query(`UPDATE processing_jobs SET ${sets.join(', ')} WHERE id=$1`, vals);
  }

  private async fail(id: string, code: string, message: string) {
    await this.setStatus(id, 'failed', { error_code: code, error_message: message, finished_at: new Date() });
  }

  private async run(jobId: string) {
    const jr = await this.db.query<JobRow & { storage_key: string; mime_type: string; subject_id: string | null; original_filename: string }>(
      `SELECT j.id, j.document_id, j.user_id, d.storage_key, d.mime_type, d.subject_id, d.original_filename
       FROM processing_jobs j JOIN documents d ON d.id=j.document_id WHERE j.id=$1`,
      [jobId],
    );
    const job = jr.rows[0];
    if (!job) return; // document was deleted meanwhile
    await this.setStatus(jobId, 'processing', { started_at: new Date(), error_code: null, error_message: null });

    // ---- Stage 1: extract
    const kind = (
      { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/heic': 'heic', 'text/plain': 'txt', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' } as Record<string, FileKind>
    )[job.mime_type];
    try {
      const data = await this.storage.get(job.storage_key);
      if (kind === 'png' || kind === 'jpeg') await assertMaySendToAi(this.db, job.user_id, job.document_id); // OCR sends the image to the provider
      const ex = await extract(kind, data, this.llm);
      if (!ex.segments.length) throw new ExtractionError('NO_TEXT', 'Im Dokument wurde kein Text gefunden.');
      await this.db.tx(async (tx) => {
        await tx.query(`DELETE FROM document_segments WHERE document_id=$1`, [job.document_id]);
        let i = 0;
        for (const s of ex.segments) {
          await tx.query(`INSERT INTO document_segments (document_id, user_id, ordinal, page, heading, text) VALUES ($1,$2,$3,$4,$5,$6)`, [job.document_id, job.user_id, i++, s.page, s.heading, s.text]);
        }
        await tx.query(`UPDATE documents SET page_count=$2 WHERE id=$1`, [job.document_id, ex.pageCount]);
      });
    } catch (e) {
      if (e instanceof ExtractionError) return this.fail(jobId, e.code, e.message);
      if (e instanceof HttpError) return this.fail(jobId, e.code, e.message);
      return this.fail(jobId, 'EXTRACTION_FAILED', 'Der Inhalt konnte nicht gelesen werden.');
    }

    // ---- Stage 2: analyze (honest about being skipped)
    await this.setStatus(jobId, 'analyzing');
    let analysis: { state: 'done' | 'skipped' | 'failed'; note: string | null } = { state: 'skipped', note: null };
    if (!this.pipeline.llm) analysis = { state: 'skipped', note: 'Kein KI-Anbieter konfiguriert – der Text wurde gelesen, aber noch nicht analysiert.' };
    else {
      try {
        const p = await this.db.query<{ grade: number }>(`SELECT grade FROM student_profiles WHERE user_id=$1`, [job.user_id]);
        const r = await analyzeDocument(this.pipeline, { userId: job.user_id, documentId: job.document_id, subjectId: job.subject_id, grade: p.rows[0]?.grade ?? 8 });
        analysis = { state: 'done', note: `${r.concepts} Konzepte und ${r.objectives} Lernziele erkannt.` };
      } catch (e) {
        if (e instanceof HttpError && e.code === 'AI_CONSENT_REQUIRED') analysis = { state: 'skipped', note: 'Die Einwilligung in die KI-Verarbeitung fehlt – Analyse übersprungen.' };
        else analysis = { state: 'failed', note: e instanceof HttpError ? e.message : 'Die Analyse ist fehlgeschlagen. Du kannst sie erneut starten.' };
      }
    }
    await this.setStatus(jobId, 'completed', { analysis_state: analysis.state, analysis_note: analysis.note, finished_at: new Date() });
  }
}
