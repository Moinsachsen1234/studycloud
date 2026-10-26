import crypto from 'node:crypto';
import type { Db } from '../db/db';
import { licenseTerms, rightsService } from '../rights/rights';
import type { Evidence, ExternalSourceRow } from './researchService';
import { sourceRightsFor } from './researchService';
import type { ResearchProvider } from './providers';

export class EvidenceStore {
  private m = new Map<string, Evidence>();
  add(e: Evidence) {
    this.m.set(e.evidenceId, e);
  }
  get(id: string) {
    return this.m.get(id);
  }
  all() {
    return [...this.m.values()];
  }
}

export interface Check {
  name: string;
  passed: boolean;
  detail?: string;
}
export interface VerificationResult {
  status: 'verified' | 'failed';
  checks: Check[];
  sourceId?: string;
  location?: string;
  evidenceHash?: string;
}

/** Optional second opinion. It can only DOWNGRADE a claim that passed deterministic checks. */
export interface EntailmentJudge {
  supports(claim: string, passage: string): Promise<boolean>;
}

const STOP = new Set(['dass', 'eine', 'einen', 'einer', 'eines', 'dem', 'den', 'der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'wird', 'werden', 'wurde', 'mit', 'für', 'von', 'auf', 'aus', 'bei', 'nach', 'the', 'and', 'that', 'this', 'with', 'from', 'for', 'are', 'was', 'were', 'has', 'have', 'its', 'sich', 'auch', 'wie', 'als', 'nicht', 'kann', 'können']);

/** Lowercase, strip accents/punctuation, collapse whitespace; returns normalized string + index map to original. */
export function normalizeWithMap(s: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i].toLowerCase();
    if (/[\p{L}\p{N}]/u.test(ch)) {
      norm += ch;
      map.push(i);
      lastSpace = false;
    } else if (!lastSpace) {
      norm += ' ';
      map.push(i);
      lastSpace = true;
    }
  }
  return { norm: norm.trimEnd(), map };
}

export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  const t = normalizeWithMap(text);
  const q = normalizeWithMap(quote).norm;
  if (q.length < 20) return null; // too short to be meaningful evidence
  const i = t.norm.indexOf(q);
  if (i < 0) return null;
  return { start: t.map[i], end: t.map[Math.min(i + q.length - 1, t.map.length - 1)] + 1 };
}

const tokens = (s: string) => (normalizeWithMap(s).norm.split(' ').filter((w) => w.length >= 4 && !STOP.has(w)));
const numbers = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));

export function lexicallySupported(claim: string, passage: string): { ok: boolean; detail: string } {
  const p = normalizeWithMap(passage).norm;
  const pNums = new Set(numbers(passage));
  const missingNums = numbers(claim).filter((n) => !pNums.has(n));
  if (missingNums.length) return { ok: false, detail: `numbers not in source passage: ${missingNums.join(', ')}` };
  const ct = [...new Set(tokens(claim))];
  if (!ct.length) return { ok: true, detail: 'no significant tokens' };
  const hit = ct.filter((w) => p.includes(w.slice(0, Math.max(4, Math.min(w.length, 6))))).length;
  const ratio = hit / ct.length;
  return { ok: ratio >= 0.5, detail: `${hit}/${ct.length} significant terms found (${ratio.toFixed(2)})` };
}

export class SourceVerificationService {
  constructor(
    private db: Db,
    private providers: ResearchProvider[],
    private opts: { minFactualCredibility?: number; judge?: EntailmentJudge; now?: () => Date } = {},
  ) {}

  async verifyClaim(run: EvidenceStore, input: { claimText: string; quote: string; evidenceId: string }): Promise<VerificationResult> {
    const checks: Check[] = [];
    const fail = (name: string, detail?: string): VerificationResult => {
      checks.push({ name, passed: false, detail });
      return { status: 'failed', checks };
    };
    const pass = (name: string, detail?: string) => checks.push({ name, passed: true, detail });
    const now = this.opts.now ? this.opts.now() : new Date();

    // 1. The evidence must come from a real retrieval of THIS run — an LLM cannot create evidence ids.
    const ev = run.get(input.evidenceId);
    if (!ev) return fail('evidence_registered', `unknown evidence id ${input.evidenceId}`);
    pass('evidence_registered');

    // 2. Source row exists with a real, non-future retrieval timestamp.
    const r = await this.db.query<ExternalSourceRow>(`SELECT * FROM external_sources WHERE id=$1`, [ev.sourceId]);
    const row = r.rows[0];
    if (!row) return fail('source_exists');
    if (!row.retrieved_at || row.retrieved_at.getTime() > now.getTime() + 60_000) return fail('retrieval_timestamp', 'missing or in the future');
    pass('source_exists');
    pass('retrieval_timestamp', row.retrieved_at.toISOString());

    // 3. URL belongs to a configured provider host and matches the retrieved record.
    const provider = this.providers.find((p) => p.id === row.provider_id);
    if (!provider) return fail('provider_configured');
    const hostOk = (u: string) => {
      try {
        const h = new URL(u).hostname.toLowerCase();
        return provider.hosts.some((x) => h === x || h.endsWith('.' + x));
      } catch {
        return false;
      }
    };
    if (!hostOk(row.canonical_url) || !hostOk(row.final_url)) return fail('url_matches_provider', 'URL host not on provider allowlist');
    if (ev.canonicalUrl !== row.canonical_url) return fail('url_matches_record', 'evidence URL differs from stored record');
    try {
      if (new URL(row.canonical_url).pathname === '/' ) return fail('url_specific', 'homepage-only URL is not a specific source');
    } catch {
      return fail('url_valid');
    }
    pass('url_matches_provider');

    // 4. Retrieved content corresponds to the stored record.
    const h = crypto.createHash('sha256').update(ev.text).digest('hex');
    if (h !== row.content_sha256) return fail('content_hash', 'retrieved text does not match stored hash');
    pass('content_hash');

    // 5. Rights check (fresh evaluation, not trusting stored text).
    const license = row.license_identifier
      ? licenseTerms(row.license_identifier, { url: row.license_url ?? undefined, holder: row.license_holder ?? undefined, verified: true })
      : undefined;
    const dec = rightsService.evaluate({ operation: 'generate_original_explanation', source: sourceRightsFor({ license }, provider), now });
    if (dec.outcome === 'DENY' || dec.outcome === 'REVIEW_REQUIRED') return fail('rights', dec.outcome);
    pass('rights', dec.outcome);

    // 6. Credibility threshold (factual credibility only; reuse rights are separate).
    const min = this.opts.minFactualCredibility ?? 3;
    if ((provider.ratings.factualCredibility ?? 0) < min) return fail('credibility', `provider factual credibility ${provider.ratings.factualCredibility} < ${min}`);
    pass('credibility');

    // 7. Quote really exists in the retrieved text.
    const loc = locateQuote(ev.text, input.quote);
    if (!loc) return fail('quote_in_source', 'quote not found in retrieved text (or shorter than 20 characters)');
    pass('quote_in_source');

    // 8. The claim is lexically supported by the quote's neighborhood.
    const window = ev.text.slice(Math.max(0, loc.start - 300), Math.min(ev.text.length, loc.end + 300));
    const lex = lexicallySupported(input.claimText, window);
    if (!lex.ok) return fail('claim_supported', lex.detail);
    pass('claim_supported', lex.detail);

    // 9. Optional LLM judge — may only downgrade.
    if (this.opts.judge) {
      const ok = await this.opts.judge.supports(input.claimText, window).catch(() => false);
      if (!ok) return fail('judge', 'second-opinion judge did not confirm support');
      pass('judge');
    }

    await this.db.query(`UPDATE external_sources SET verification_status='verified', verified_at=COALESCE(verified_at,$2) WHERE id=$1`, [row.id, now]);
    return {
      status: 'verified',
      checks,
      sourceId: row.id,
      location: `characters ${loc.start}–${loc.end} of the retrieved article text`,
      evidenceHash: crypto.createHash('sha256').update(ev.text.slice(loc.start, loc.end)).digest('hex'),
    };
  }
}
