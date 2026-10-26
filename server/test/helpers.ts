import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import type { FastifyInstance } from 'fastify';
import { openPglite, type Db } from '../src/db/db';
import { loadConfig } from '../src/config';
import { LocalFsStorage } from '../src/storage';
import type { LlmProvider, LlmRequest } from '../src/ai/llm';
import { wikipediaProvider } from '../src/research/providers';
import { ResearchService } from '../src/research/researchService';
import { SourceVerificationService } from '../src/research/verification';
import { JobRunner } from '../src/documents/jobs';
import { buildApp, seedSubjects, type AppContext } from '../src/app';
import type { PipelineDeps } from '../src/ai/pipeline';

export async function makeDb(): Promise<Db> {
  return openPglite();
}

export const NEWTON_TEXT =
  'Das zweite newtonsche Gesetz besagt, dass die Beschleunigung eines Körpers proportional zur resultierenden Kraft und umgekehrt proportional zu seiner Masse ist. ' +
  'In der Formel F = m · a steht F für die Kraft in Newton. Ein Newton entspricht der Kraft, die einem Körper der Masse 1 Kilogramm die Beschleunigung 1 Meter pro Sekunde zum Quadrat erteilt.';

export interface FakeWikiCalls {
  count: number;
  urls: string[];
}

/** FIXTURE shaped like MediaWiki Action API responses. Used only in offline unit tests. */
export function fakeWikiFetch(opts: { text?: string; revTimestamp?: string; rightsUrl?: string; calls?: FakeWikiCalls } = {}) {
  const text = opts.text ?? NEWTON_TEXT;
  const calls = opts.calls ?? { count: 0, urls: [] };
  const impl = async (url: string) => {
    calls.count++;
    calls.urls.push(url);
    const u = new URL(url);
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
    if (u.searchParams.get('list') === 'search') return json({ query: { search: [{ title: 'Newtonsche Gesetze' }] } });
    return json({
      query: {
        rightsinfo: { url: opts.rightsUrl ?? 'https://creativecommons.org/licenses/by-sa/4.0/', text: 'Creative Commons Attribution-ShareAlike 4.0 License' },
        pages: [
          {
            title: 'Newtonsche Gesetze',
            canonicalurl: 'https://de.wikipedia.org/wiki/Newtonsche_Gesetze',
            extract: text,
            revisions: [{ revid: 123456, timestamp: opts.revTimestamp ?? '2026-05-01T08:30:00Z' }],
          },
        ],
      },
    });
  };
  return { impl: impl as any, calls };
}

/** TEST DOUBLE ONLY — never used by the server runtime. */
export class ScriptedLlm implements LlmProvider {
  name = 'scripted-test-llm';
  model = 'test';
  calls: LlmRequest[] = [];
  constructor(public respond: (kind: 'objectives' | 'program' | 'analysis' | 'tutor', req: LlmRequest) => unknown) {}
  async complete(req: LlmRequest) {
    this.calls.push(req);
    const kind = req.user.includes('derive 3-6 concrete learning objectives') ? 'objectives' : req.user.includes('Write a learning program') ? 'program' : req.user.includes('Analyze the student') ? 'analysis' : 'tutor';
    return JSON.stringify(this.respond(kind, req));
  }
}

export interface TestApp {
  app: FastifyInstance;
  ctx: AppContext;
  llm: ScriptedLlm | null;
  wiki: ReturnType<typeof fakeWikiFetch>;
  close(): Promise<void>;
}

export async function makeApp(opts: { llm?: ScriptedLlm | null; research?: boolean; env?: Record<string, string> } = {}): Promise<TestApp> {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'sc-test-'));
  const config = { ...loadConfig({ PORT: '0', DATA_DIR: dir, ...(opts.env ?? {}) } as any), port: 0 };
  const db = await openPglite();
  await seedSubjects(db);
  const storage = new LocalFsStorage(path.join(dir, 'objects'));
  const wiki = fakeWikiFetch();
  const llm = opts.llm === undefined ? null : opts.llm;
  const research = opts.research ? new ResearchService(db, [wikipediaProvider], { cacheTtlHours: 24, userAgent: 'test', fetchImpl: wiki.impl }) : null;
  const verifier = research ? new SourceVerificationService(db, [wikipediaProvider]) : null;
  const pipeline: PipelineDeps = { db, llm, research, verifier, dailyAiCallLimit: config.dailyAiCallLimit };
  const jobs = new JobRunner(db, storage, llm, pipeline);
  const ctx: AppContext = { db, config, storage, llm, research, verifier, jobs, pipeline };
  const app = await buildApp(ctx);
  return {
    app, ctx, llm, wiki,
    async close() {
      await app.close();
      await db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function multipart(fields: Record<string, string>, file?: { name: string; type: string; data: Buffer }) {
  const b = '----scTestBoundary' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    parts.push(file.data, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}

export function makeDocx(paragraphs: string[]): Buffer {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
    .map((p) => (p.startsWith('# ') ? `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${p.slice(2)}</w:t></w:r></w:p>` : `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`))
    .join('')}</w:body></w:document>`;
  const ct = `<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  return Buffer.from(zipSync({ '[Content_Types].xml': strToU8(ct), 'word/document.xml': strToU8(xml) }));
}

/** Minimal valid-enough PDF with one text line (pdf.js reconstructs the xref). */
export function makePdf(text: string): Buffer {
  const stream = text ? `BT /F1 12 Tf 50 700 Td (${text.replace(/[()\\]/g, '')}) Tj ET` : '';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

export async function register(t: TestApp, email: string, opts: { birthYear?: number; guardian?: boolean; aiConsent?: boolean } = {}) {
  const r = await t.app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { email, password: 'correct-horse-battery', birthYear: opts.birthYear ?? 2010, acceptPrivacy: true, guardianConsent: opts.guardian ?? true, aiConsent: opts.aiConsent ?? false },
  });
  if (r.statusCode !== 201) throw new Error('register failed ' + r.body);
  const j = r.json();
  return { token: j.token as string, id: j.user.id as string, h: { authorization: `Bearer ${j.token}` } };
}

export async function onboard(t: TestApp, h: Record<string, string>, over: Record<string, unknown> = {}) {
  const r = await t.app.inject({
    method: 'PUT', url: '/api/me/profile', headers: h,
    payload: { displayName: 'Mia', grade: 8, uiLanguage: 'de', federalState: 'NW', schoolType: 'gymnasium', learningGoals: ['Klassenarbeit bestehen'], subjectIds: ['math', 'physics'], ...over },
  });
  if (r.statusCode !== 200) throw new Error('onboard failed ' + r.body);
  return r.json();
}

export async function upload(t: TestApp, h: Record<string, string>, file: { name: string; type: string; data: Buffer }, fields: Record<string, string> = {}) {
  const m = multipart({ subjectId: 'physics', rightsAck: 'true', ...fields }, file);
  return t.app.inject({ method: 'POST', url: '/api/documents', headers: { ...h, ...m.headers }, payload: m.payload });
}

export async function uploadText(t: TestApp, h: Record<string, string>, text: string, name = 'notizen.txt') {
  const r = await upload(t, h, { name, type: 'text/plain', data: Buffer.from(text, 'utf8') });
  if (r.statusCode !== 201) throw new Error('upload failed ' + r.body);
  await t.ctx.jobs.drain();
  return r.json().id as string;
}
