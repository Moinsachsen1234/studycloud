import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/db';
import { wikipediaProvider, type ResearchProvider } from '../src/research/providers';
import { ResearchService } from '../src/research/researchService';
import { EvidenceStore, SourceVerificationService, locateQuote, lexicallySupported } from '../src/research/verification';
import { FetchBlockedError, isPrivateAddress, robotsAllows, safeFetch, validateUrl } from '../src/research/safeFetch';
import { NEWTON_TEXT, fakeWikiFetch, makeDb } from './helpers';

const UA = 'StudyCloudTest/0.1';
let db: Db;
let uid: string;
beforeAll(async () => {
  db = await makeDb();
  uid = (await db.query(`INSERT INTO users (email,password_hash,birth_year) VALUES ('t@example.org','x',2010) RETURNING id`)).rows[0].id;
});
afterAll(async () => db.close());

describe('SSRF / safe fetching', () => {
  it('classifies private and reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'not-an-ip']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '91.198.174.192', '2620:0:862:ed1a::1']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('rejects bad URLs before any network call', () => {
    const allowed = ['wikipedia.org'];
    expect(() => validateUrl('http://de.wikipedia.org/x', allowed)).toThrow(/https/);
    expect(() => validateUrl('https://127.0.0.1/x', allowed)).toThrow(FetchBlockedError);
    expect(() => validateUrl('https://[::1]/x', allowed)).toThrow(FetchBlockedError);
    expect(() => validateUrl('https://evil.example/x', allowed)).toThrow(/allowlist/);
    expect(() => validateUrl('https://wikipedia.org.evil.example/x', allowed)).toThrow(/allowlist/);
    expect(() => validateUrl('https://user:pw@de.wikipedia.org/x', allowed)).toThrow(/Credentials/);
    expect(() => validateUrl('https://de.wikipedia.org:8443/x', allowed)).toThrow(/port/);
    expect(validateUrl('https://de.wikipedia.org/x', allowed).hostname).toBe('de.wikipedia.org');
  });

  it('re-validates every redirect hop (redirect to non-allowlisted host is blocked)', async () => {
    const impl = async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } });
    await expect(safeFetch('https://de.wikipedia.org/w/api.php', { allowedHosts: ['wikipedia.org'], userAgent: UA, fetchImpl: impl as any })).rejects.toThrow(/allowlist/);
    const toIp = async () => new Response(null, { status: 301, headers: { location: 'https://169.254.169.254/latest/meta-data' } });
    await expect(safeFetch('https://de.wikipedia.org/x', { allowedHosts: ['wikipedia.org'], userAgent: UA, fetchImpl: toIp as any })).rejects.toThrow(FetchBlockedError);
  });

  it('rejects binary content types and oversized bodies', async () => {
    const bin = async () => new Response('x', { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    await expect(safeFetch('https://de.wikipedia.org/x', { allowedHosts: ['wikipedia.org'], userAgent: UA, fetchImpl: bin as any })).rejects.toThrow(/content type/i);
    const big = async () => new Response('a'.repeat(5000), { status: 200, headers: { 'content-type': 'text/plain' } });
    await expect(safeFetch('https://de.wikipedia.org/x', { allowedHosts: ['wikipedia.org'], userAgent: UA, fetchImpl: big as any, maxBytes: 1000 })).rejects.toThrow(/size limit/);
  });

  it('parses robots.txt (longest match, specific agent, allow wins ties)', () => {
    const txt = 'User-agent: *\nDisallow: /private/\nAllow: /private/public\n\nUser-agent: StudyCloudBot\nDisallow: /nobots/\n';
    expect(robotsAllows(txt, 'OtherBot', '/private/x')).toBe(false);
    expect(robotsAllows(txt, 'OtherBot', '/private/public/a')).toBe(true);
    expect(robotsAllows(txt, 'StudyCloudBot/0.1', '/nobots/a')).toBe(false);
    expect(robotsAllows(txt, 'StudyCloudBot/0.1', '/private/x')).toBe(true); // specific group replaces *
    expect(robotsAllows('', 'x', '/a')).toBe(true);
  });
});

describe('ResearchService — provenance & timestamps', () => {
  it('stores system-generated retrieval time, API-provided update time, and keeps unknown publication date null', async () => {
    const f = fakeWikiFetch();
    const svc = new ResearchService(db, [wikipediaProvider], { cacheTtlHours: 24, userAgent: UA, fetchImpl: f.impl });
    const before = Date.now();
    const { evidence } = await svc.research('Newton zweites Gesetz', 'de', uid);
    const after = Date.now();
    expect(evidence).toHaveLength(1);
    const row = (await db.query(`SELECT * FROM external_sources WHERE id=$1`, [evidence[0].sourceId])).rows[0];
    expect(row.retrieved_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.retrieved_at.getTime()).toBeLessThanOrEqual(after);
    expect(row.updated_at.toISOString()).toBe('2026-05-01T08:30:00.000Z'); // from API, not invented
    expect(row.published_at).toBeNull(); // unknown stays unknown
    expect(row.canonical_url).toBe('https://de.wikipedia.org/wiki/Newtonsche_Gesetze');
    expect(row.final_url).toContain('oldid=123456');
    expect(row.license_identifier).toBe('CC-BY-SA-4.0');
    expect(row.verification_status).toBe('unverified'); // not verified until claims are checked
    const perms = (await db.query(`SELECT intended_use, permission_status FROM source_usage_permissions WHERE source_id=$1`, [row.id])).rows;
    const m = Object.fromEntries(perms.map((p: any) => [p.intended_use, p.permission_status]));
    expect(m.generate_original_explanation).toBe('ALLOW_WITH_CONDITIONS');
    expect(m.reproduce_text).toBe('ALLOW_WITH_CONDITIONS'); // CC BY-SA with attribution + share-alike
  });

  it('cache: a repeated query does not hit the network and never rewrites retrieved_at', async () => {
    const f = fakeWikiFetch({ text: NEWTON_TEXT + ' Zusatz.' });
    let clock = new Date('2026-10-26T10:00:00Z');
    const svc = new ResearchService(db, [wikipediaProvider], { cacheTtlHours: 24, userAgent: UA, fetchImpl: f.impl, now: () => clock });
    const first = await svc.research('Cache Test Frage', 'de', uid);
    const callsAfterFirst = f.calls.count;
    const retrieved = (await db.query(`SELECT retrieved_at FROM external_sources WHERE id=$1`, [first.evidence[0].sourceId])).rows[0].retrieved_at as Date;

    clock = new Date('2026-10-26T15:00:00Z');
    const second = await svc.research('cache test frage', 'de', uid);
    expect(f.calls.count).toBe(callsAfterFirst); // no network
    expect(second.evidence[0].fromCache).toBe(true);
    const row = (await db.query(`SELECT retrieved_at, last_used_at FROM external_sources WHERE id=$1`, [first.evidence[0].sourceId])).rows[0];
    expect(row.retrieved_at.getTime()).toBe(retrieved.getTime()); // unchanged
    expect(row.last_used_at.toISOString()).toBe('2026-10-26T15:00:00.000Z'); // distinguishes use from retrieval
  });

  it('expired cache triggers real re-retrieval', async () => {
    const f = fakeWikiFetch({ text: NEWTON_TEXT + ' Anderes.' });
    let clock = new Date('2026-10-26T10:00:00Z');
    const svc = new ResearchService(db, [wikipediaProvider], { cacheTtlHours: 1, userAgent: UA, fetchImpl: f.impl, now: () => clock });
    await svc.research('Ablauf Test', 'de', uid);
    const n = f.calls.count;
    clock = new Date('2026-10-26T13:00:00Z');
    await svc.research('Ablauf Test', 'de', uid);
    expect(f.calls.count).toBeGreaterThan(n);
  });

  it('blocks sources whose reuse terms cannot be established (unknown terms ⇒ REVIEW_REQUIRED ⇒ skipped)', async () => {
    const htmlProvider: ResearchProvider = {
      ...wikipediaProvider,
      id: 'random-html-site',
      accessBasis: 'robots_checked_html',
      async search() {
        return [{ title: 'Some page', text: 'text '.repeat(30), canonicalUrl: 'https://example.org/page', finalUrl: 'https://example.org/page', author: null, publisher: 'Example', language: 'de', publishedAt: null, updatedAt: null, retrievedAt: new Date(), httpStatus: 200, sourceType: 'web' }];
      },
    };
    const svc = new ResearchService(db, [htmlProvider], { cacheTtlHours: 1, userAgent: UA });
    const r = await svc.research('whatever', 'de', uid);
    expect(r.evidence).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/REVIEW_REQUIRED/);
    const logged = (await db.query(`SELECT outcome FROM rights_decisions WHERE outcome='REVIEW_REQUIRED'`)).rows;
    expect(logged.length).toBeGreaterThan(0);
  });
});

describe('SourceVerificationService — anti-hallucination', () => {
  async function setup() {
    const f = fakeWikiFetch({ text: NEWTON_TEXT + ' Verifikation.' });
    const svc = new ResearchService(db, [wikipediaProvider], { cacheTtlHours: 24, userAgent: UA, fetchImpl: f.impl });
    const { evidence } = await svc.research('Verifikation Setup', 'de', uid);
    const run = new EvidenceStore();
    evidence.forEach((e) => run.add(e));
    const ver = new SourceVerificationService(db, [wikipediaProvider]);
    return { run, ver, ev: evidence[0] };
  }

  it('verifies a claim whose quote exists in the retrieved text', async () => {
    const { run, ver, ev } = await setup();
    const res = await ver.verifyClaim(run, {
      claimText: 'Die Beschleunigung ist proportional zur resultierenden Kraft und umgekehrt proportional zur Masse.',
      quote: 'die Beschleunigung eines Körpers proportional zur resultierenden Kraft und umgekehrt proportional zu seiner Masse ist',
      evidenceId: ev.evidenceId,
    });
    expect(res.status).toBe('verified');
    expect(res.location).toMatch(/characters \d+–\d+/);
    const row = (await db.query(`SELECT verification_status, verified_at FROM external_sources WHERE id=$1`, [ev.sourceId])).rows[0];
    expect(row.verification_status).toBe('verified');
    expect(row.verified_at).toBeInstanceOf(Date);
  });

  it('rejects an invented evidence id (the LLM cannot create sources)', async () => {
    const { run, ver } = await setup();
    const res = await ver.verifyClaim(run, { claimText: 'x', quote: 'irgendein ausgedachtes zitat das es nicht gibt', evidenceId: 'E99' });
    expect(res.status).toBe('failed');
    expect(res.checks.at(-1)!.name).toBe('evidence_registered');
  });

  it('rejects a fabricated quote', async () => {
    const { run, ver, ev } = await setup();
    const res = await ver.verifyClaim(run, { claimText: 'Die Lichtgeschwindigkeit beträgt exakt 299792458 Meter pro Sekunde.', quote: 'Die Lichtgeschwindigkeit beträgt exakt 299792458 Meter pro Sekunde im Vakuum', evidenceId: ev.evidenceId });
    expect(res.status).toBe('failed');
    expect(res.checks.at(-1)!.name).toBe('quote_in_source');
  });

  it('rejects a real quote that does not support the claim (number mismatch)', async () => {
    const { run, ver, ev } = await setup();
    const res = await ver.verifyClaim(run, { claimText: 'Ein Newton entspricht der Kraft für 5 Kilogramm.', quote: 'Ein Newton entspricht der Kraft, die einem Körper der Masse 1 Kilogramm die Beschleunigung 1 Meter pro Sekunde zum Quadrat erteilt', evidenceId: ev.evidenceId });
    expect(res.status).toBe('failed');
    expect(res.checks.at(-1)!.name).toBe('claim_supported');
  });

  it('rejects too-short quotes (cannot be meaningful evidence)', async () => {
    const { run, ver, ev } = await setup();
    const res = await ver.verifyClaim(run, { claimText: 'Kraft', quote: 'Kraft', evidenceId: ev.evidenceId });
    expect(res.status).toBe('failed');
  });

  it('detects tampered evidence text (hash mismatch)', async () => {
    const { run, ver, ev } = await setup();
    ev.text = ev.text + ' Eingeschleuster Zusatz.';
    const res = await ver.verifyClaim(run, { claimText: 'Eingeschleuster Zusatz', quote: 'Eingeschleuster Zusatz Eingeschleuster', evidenceId: ev.evidenceId });
    expect(res.status).toBe('failed');
    expect(res.checks.at(-1)!.name).toBe('content_hash');
  });

  it('an LLM judge can only downgrade, never upgrade', async () => {
    const { run, ev } = await setup();
    const strict = new SourceVerificationService(db, [wikipediaProvider], { judge: { supports: async () => false } });
    const input = { claimText: 'Die Beschleunigung ist proportional zur resultierenden Kraft.', quote: 'die Beschleunigung eines Körpers proportional zur resultierenden Kraft', evidenceId: ev.evidenceId };
    expect((await strict.verifyClaim(run, input)).status).toBe('failed');
    const lenient = new SourceVerificationService(db, [wikipediaProvider], { judge: { supports: async () => true } });
    expect((await lenient.verifyClaim(run, input)).status).toBe('verified');
    // and a judge "yes" does not rescue a fabricated quote:
    expect((await lenient.verifyClaim(run, { ...input, quote: 'völlig erfundenes zitat ohne jede grundlage' })).status).toBe('failed');
  });

  it('quote locator & lexical support helpers', () => {
    expect(locateQuote(NEWTON_TEXT, 'IN DER FORMEL f = m · a steht F für die Kraft')).not.toBeNull();
    expect(locateQuote(NEWTON_TEXT, 'nicht vorhanden im text überhaupt nicht')).toBeNull();
    expect(lexicallySupported('Kraft gleich Masse mal Beschleunigung 7', NEWTON_TEXT).ok).toBe(false);
  });
});
