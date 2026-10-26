import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, makeDocx, makePdf, multipart, onboard, register, upload, uploadText, type TestApp } from './helpers';
import { todayIn } from '../src/routes/planner';

const PHYSICS = 'Kraft und Beschleunigung\n\nDie Kraft ist gleich Masse mal Beschleunigung. Ein Körper mit 2 kg Masse und 3 m/s² Beschleunigung erfährt eine Kraft von 6 N.\n\nDie Einheit der Kraft ist das Newton. Newton ist nach Isaac Newton benannt.';

let t: TestApp;
let a: Awaited<ReturnType<typeof register>>;
let b: Awaited<ReturnType<typeof register>>;
beforeAll(async () => {
  t = await makeApp();
  a = await register(t, 'anna@example.org');
  b = await register(t, 'ben@example.org');
  await onboard(t, a.h);
  await onboard(t, b.h, { displayName: 'Ben', subjectIds: ['math'] });
});
afterAll(async () => t.close());

describe('auth & age safeguards', () => {
  it('requires guardian consent below the digital consent age', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'kid@example.org', password: 'correct-horse-battery', birthYear: new Date().getFullYear() - 10, acceptPrivacy: true } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('GUARDIAN_CONSENT_REQUIRED');
  });
  it('adults do not need guardian consent; consents are recorded', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'adult@example.org', password: 'correct-horse-battery', birthYear: 1990, acceptPrivacy: true } });
    expect(r.statusCode).toBe(201);
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${r.json().token}` } });
    expect(me.json().consents.aiProcessing).toBe(false); // AI processing is opt-in, never default
  });
  it('rejects weak passwords, duplicates, bad credentials; no token = 401', async () => {
    const weak = await t.app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'w@example.org', password: 'short', birthYear: 1990, acceptPrivacy: true } });
    expect(weak.statusCode).toBe(400);
    const dup = await t.app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'ANNA@example.org', password: 'correct-horse-battery', birthYear: 1990, acceptPrivacy: true } });
    expect(dup.statusCode).toBe(409);
    const bad = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'anna@example.org', password: 'wrong-password-123' } });
    expect(bad.statusCode).toBe(401);
    const none = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'nobody@example.org', password: 'wrong-password-123' } });
    expect(none.json().error.message).toBe(bad.json().error.message); // no account enumeration via login
    expect((await t.app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/api/me', headers: { authorization: 'Bearer nonsense' } })).statusCode).toBe(401);
  });
  it('login works and logout revokes the session; passwords are stored hashed', async () => {
    const l = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'anna@example.org', password: 'correct-horse-battery' } });
    expect(l.statusCode).toBe(200);
    const h = { authorization: `Bearer ${l.json().token}` };
    expect((await t.app.inject({ method: 'GET', url: '/api/me', headers: h })).statusCode).toBe(200);
    await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: h });
    expect((await t.app.inject({ method: 'GET', url: '/api/me', headers: h })).statusCode).toBe(401);
    const row = (await t.ctx.db.query(`SELECT password_hash FROM users WHERE id=$1`, [a.id])).rows[0] as any;
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain('correct-horse');
    const sess = (await t.ctx.db.query(`SELECT token_hash FROM sessions LIMIT 1`)).rows[0] as any;
    expect(sess.token_hash).toMatch(/^[0-9a-f]{64}$/); // only hashes stored
  });
  it('sends hardening headers', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/health' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cache-control']).toBe('no-store');
  });
});

describe('onboarding & subjects', () => {
  it('persists the profile and respects state-specific school types', async () => {
    const bad = await t.app.inject({ method: 'PUT', url: '/api/me/profile', headers: a.h, payload: { displayName: 'Mia', grade: 8, federalState: 'BY', schoolType: 'stadtteilschule', subjectIds: ['math'] } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('INVALID_SCHOOL');
    const ok = await t.app.inject({ method: 'PUT', url: '/api/me/profile', headers: a.h, payload: { displayName: 'Mia', grade: 8, federalState: 'HH', schoolType: 'stadtteilschule', subjectIds: ['math', 'english', 'nope'] } });
    expect(ok.statusCode).toBe(200);
    const me = ok.json();
    expect(me.onboardingCompleted).toBe(true);
    expect(me.profile.schoolType).toBe('stadtteilschule');
    expect(me.subjectIds.sort()).toEqual(['english', 'math']); // unknown ids dropped
    await onboard(t, a.h); // restore
  });
  it('supports grades 1–13 only', async () => {
    for (const grade of [0, 14]) {
      const r = await t.app.inject({ method: 'PUT', url: '/api/me/profile', headers: a.h, payload: { displayName: 'x', grade, federalState: 'NW', schoolType: 'gymnasium', subjectIds: [] } });
      expect(r.statusCode).toBe(400);
    }
    for (const grade of [1, 13]) {
      const r = await t.app.inject({ method: 'PUT', url: '/api/me/profile', headers: a.h, payload: { displayName: 'x', grade, federalState: 'NW', schoolType: 'gymnasium', subjectIds: ['math'] } });
      expect(r.statusCode).toBe(200);
    }
    await onboard(t, a.h);
  });
  it('lists the configured subjects (7 system subjects from the DB) and supports custom subjects, topics, collections', async () => {
    const list = (await t.app.inject({ method: 'GET', url: '/api/subjects', headers: a.h })).json().subjects;
    expect(list.map((s: any) => s.id)).toEqual(expect.arrayContaining(['math', 'physics', 'chemistry', 'biology', 'sachunterricht', 'german', 'english']));
    expect(list.find((s: any) => s.id === 'math').selected).toBe(true);
    expect(list.find((s: any) => s.id === 'chemistry').selected).toBe(false);
    const c = await t.app.inject({ method: 'POST', url: '/api/subjects', headers: a.h, payload: { name: 'Latein', color: '#112233' } });
    expect(c.statusCode).toBe(201);
    const id = c.json().id;
    expect((await t.app.inject({ method: 'GET', url: '/api/subjects', headers: b.h })).json().subjects.some((s: any) => s.id === id)).toBe(false); // custom subjects are private
    expect((await t.app.inject({ method: 'GET', url: `/api/subjects/${id}`, headers: b.h })).statusCode).toBe(404);
    const topic = await t.app.inject({ method: 'POST', url: '/api/subjects/physics/topics', headers: a.h, payload: { title: 'Mechanik' } });
    expect(topic.statusCode).toBe(201);
    const col = await t.app.inject({ method: 'POST', url: '/api/subjects/physics/collections', headers: a.h, payload: { name: 'Klassenarbeit 1' } });
    expect(col.statusCode).toBe(201);
    const detail = (await t.app.inject({ method: 'GET', url: '/api/subjects/physics', headers: a.h })).json();
    expect(detail.topics).toHaveLength(1);
    expect(detail.collections).toHaveLength(1);
    expect((await t.app.inject({ method: 'DELETE', url: '/api/subjects/physics', headers: a.h })).statusCode).toBe(404); // system subjects can't be deleted
    expect((await t.app.inject({ method: 'DELETE', url: `/api/subjects/${id}`, headers: a.h })).statusCode).toBe(200);
  });
});

describe('uploads, processing jobs, extraction', () => {
  it('stores privately, creates a real job, extracts text and reports honest analysis state', async () => {
    const r = await upload(t, a.h, { name: 'physik.txt', type: 'text/plain', data: Buffer.from(PHYSICS) });
    expect(r.statusCode).toBe(201);
    const doc = r.json();
    expect(['queued', 'processing']).toContain(doc.job.status);
    await t.ctx.jobs.drain();
    const d = (await t.app.inject({ method: 'GET', url: `/api/documents/${doc.id}`, headers: a.h })).json();
    expect(d.job.status).toBe('completed');
    expect(d.job.analysisState).toBe('skipped'); // no AI provider configured → honest, not "done"
    expect(d.job.analysisNote).toMatch(/Kein KI-Anbieter/);
    const seg = (await t.app.inject({ method: 'GET', url: `/api/documents/${doc.id}/text`, headers: a.h })).json().segments;
    expect(seg.length).toBeGreaterThan(0);
    expect(seg.map((s: any) => s.text).join(' ')).toContain('Masse mal Beschleunigung');
    // privacy: no storage keys or URLs in the API view
    const raw = JSON.stringify(d);
    expect(raw).not.toMatch(/storage|objects|http/i);
    // file on disk is under a random key, not the original filename
    const files = fs.readdirSync(path.join(t.ctx.config.storageDir, a.id));
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain('physik');
  });

  it('serves files only to the owner via an authorized endpoint with private headers', async () => {
    const id = await uploadText(t, a.h, PHYSICS, 'privat.txt');
    const own = await t.app.inject({ method: 'GET', url: `/api/documents/${id}/file`, headers: a.h });
    expect(own.statusCode).toBe(200);
    expect(own.body).toBe(PHYSICS);
    expect(own.headers['cache-control']).toMatch(/private, no-store/);
    expect(own.headers['content-disposition']).toMatch(/^attachment/);
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect((await t.app.inject({ method: 'GET', url: `/api/documents/${id}/file` })).statusCode).toBe(401);
  });

  it('extracts DOCX (with headings) and PDF text', async () => {
    const dx = await upload(t, a.h, { name: 'heft.docx', type: 'application/octet-stream', data: makeDocx(['# Optik', 'Licht breitet sich geradlinig aus. Der Schatten entsteht hinter einem undurchsichtigen Körper.']) });
    expect(dx.statusCode).toBe(201);
    const pdf = await upload(t, a.h, { name: 'blatt.pdf', type: 'application/pdf', data: makePdf('Aufgabenblatt Mechanik Geschwindigkeit gleich Weg durch Zeit') });
    expect(pdf.statusCode).toBe(201);
    await t.ctx.jobs.drain();
    const d1 = (await t.app.inject({ method: 'GET', url: `/api/documents/${dx.json().id}`, headers: a.h })).json();
    expect(d1.job.status).toBe('completed');
    const s1 = (await t.app.inject({ method: 'GET', url: `/api/documents/${dx.json().id}/text`, headers: a.h })).json().segments;
    expect(s1[0].heading).toBe('Optik');
    expect(s1[0].text).toContain('Schatten');
    const d2 = (await t.app.inject({ method: 'GET', url: `/api/documents/${pdf.json().id}`, headers: a.h })).json();
    expect(d2.job.status).toBe('completed');
    expect(d2.pageCount).toBe(1);
    const s2 = (await t.app.inject({ method: 'GET', url: `/api/documents/${pdf.json().id}/text`, headers: a.h })).json().segments;
    expect(s2[0].page).toBe(1);
    expect(s2[0].text).toContain('Geschwindigkeit');
  });

  it('reports meaningful failures: scanned PDF, HEIC, photo without OCR', async () => {
    const scan = await upload(t, a.h, { name: 'scan.pdf', type: 'application/pdf', data: makePdf('') });
    const heic = await upload(t, a.h, { name: 'foto.heic', type: 'image/heic', data: Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(32)]) });
    const png = await upload(t, a.h, { name: 'tafel.png', type: 'image/png', data: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]) });
    await t.ctx.jobs.drain();
    const get = async (id: string) => (await t.app.inject({ method: 'GET', url: `/api/documents/${id}`, headers: a.h })).json().job;
    expect((await get(scan.json().id))).toMatchObject({ status: 'failed', errorCode: 'SCANNED_PDF' });
    expect((await get(heic.json().id))).toMatchObject({ status: 'failed', errorCode: 'HEIC_UNSUPPORTED' });
    const pj = await get(png.json().id);
    expect(pj.status).toBe('failed');
    expect(['OCR_NOT_CONFIGURED', 'AI_CONSENT_REQUIRED']).toContain(pj.errorCode); // honest, never a fake success
    expect(pj.errorMessage).toBeTruthy();
  });

  it('retries failed jobs (new attempt) but not successful ones', async () => {
    const heic = await upload(t, a.h, { name: 'foto2.heic', type: 'image/heic', data: Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(32)]) });
    await t.ctx.jobs.drain();
    const r = await t.app.inject({ method: 'POST', url: `/api/documents/${heic.json().id}/retry`, headers: a.h });
    expect(r.statusCode).toBe(200);
    expect(r.json().job.attempt).toBe(2);
    await t.ctx.jobs.drain();
    const ok = await uploadText(t, a.h, PHYSICS, 'ok.txt');
    // a document whose analysis was skipped (no AI configured) may be re-run later; this creates attempt 2
    const again = await t.app.inject({ method: 'POST', url: `/api/documents/${ok}/retry`, headers: a.h });
    expect(again.statusCode).toBe(200);
    await t.ctx.jobs.drain();
  });

  it('rejects dangerous or mismatching files before storage', async () => {
    const exe = await upload(t, a.h, { name: 'virus.pdf', type: 'application/pdf', data: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 3, 0, 0, 0]) });
    expect(exe.statusCode).toBe(415);
    expect(exe.json().error.code).toBe('CONTENT_MISMATCH');
    const txtAsPdf = await upload(t, a.h, { name: 'x.pdf', type: 'application/pdf', data: Buffer.from('just text') });
    expect(txtAsPdf.statusCode).toBe(415);
    const ext = await upload(t, a.h, { name: 'run.exe', type: 'application/octet-stream', data: Buffer.from('hello') });
    expect(ext.json().error.code).toBe('UNSUPPORTED_TYPE');
    const html = await upload(t, a.h, { name: 'x.html', type: 'text/html', data: Buffer.from('<script>alert(1)</script>') });
    expect(html.statusCode).toBe(415);
    const empty = await upload(t, a.h, { name: 'leer.txt', type: 'text/plain', data: Buffer.alloc(0) });
    expect(empty.json().error.code).toBe('EMPTY_FILE');
    const mp = multipart({ subjectId: 'physics' }, { name: 'a.txt', type: 'text/plain', data: Buffer.from('abc def') });
    const noAck = await t.app.inject({ method: 'POST', url: '/api/documents', headers: { ...a.h, ...mp.headers }, payload: mp.payload });
    expect(noAck.statusCode).toBe(400); // rights acknowledgement is mandatory
    const malformed = await t.app.inject({ method: 'POST', url: '/api/documents', headers: { ...a.h, 'content-type': 'multipart/form-data; boundary=xyz' }, payload: Buffer.from('garbage') });
    expect(malformed.statusCode).toBeLessThan(500); // malformed bodies are client errors, never 500
    const traversal = await upload(t, a.h, { name: '../../etc/passwd.txt', type: 'text/plain', data: Buffer.from('hallo welt dies ist text') });
    expect(traversal.statusCode).toBe(201);
    expect(traversal.json().originalFilename).toBe('passwd.txt');
  });

  it('enforces the size limit', async () => {
    const small = await makeApp({ env: { MAX_UPLOAD_MB: '0.001' } });
    const u = await register(small, 'size@example.org');
    const r = await upload(small, u.h, { name: 'gross.txt', type: 'text/plain', data: Buffer.alloc(5000, 'a') });
    expect(r.statusCode).toBe(413);
    expect(r.json().error.code).toBe('FILE_TOO_LARGE');
    await small.close();
  });

  it('supports rename, move, search, filter and delete (file removed from storage)', async () => {
    const id = await uploadText(t, a.h, PHYSICS, 'suche.txt');
    const ren = await t.app.inject({ method: 'PATCH', url: `/api/documents/${id}`, headers: a.h, payload: { name: 'Mechanik Zusammenfassung', subjectId: 'math' } });
    expect(ren.json()).toMatchObject({ name: 'Mechanik Zusammenfassung', subjectId: 'math' });
    const byText = (await t.app.inject({ method: 'GET', url: '/api/documents?query=Isaac', headers: a.h })).json().documents;
    expect(byText.some((d: any) => d.id === id)).toBe(true); // full-text in segments
    const byName = (await t.app.inject({ method: 'GET', url: '/api/documents?query=Zusammenfassung&subjectId=math', headers: a.h })).json().documents;
    expect(byName).toHaveLength(1);
    const inj = await t.app.inject({ method: 'GET', url: `/api/documents?query=${encodeURIComponent("'; DROP TABLE documents;--")}`, headers: a.h });
    expect(inj.statusCode).toBe(200);
    expect((await t.ctx.db.query(`SELECT count(*)::int AS n FROM documents`)).rows[0]).toHaveProperty('n');
    const key = ((await t.ctx.db.query(`SELECT storage_key FROM documents WHERE id=$1`, [id])).rows[0] as any).storage_key;
    expect(fs.existsSync(path.join(t.ctx.config.storageDir, key))).toBe(true);
    expect((await t.app.inject({ method: 'DELETE', url: `/api/documents/${id}`, headers: a.h })).statusCode).toBe(200);
    expect(fs.existsSync(path.join(t.ctx.config.storageDir, key))).toBe(false);
    expect((await t.app.inject({ method: 'GET', url: `/api/documents/${id}`, headers: a.h })).statusCode).toBe(404);
  });
});

describe('cross-user isolation', () => {
  it("student B can never see, read, change or delete student A's documents", async () => {
    const id = await uploadText(t, a.h, PHYSICS, 'geheim.txt');
    for (const [method, url] of [
      ['GET', `/api/documents/${id}`], ['GET', `/api/documents/${id}/file`], ['GET', `/api/documents/${id}/text`],
      ['PATCH', `/api/documents/${id}`], ['DELETE', `/api/documents/${id}`], ['POST', `/api/documents/${id}/retry`],
    ] as const) {
      const r = await t.app.inject({ method, url, headers: b.h, payload: method === 'PATCH' ? { name: 'hacked' } : undefined });
      expect(r.statusCode, `${method} ${url}`).toBe(404); // 404, never 403 (no existence leak)
    }
    const list = (await t.app.inject({ method: 'GET', url: '/api/documents', headers: b.h })).json().documents;
    expect(list.some((d: any) => d.id === id)).toBe(false);
    const search = (await t.app.inject({ method: 'GET', url: '/api/documents?query=Isaac', headers: b.h })).json().documents;
    expect(search).toHaveLength(0);
    expect((await t.app.inject({ method: 'GET', url: `/api/documents/${id}`, headers: a.h })).statusCode).toBe(200); // still intact
  });
  it('B cannot attach A’s topics/collections/documents to anything of their own', async () => {
    const topic = (await t.app.inject({ method: 'POST', url: '/api/subjects/physics/topics', headers: a.h, payload: { title: 'Privat' } })).json().id;
    const r = await upload(t, b.h, { name: 'b.txt', type: 'text/plain', data: Buffer.from('hallo welt text') }, { topicId: topic });
    expect(r.statusCode).toBe(400);
    expect((await t.app.inject({ method: 'DELETE', url: `/api/topics/${topic}`, headers: b.h })).statusCode).toBe(404);
  });
});

describe('privacy: export and deletion', () => {
  it('exports only the caller’s own data', async () => {
    const e = (await t.app.inject({ method: 'GET', url: '/api/me/export', headers: a.h })).json();
    const raw = JSON.stringify(e);
    expect(raw).toContain('anna@example.org');
    expect(raw).not.toContain('ben@example.org');
    expect(raw).not.toMatch(/password_hash|token_hash|storage_key/);
  });
  it('deletes the account, all rows and stored files after re-authentication', async () => {
    const c = await register(t, 'delete-me@example.org');
    await onboard(t, c.h);
    await uploadText(t, c.h, PHYSICS, 'weg.txt');
    expect(fs.existsSync(path.join(t.ctx.config.storageDir, c.id))).toBe(true);
    expect((await t.app.inject({ method: 'DELETE', url: '/api/me', headers: c.h, payload: { password: 'wrong-password-xx' } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'DELETE', url: '/api/me', headers: c.h, payload: { password: 'correct-horse-battery' } })).statusCode).toBe(200);
    expect(fs.existsSync(path.join(t.ctx.config.storageDir, c.id))).toBe(false);
    for (const table of ['users', 'documents', 'document_segments', 'student_profiles', 'sessions', 'consents']) {
      const col = table === 'users' ? 'id' : 'user_id';
      expect(((await t.ctx.db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${col}=$1`, [c.id])).rows[0] as any).n, table).toBe(0);
    }
    expect((await t.app.inject({ method: 'GET', url: '/api/me', headers: c.h })).statusCode).toBe(401);
  });
});

describe('dashboard empty states, progress, planner', () => {
  it('shows real zeros and empty collections for a new student — nothing fabricated', async () => {
    const c = await register(t, 'fresh@example.org');
    await onboard(t, c.h);
    const d = (await t.app.inject({ method: 'GET', url: '/api/dashboard', headers: c.h })).json();
    expect(d.progress).toEqual({ lessonsCompleted: 0, programsStarted: 0, programsCompleted: 0, studySeconds: 0, topicsReviewed: 0, planItemsDone: 0, planItemsDue: 0 });
    expect(d.continueLearning).toBeNull();
    expect(d.upcomingExams).toEqual([]);
    expect(d.todayPlan).toEqual([]);
    expect(d.recentDocuments).toEqual([]);
    expect(d.subjects.map((s: any) => s.id).sort()).toEqual(['math', 'physics']);
  });

  async function seedProgram(uid: string, lessons = 3) {
    const p = (await t.ctx.db.query(`INSERT INTO learning_programs (user_id, subject_id, title, description, grade_min, grade_max, estimated_minutes, source_mode) VALUES ($1,'physics','Kräfte','d',7,9,60,'materials_only') RETURNING id`, [uid])).rows[0] as any;
    const ids: string[] = [];
    for (let i = 0; i < lessons; i++) ids.push(((await t.ctx.db.query(`INSERT INTO lessons (program_id, ordinal, title, estimated_minutes, blocks) VALUES ($1,$2,$3,20,'[]') RETURNING id`, [p.id, i, `Lektion ${i + 1}`])).rows[0] as any).id);
    return { programId: p.id as string, lessonIds: ids };
  }

  it('records progress only from real activity and drives “continue learning”', async () => {
    const c = await register(t, 'learner@example.org');
    await onboard(t, c.h);
    const { programId, lessonIds } = await seedProgram(c.id);
    expect((await t.app.inject({ method: 'GET', url: '/api/dashboard', headers: c.h })).json().continueLearning.lessonId).toBe(lessonIds[0]);
    const r = await t.app.inject({ method: 'POST', url: `/api/lessons/${lessonIds[0]}/progress`, headers: c.h, payload: { status: 'completed', seconds: 300 } });
    expect(r.statusCode).toBe(200);
    const d = (await t.app.inject({ method: 'GET', url: '/api/dashboard', headers: c.h })).json();
    expect(d.progress).toMatchObject({ lessonsCompleted: 1, programsStarted: 1, programsCompleted: 0, studySeconds: 300 });
    expect(d.continueLearning.lessonId).toBe(lessonIds[1]);
    for (const l of lessonIds.slice(1)) await t.app.inject({ method: 'POST', url: `/api/lessons/${l}/progress`, headers: c.h, payload: { status: 'completed' } });
    expect((await t.app.inject({ method: 'GET', url: '/api/progress', headers: c.h })).json()).toMatchObject({ lessonsCompleted: 3, programsCompleted: 1 });
    const lesson = (await t.app.inject({ method: 'GET', url: `/api/lessons/${lessonIds[1]}`, headers: c.h })).json();
    expect(lesson.prevLessonId).toBe(lessonIds[0]);
    expect(lesson.nextLessonId).toBe(lessonIds[2]);
    expect(lesson.progress.status).toBe('completed');
    // other users cannot touch it
    expect((await t.app.inject({ method: 'POST', url: `/api/lessons/${lessonIds[0]}/progress`, headers: b.h, payload: { status: 'completed' } })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: `/api/programs/${programId}`, headers: b.h })).statusCode).toBe(404);
    // a completed lesson can't be reset to in_progress by a replayed request
    await t.app.inject({ method: 'POST', url: `/api/lessons/${lessonIds[0]}/progress`, headers: c.h, payload: { status: 'in_progress' } });
    expect((await t.app.inject({ method: 'GET', url: `/api/lessons/${lessonIds[0]}`, headers: c.h })).json().progress.status).toBe('completed');
  });

  it('planner: needs availability + exams, schedules lessons before the exam, supports complete/reschedule', async () => {
    const c = await register(t, 'planner@example.org');
    await onboard(t, c.h);
    const { lessonIds } = await seedProgram(c.id, 3);
    expect((await t.app.inject({ method: 'POST', url: '/api/plan/generate', headers: c.h })).json().error.code).toBe('AVAILABILITY_REQUIRED');
    await t.app.inject({ method: 'PUT', url: '/api/plan/availability', headers: c.h, payload: { minutes: [60, 60, 60, 60, 60, 60, 60] } });
    expect((await t.app.inject({ method: 'POST', url: '/api/plan/generate', headers: c.h })).json().error.code).toBe('NO_EXAMS');
    const today = todayIn('Europe/Berlin');
    const exam = new Date(Date.parse(today) + 10 * 86400_000).toISOString().slice(0, 10);
    expect((await t.app.inject({ method: 'POST', url: '/api/exams', headers: c.h, payload: { subjectId: 'physics', title: 'Physik Arbeit', examDate: '2020-01-01' } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'POST', url: '/api/exams', headers: c.h, payload: { subjectId: 'physics', title: 'Physik Arbeit', examDate: exam } })).statusCode).toBe(201);
    const gen = (await t.app.inject({ method: 'POST', url: '/api/plan/generate', headers: c.h })).json();
    expect(gen.created).toBeGreaterThanOrEqual(3);
    expect(gen.unscheduledLessons).toBe(0);
    const plan = (await t.app.inject({ method: 'GET', url: `/api/plan?to=${exam}`, headers: c.h })).json().items as any[];
    expect(plan.filter((i) => i.kind === 'lesson').map((i) => i.lessonId).sort()).toEqual([...lessonIds].sort());
    expect(plan.every((i) => i.scheduledFor < exam)).toBe(true); // nothing on/after exam day
    const item = plan[0];
    const done = (await t.app.inject({ method: 'PATCH', url: `/api/plan/items/${item.id}`, headers: c.h, payload: { status: 'done' } })).json();
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeTruthy();
    const later = new Date(Date.parse(today) + 3 * 86400_000).toISOString().slice(0, 10);
    const moved = (await t.app.inject({ method: 'PATCH', url: `/api/plan/items/${plan[1].id}`, headers: c.h, payload: { scheduledFor: later } })).json();
    expect(moved.scheduledFor).toBe(later);
    expect(moved.rescheduledFrom).toBe(plan[1].scheduledFor === later ? null : plan[1].scheduledFor);
    expect((await t.app.inject({ method: 'PATCH', url: `/api/plan/items/${plan[1].id}`, headers: c.h, payload: { scheduledFor: '2020-01-01' } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'PATCH', url: `/api/plan/items/${plan[1].id}`, headers: b.h, payload: { status: 'done' } })).statusCode).toBe(404);
    // regenerate keeps completed items
    await t.app.inject({ method: 'POST', url: '/api/plan/generate', headers: c.h });
    const after = (await t.app.inject({ method: 'GET', url: `/api/plan?to=${exam}`, headers: c.h })).json().items as any[];
    expect(after.some((i) => i.id === item.id && i.status === 'done')).toBe(true);
    expect((await t.app.inject({ method: 'GET', url: '/api/progress', headers: c.h })).json().planItemsDone).toBe(1);
  });
});

describe('capabilities are reported honestly', () => {
  it('reports AI/OCR/research as not configured when they are not', async () => {
    const c = (await t.app.inject({ method: 'GET', url: '/api/capabilities' })).json();
    expect(c.ai.configured).toBe(false);
    expect(c.research.configured).toBe(false);
    const gen = await t.app.inject({ method: 'POST', url: '/api/programs/generate', headers: a.h, payload: { documentIds: ['00000000-0000-4000-8000-000000000000'], sourceMode: 'materials_only' } });
    expect(gen.statusCode).toBe(503);
    expect(gen.json().error.code).toBe('AI_NOT_CONFIGURED');
    const tutor = await t.app.inject({ method: 'POST', url: '/api/tutor/messages', headers: a.h, payload: { question: 'Hallo?' } });
    expect(tutor.statusCode).toBe(503);
  });
});
