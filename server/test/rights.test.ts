import { describe, expect, it } from 'vitest';
import { ContentRightsService, licenseTerms, type SourceRights, type Operation } from '../src/rights/rights';

const svc = new ContentRightsService();
const NOW = new Date('2026-10-26T12:00:00Z');

const ext = (over: Partial<SourceRights> = {}): SourceRights => ({
  origin: 'external',
  access: 'none',
  automatedAccessAllowed: true,
  rightsReservation: false,
  robotsAllowed: true,
  trustedProvider: true,
  ...over,
});
const lic = (id: string) => licenseTerms(id, { verified: true, url: 'https://creativecommons.org/' });
const ev = (op: Operation, source: SourceRights, extra: object = {}) => svc.evaluate({ operation: op, source, now: NOW, ...extra });

describe('ContentRightsService — categories & scenarios from the spec', () => {
  it('Category A: own content is allowed for everything', () => {
    for (const op of ['reproduce_text', 'multi_user_distribution', 'adapt_text'] as Operation[]) {
      expect(ev(op, { ...ext(), origin: 'studycloud' }).outcome).toBe('ALLOW');
    }
  });

  it('CC BY: reproduction allowed only with attribution condition', () => {
    const d = ev('reproduce_text', ext({ license: lic('CC-BY-4.0') }));
    expect(d.outcome).toBe('ALLOW_WITH_CONDITIONS');
    expect(d.conditions.join(' ')).toMatch(/attribution/);
    expect(d.category).toBe('B');
  });

  it('CC BY-SA: adaptation carries a share-alike condition', () => {
    const d = ev('adapt_text', ext({ license: lic('CC-BY-SA-4.0') }));
    expect(d.outcome).toBe('ALLOW_WITH_CONDITIONS');
    expect(d.conditions.join(' ')).toMatch(/share_alike/);
  });

  it('CC BY-NC: commercial reproduction/storage/distribution denied; facts-only allowed with conditions', () => {
    const s = ext({ license: lic('CC-BY-NC-4.0') });
    expect(ev('reproduce_text', s).outcome).toBe('DENY');
    expect(ev('store_source_material', s).outcome).toBe('DENY');
    expect(ev('multi_user_distribution', s).outcome).toBe('DENY');
    const f = ev('generate_original_explanation', s);
    expect(f.outcome).toBe('ALLOW_WITH_CONDITIONS');
    expect(f.conditions).toContain('facts_only');
  });

  it('CC BY-NC is allowed to be reproduced when explicitly non-commercial', () => {
    expect(ev('reproduce_text', ext({ license: lic('CC-BY-NC-4.0') }), { commercial: false }).outcome).toBe('ALLOW_WITH_CONDITIONS');
  });

  it('CC BY-ND: adaptation denied, verbatim reproduction with attribution allowed', () => {
    const s = ext({ license: lic('CC-BY-ND-4.0') });
    expect(ev('adapt_text', s).outcome).toBe('DENY');
    expect(ev('reproduce_text', s).outcome).toBe('ALLOW_WITH_CONDITIONS');
  });

  it('unknown license ids are treated as most restrictive', () => {
    const s = ext({ license: licenseTerms('WEIRD-LICENSE', { verified: true }) });
    expect(ev('reproduce_text', s).outcome).toBe('DENY');
    expect(ev('adapt_text', s).outcome).toBe('DENY');
  });

  it('public domain (verified) is allowed; unverified public-domain claim is not', () => {
    expect(ev('reproduce_text', ext({ publicDomainVerified: true, trustedProvider: false })).outcome).toBe('ALLOW');
    const unverified = ev('reproduce_text', ext({ trustedProvider: false }));
    expect(unverified.outcome).toBe('DENY');
    expect(unverified.category).toBe('F');
  });

  it('CC0 is category C', () => {
    const d = ev('adapt_text', ext({ license: lic('CC0-1.0') }));
    expect(d.category).toBe('C');
    expect(d.outcome).toBe('ALLOW');
  });

  it('restricted textbook content (paywall / DRM) is denied for every operation', () => {
    for (const access of ['paywall', 'drm', 'authentication', 'technical_block'] as const) {
      for (const op of ['read', 'extract_facts', 'reproduce_text', 'generate_original_explanation'] as Operation[]) {
        expect(ev(op, ext({ access })).outcome).toBe('DENY');
      }
    }
  });

  it('private upload: owner may study; other users and distribution are denied', () => {
    const own = { origin: 'user_upload', ownerUserId: 'u1', access: 'none', automatedAccessAllowed: true, rightsReservation: false, robotsAllowed: true, trustedProvider: false } as SourceRights;
    expect(ev('generate_original_explanation', own, { requesterUserId: 'u1' }).outcome).toBe('ALLOW_WITH_CONDITIONS');
    expect(ev('generate_original_explanation', own, { requesterUserId: 'u2' }).outcome).toBe('DENY');
    expect(ev('multi_user_distribution', own, { requesterUserId: 'u1' }).outcome).toBe('DENY');
    expect(ev('train_model', own, { requesterUserId: 'u1' }).outcome).toBe('DENY');
  });

  it('private upload: sending to an external AI provider requires disclosed consent', () => {
    const base = { origin: 'user_upload', ownerUserId: 'u1', access: 'none', automatedAccessAllowed: true, rightsReservation: false, robotsAllowed: true, trustedProvider: false } as SourceRights;
    expect(ev('send_to_external_ai', base, { requesterUserId: 'u1' }).outcome).toBe('DENY');
    expect(ev('send_to_external_ai', { ...base, aiProcessingConsent: true }, { requesterUserId: 'u1' }).outcome).toBe('ALLOW_WITH_CONDITIONS');
  });

  it('upload training opt-in still requires legal review, never ALLOW', () => {
    const own = { origin: 'user_upload', ownerUserId: 'u1', modelTrainingConsent: true, access: 'none', automatedAccessAllowed: true, rightsReservation: false, robotsAllowed: true, trustedProvider: false } as SourceRights;
    expect(ev('train_model', own, { requesterUserId: 'u1' }).outcome).toBe('REVIEW_REQUIRED');
  });

  it('unknown licensing from an untrusted source: deny reproduction, review facts', () => {
    const s = ext({ trustedProvider: false });
    expect(ev('reproduce_text', s).outcome).toBe('DENY');
    expect(ev('extract_facts', s).outcome).toBe('REVIEW_REQUIRED');
  });

  it('trusted provider w/o license (Category E): facts only, never reproduction/images/storage', () => {
    const s = ext();
    expect(ev('generate_original_explanation', s).outcome).toBe('ALLOW_WITH_CONDITIONS');
    expect(ev('generate_original_explanation', s).conditions).toContain('own_wording');
    for (const op of ['reproduce_text', 'adapt_text', 'display_image', 'store_source_material', 'multi_user_distribution'] as Operation[]) {
      expect(ev(op, s).outcome).toBe('DENY');
    }
  });

  it('Category E with unknown terms/reservation needs review', () => {
    expect(ev('extract_facts', ext({ rightsReservation: 'unknown' })).outcome).toBe('REVIEW_REQUIRED');
    expect(ev('read', ext({ automatedAccessAllowed: 'unknown' })).outcome).toBe('REVIEW_REQUIRED');
  });

  it('rights reservation (TDM opt-out) blocks fact extraction; robots/ToS prohibition blocks reading', () => {
    expect(ev('extract_facts', ext({ rightsReservation: true })).outcome).toBe('DENY');
    expect(ev('read', ext({ robotsAllowed: false })).outcome).toBe('DENY');
    expect(ev('read', ext({ automatedAccessAllowed: false })).outcome).toBe('DENY');
  });

  it('conflicting restrictions: reproduction denied, others need review', () => {
    const s = ext({ license: lic('CC-BY-4.0'), conflictingTerms: true });
    expect(ev('reproduce_text', s).outcome).toBe('DENY');
    expect(ev('extract_facts', s).outcome).toBe('REVIEW_REQUIRED');
  });

  it('expired review forces REVIEW_REQUIRED', () => {
    const s = ext({ license: lic('CC-BY-4.0'), reviewExpiresAt: new Date('2026-01-01T00:00:00Z') });
    expect(ev('reproduce_text', s).outcome).toBe('REVIEW_REQUIRED');
  });

  it('permission for one operation does not imply another (CC BY-ND)', () => {
    const s = ext({ license: lic('CC-BY-ND-4.0') });
    const outcomes = new Set(['reproduce_text', 'adapt_text'].map((o) => ev(o as Operation, s).outcome));
    expect(outcomes.size).toBe(2);
  });

  it('training on third-party content is never ALLOW', () => {
    for (const s of [ext({ license: lic('CC-BY-4.0') }), ext({ license: lic('CC0-1.0') }), ext()]) {
      expect(ev('train_model', s).outcome).not.toBe('ALLOW');
      expect(ev('train_model', s).outcome).not.toBe('ALLOW_WITH_CONDITIONS');
    }
  });

  it('every decision carries reasons and a timestamp for the audit log', () => {
    const d = ev('reproduce_text', ext());
    expect(d.reasons.length).toBeGreaterThan(0);
    expect(d.evaluatedAt).toBe(NOW.toISOString());
  });
});
