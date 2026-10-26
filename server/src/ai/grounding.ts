import type { Grounding } from './schemas';
import { EvidenceStore, SourceVerificationService, locateQuote } from '../research/verification';

export interface SegmentRef {
  ref: string; // S1, S2 … (run-scoped)
  id: string;
  documentId: string;
  documentName: string;
  page: number | null;
  heading: string | null;
  text: string;
}

export interface GroundingCtx {
  segments: Map<string, SegmentRef>;
  evidence: EvidenceStore;
  verifier: SourceVerificationService | null;
  allowExternal: boolean;
}

export type ResolvedGrounding =
  | { kind: 'material'; seg: SegmentRef }
  | { kind: 'external'; evidenceId: string; sourceId: string; claim: string; location: string; evidenceHash: string };

export type GroundingResult = { ok: true; items: ResolvedGrounding[] } | { ok: false; reason: string };

/**
 * Turn LLM-declared groundings into verified, resolved references — or reject.
 * The model can only reference run-scoped ids (S#/E#) that the backend created.
 */
export async function resolveGroundings(gs: Grounding[], ctx: GroundingCtx): Promise<GroundingResult> {
  const items: ResolvedGrounding[] = [];
  for (const g of gs) {
    if (g.kind === 'material') {
      const seg = ctx.segments.get(g.ref);
      if (!seg) return { ok: false, reason: `unknown material ref ${g.ref}` };
      if (g.quote && g.quote.trim().length >= 20 && !locateQuote(seg.text, g.quote)) return { ok: false, reason: `quote not found in ${g.ref}` };
      items.push({ kind: 'material', seg });
    } else {
      if (!ctx.allowExternal) return { ok: false, reason: 'external source used although external research is not enabled' };
      if (!ctx.verifier) return { ok: false, reason: 'no verifier available' };
      const res = await ctx.verifier.verifyClaim(ctx.evidence, { claimText: g.claim, quote: g.quote, evidenceId: g.ref });
      if (res.status !== 'verified' || !res.sourceId) {
        const failed = res.checks.find((c) => !c.passed);
        return { ok: false, reason: `verification failed: ${failed?.name ?? 'unknown'}` };
      }
      items.push({ kind: 'external', evidenceId: g.ref, sourceId: res.sourceId, claim: g.claim, location: res.location ?? '', evidenceHash: res.evidenceHash ?? '' });
    }
  }
  return { ok: true, items };
}

/** Model-written text must not contain URLs: real URLs come only from stored source records. */
export function containsUrl(text: string): boolean {
  return /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|de|io|edu|gov)\b\/)/i.test(text);
}

/** Wrap untrusted data so instructions inside it cannot close the fence. */
export function fence(label: string, text: string): string {
  const safe = text.replace(/<\/?\s*untrusted[^>]*>/gi, '[tag removed]');
  return `<untrusted_${label}>\n${safe}\n</untrusted_${label}>`;
}
