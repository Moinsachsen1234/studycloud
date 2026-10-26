import crypto from 'node:crypto';
import type { Db } from '../db/db';
import { licenseTerms, rightsService, type SourceRights, type RightsDecision, type Operation } from '../rights/rights';
import type { ProviderContext, RawDocument, ResearchProvider } from './providers';
import { FetchBlockedError } from './safeFetch';

export interface Evidence {
  /** Run-scoped id the LLM must reference (E1, E2…). The LLM can never create one. */
  evidenceId: string;
  sourceId: string; // external_sources.id
  providerId: string;
  title: string;
  canonicalUrl: string;
  text: string; // transient
  retrievedAt: Date;
  fromCache: boolean;
  decision: RightsDecision;
}

export interface ExternalSourceRow {
  id: string;
  provider_id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  canonical_url: string;
  final_url: string;
  source_type: string;
  language: string | null;
  published_at: Date | null;
  updated_at: Date | null;
  retrieved_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
  content_sha256: string;
  http_status: number;
  verification_status: 'unverified' | 'verified' | 'failed';
  verified_at: Date | null;
  license_identifier: string | null;
  license_url: string | null;
  license_holder: string | null;
  rights_status: string;
  credibility: Record<string, number>;
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function sourceRightsFor(doc: Pick<RawDocument, 'license'>, provider: ResearchProvider): SourceRights {
  return {
    origin: 'external',
    access: 'none',
    automatedAccessAllowed: provider.accessBasis === 'official_api' ? true : 'unknown',
    rightsReservation: provider.accessBasis === 'official_api' ? false : 'unknown',
    robotsAllowed: provider.accessBasis === 'official_api' ? true : 'unknown',
    trustedProvider: true,
    license: doc.license,
  };
}

export async function logDecision(db: Db, d: RightsDecision, ctx: { sourceId?: string; documentId?: string; userId?: string }) {
  await db.query(
    `INSERT INTO rights_decisions (source_id, document_id, user_id, operation, outcome, reasons) VALUES ($1,$2,$3,$4,$5,$6)`,
    [ctx.sourceId ?? null, ctx.documentId ?? null, ctx.userId ?? null, d.operation, d.outcome, JSON.stringify({ reasons: d.reasons, conditions: d.conditions, category: d.category })],
  );
}

interface TextCacheEntry {
  text: string;
  expires: number;
}

/**
 * Controlled research service — the ONLY place that touches the external web.
 * - Only configured providers; all fetches go through safeFetch (SSRF-safe).
 * - retrieved_at is the backend clock at retrieval; cache hits only touch last_used_at.
 * - Full text is cached in memory (transient, TTL) — never persisted.
 */
export class ResearchService {
  private textCache = new Map<string, TextCacheEntry>(); // key: source id
  private queryCache = new Map<string, { ids: string[]; expires: number }>();
  constructor(
    private db: Db,
    private providers: ResearchProvider[],
    private opts: { cacheTtlHours: number; userAgent: string; fetchImpl?: ProviderContext['fetchImpl']; now?: () => Date },
  ) {}

  private now() {
    return this.opts.now ? this.opts.now() : new Date();
  }

  async research(query: string, language: string, userId: string): Promise<{ evidence: Evidence[]; skipped: { url?: string; reason: string }[] }> {
    const q = query.replace(/\s+/g, ' ').trim().slice(0, 100);
    const evidence: Evidence[] = [];
    const skipped: { url?: string; reason: string }[] = [];
    if (!q) return { evidence, skipped };
    const key = `${language}|${q.toLowerCase()}`;
    const qc = this.queryCache.get(key);
    if (qc && qc.expires > this.now().getTime()) {
      const hits: Evidence[] = [];
      for (const id of qc.ids) {
        const e = await this.useCached(id, userId, `E${hits.length + 1}`);
        if (e) hits.push(e);
      }
      if (hits.length === qc.ids.length && hits.length) return { evidence: hits, skipped };
    }
    for (const p of this.providers) {
      let docs: RawDocument[] = [];
      try {
        docs = await p.search(q, language, { userAgent: this.opts.userAgent, fetchImpl: this.opts.fetchImpl });
      } catch (e) {
        skipped.push({ reason: `${p.id}: ${e instanceof FetchBlockedError ? e.code : 'retrieval_failed'}` });
        continue;
      }
      for (const doc of docs) {
        const rights = sourceRightsFor(doc, p);
        const dFacts = rightsService.evaluate({ operation: 'generate_original_explanation', source: rights, now: this.now() });
        if (dFacts.outcome === 'DENY' || dFacts.outcome === 'REVIEW_REQUIRED') {
          await logDecision(this.db, dFacts, { userId });
          skipped.push({ url: doc.canonicalUrl, reason: `rights:${dFacts.outcome}` });
          continue;
        }
        const { row, cached } = await this.persist(doc, p, dFacts);
        await logDecision(this.db, dFacts, { sourceId: row.id, userId });
        this.textCache.set(row.id, { text: doc.text, expires: this.now().getTime() + this.opts.cacheTtlHours * 3600_000 });
        evidence.push({
          evidenceId: `E${evidence.length + 1}`,
          sourceId: row.id,
          providerId: p.id,
          title: row.title,
          canonicalUrl: row.canonical_url,
          text: doc.text,
          retrievedAt: row.retrieved_at,
          fromCache: cached,
          decision: dFacts,
        });
      }
    }
    if (evidence.length) this.queryCache.set(key, { ids: evidence.map((e) => e.sourceId), expires: this.now().getTime() + this.opts.cacheTtlHours * 3600_000 });
    return { evidence, skipped };
  }

  /** Re-use a still-fresh cached source without hitting the network. Does NOT change retrieved_at. */
  async useCached(sourceId: string, userId: string, evidenceId: string): Promise<Evidence | null> {
    const hit = this.textCache.get(sourceId);
    const now = this.now();
    if (!hit || hit.expires < now.getTime()) return null;
    const r = await this.db.query<ExternalSourceRow>(`SELECT * FROM external_sources WHERE id=$1 AND expires_at > $2`, [sourceId, now]);
    const row = r.rows[0];
    if (!row) return null;
    await this.db.query(`UPDATE external_sources SET last_used_at=$2 WHERE id=$1`, [sourceId, now]);
    const provider = this.providers.find((p) => p.id === row.provider_id);
    if (!provider) return null;
    const license = row.license_identifier
      ? licenseTerms(row.license_identifier, { url: row.license_url ?? undefined, holder: row.license_holder ?? undefined, verified: true })
      : undefined;
    const decision = rightsService.evaluate({ operation: 'generate_original_explanation', source: sourceRightsFor({ license }, provider), now });
    if (decision.outcome === 'DENY' || decision.outcome === 'REVIEW_REQUIRED') return null; // rights may have changed
    return { evidenceId, sourceId, providerId: row.provider_id, title: row.title, canonicalUrl: row.canonical_url, text: hit.text, retrievedAt: row.retrieved_at, fromCache: true, decision };
  }

  private async persist(doc: RawDocument, p: ResearchProvider, d: RightsDecision): Promise<{ row: ExternalSourceRow; cached: boolean }> {
    const hash = sha(doc.text);
    const now = this.now();
    const expires = new Date(now.getTime() + this.opts.cacheTtlHours * 3600_000);
    const existing = await this.db.query<ExternalSourceRow>(`SELECT * FROM external_sources WHERE canonical_url=$1 AND content_sha256=$2`, [doc.canonicalUrl, hash]);
    if (existing.rows[0]) {
      // A real re-retrieval happened (we just fetched it) → refresh retrieved_at honestly.
      const u = await this.db.query<ExternalSourceRow>(
        `UPDATE external_sources SET retrieved_at=$2, expires_at=$3, http_status=$4, updated_at=COALESCE($5, updated_at) WHERE id=$1 RETURNING *`,
        [existing.rows[0].id, doc.retrievedAt, expires, doc.httpStatus, doc.updatedAt],
      );
      return { row: u.rows[0], cached: false };
    }
    const rightsStatus = doc.license ? 'licensed' : 'factual_only';
    const ins = await this.db.query<ExternalSourceRow>(
      `INSERT INTO external_sources (provider_id,title,author,publisher,canonical_url,final_url,source_type,language,published_at,updated_at,retrieved_at,expires_at,content_sha256,http_status,verification_status,license_identifier,license_url,license_holder,rights_status,credibility)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'unverified',$15,$16,$17,$18,$19) RETURNING *`,
      [
        p.id, doc.title, doc.author, doc.publisher, doc.canonicalUrl, doc.finalUrl, doc.sourceType, doc.language,
        doc.publishedAt, doc.updatedAt, doc.retrievedAt, expires, hash, doc.httpStatus,
        doc.license?.id ?? null, doc.license?.url ?? null, doc.license?.holder ?? null, rightsStatus, JSON.stringify(p.ratings),
      ],
    );
    const row = ins.rows[0];
    for (const op of ['extract_facts', 'generate_original_explanation', 'reproduce_text', 'store_source_material', 'multi_user_distribution'] as Operation[]) {
      const dec = rightsService.evaluate({ operation: op, source: sourceRightsFor(doc, p), now });
      await this.db.query(
        `INSERT INTO source_usage_permissions (source_id,intended_use,permission_status,license_basis,restriction_details,reviewed_at) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (source_id,intended_use) DO NOTHING`,
        [row.id, op, dec.outcome, doc.license?.id ?? 'none', dec.conditions.join('; ') || dec.reasons.map((r) => r.code).join(','), now],
      );
    }
    void d;
    return { row, cached: false };
  }
}
