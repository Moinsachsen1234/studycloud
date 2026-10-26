/**
 * ContentRightsService — centralized, deterministic permission engine.
 *
 * Design rules (docs/content-rights-policy.md):
 *  - Deny by default for reproduction / republication / adaptation / storage / distribution / training.
 *  - Permission for one operation never implies permission for another.
 *  - Inputs are *verified facts recorded by the backend* (provider config, license metadata,
 *    access checks). An LLM's claim about a license is never an input.
 *  - Outputs are structured decisions with reasons, suitable for an audit log.
 *  - This is not legal advice; REVIEW_REQUIRED exists so a human can decide uncertain cases.
 */

export type ContentCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type Operation =
  | 'read' // access an authorized source
  | 'extract_facts' // take unprotected facts
  | 'generate_original_explanation'
  | 'reproduce_text' // verbatim or near-verbatim
  | 'adapt_text' // translate / simplify / closely paraphrase protected expression
  | 'display_image'
  | 'store_source_material'
  | 'multi_user_distribution'
  | 'send_to_external_ai'
  | 'train_model';

export const ALL_OPERATIONS: Operation[] = [
  'read',
  'extract_facts',
  'generate_original_explanation',
  'reproduce_text',
  'adapt_text',
  'display_image',
  'store_source_material',
  'multi_user_distribution',
  'send_to_external_ai',
  'train_model',
];

export type Outcome = 'ALLOW' | 'ALLOW_WITH_CONDITIONS' | 'REVIEW_REQUIRED' | 'DENY';

export type LicenseId =
  | 'CC0-1.0'
  | 'CC-BY-4.0'
  | 'CC-BY-SA-4.0'
  | 'CC-BY-NC-4.0'
  | 'CC-BY-ND-4.0'
  | 'CC-BY-NC-SA-4.0'
  | 'CC-BY-NC-ND-4.0'
  | 'PDM-1.0'
  | 'OTHER';

export interface LicenseTerms {
  id: LicenseId | string;
  version?: string;
  url?: string;
  holder?: string;
  attribution: boolean;
  nonCommercial: boolean;
  noDerivatives: boolean;
  shareAlike: boolean;
  /** true only if the backend verified the license from machine-readable metadata of the source. */
  verified: boolean;
}

const CC_VERSION = '4.0';
export function licenseTerms(id: string, extra: Partial<LicenseTerms> = {}): LicenseTerms {
  const base = (a: boolean, nc: boolean, nd: boolean, sa: boolean): LicenseTerms => ({
    id,
    version: CC_VERSION,
    attribution: a,
    nonCommercial: nc,
    noDerivatives: nd,
    shareAlike: sa,
    verified: false,
  });
  const t: Record<string, LicenseTerms> = {
    'CC0-1.0': { ...base(false, false, false, false), version: '1.0' },
    'PDM-1.0': { ...base(false, false, false, false), version: '1.0' },
    'CC-BY-4.0': base(true, false, false, false),
    'CC-BY-SA-4.0': base(true, false, false, true),
    'CC-BY-NC-4.0': base(true, true, false, false),
    'CC-BY-ND-4.0': base(true, false, true, false),
    'CC-BY-NC-SA-4.0': base(true, true, false, true),
    'CC-BY-NC-ND-4.0': base(true, true, true, false),
  };
  // Unknown ids are treated as the MOST restrictive: all restrictions on.
  const found = t[id] ?? { id, attribution: true, nonCommercial: true, noDerivatives: true, shareAlike: true, verified: false };
  return { ...found, ...extra };
}

export type AccessRestriction = 'none' | 'paywall' | 'authentication' | 'drm' | 'technical_block';

export interface SourceRights {
  /** Who owns/controls this content from StudyCloud's view. */
  origin: 'studycloud' | 'user_upload' | 'external';
  category?: ContentCategory;
  ownerUserId?: string;
  license?: LicenseTerms;
  /** Public-domain status confirmed by a person/registry for the relevant jurisdiction. */
  publicDomainVerified?: boolean;
  access: AccessRestriction;
  /** Explicit permission of the provider's ToS / API terms for automated access. */
  automatedAccessAllowed: boolean | 'unknown';
  /** robots.txt / machine-readable TDM reservation (§ 44b UrhG, EU DSM Art. 4). */
  rightsReservation: boolean | 'unknown';
  robotsAllowed: boolean | 'unknown';
  /** Source comes from a configured trusted research provider (credibility != license). */
  trustedProvider: boolean;
  /** Sources state contradicting restrictions (e.g. page says CC-BY, footer says all rights reserved). */
  conflictingTerms?: boolean;
  reviewExpiresAt?: Date | null;
  /** Student gave a separate, explicit opt-in to model training on their uploads. */
  modelTrainingConsent?: boolean;
  /** Provider-disclosure consent exists for sending the user's content to the AI provider. */
  aiProcessingConsent?: boolean;
}

export interface RightsRequest {
  operation: Operation;
  source: SourceRights;
  /** Requesting student (for user-upload ownership checks). */
  requesterUserId?: string;
  /** StudyCloud may operate commercially: default true. */
  commercial?: boolean;
  /** Whether the content will be shown to / available to more than the owner. */
  now?: Date;
}

export interface Reason {
  code: string;
  message: string;
}
export interface RightsDecision {
  outcome: Outcome;
  operation: Operation;
  category: ContentCategory;
  reasons: Reason[];
  conditions: string[];
  evaluatedAt: string;
}

const REPRO_OPS: Operation[] = ['reproduce_text', 'adapt_text', 'display_image', 'store_source_material', 'multi_user_distribution'];

function decide(op: Operation, category: ContentCategory, outcome: Outcome, reasons: Reason[], conditions: string[], now: Date): RightsDecision {
  return { outcome, operation: op, category, reasons, conditions, evaluatedAt: now.toISOString() };
}

/** Classify a source into categories A–F from verified facts only. */
export function classify(src: SourceRights, commercial = true): ContentCategory {
  if (src.category) {
    // Explicit category must still be consistent with facts; F always wins.
    if (src.category === 'F') return 'F';
  }
  if (src.origin === 'studycloud') return 'A';
  if (src.origin === 'user_upload') return 'D';
  if (src.access !== 'none') return 'F';
  if (src.publicDomainVerified) return 'C';
  const l = src.license;
  if (l && l.verified) {
    if (l.id === 'PDM-1.0' || l.id === 'CC0-1.0') return 'C';
    return 'B';
  }
  if (src.trustedProvider) return 'E';
  return 'F';
}

export class ContentRightsService {
  evaluate(req: RightsRequest): RightsDecision {
    const now = req.now ?? new Date();
    const commercial = req.commercial ?? true;
    const s = req.source;
    const op = req.operation;
    const cat = classify(s, commercial);
    const reasons: Reason[] = [];
    const cond: string[] = [];
    const R = (code: string, message: string) => reasons.push({ code, message });
    const done = (o: Outcome) => decide(op, cat, o, reasons, cond, now);

    // ---- Category A: our own content
    if (cat === 'A') {
      R('A_OWN_CONTENT', 'Original StudyCloud content created with the necessary rights.');
      return done('ALLOW');
    }

    // ---- Category D: user's private upload
    if (cat === 'D') {
      if (!req.requesterUserId || req.requesterUserId !== s.ownerUserId) {
        R('D_NOT_OWNER', 'Private uploads are only usable for the uploading student.');
        return done('DENY');
      }
      switch (op) {
        case 'multi_user_distribution':
        case 'display_image':
          if (op === 'multi_user_distribution') {
            R('D_NO_SHARING', 'Uploads are private by default and are never made available to other students.');
            return done('DENY');
          }
          R('D_PRIVATE_PREVIEW', 'Only an authorized in-app preview for the owner is allowed.');
          cond.push('owner_only_preview');
          return done('ALLOW_WITH_CONDITIONS');
        case 'train_model':
          if (s.modelTrainingConsent) {
            R('D_TRAIN_OPT_IN', 'Separate explicit opt-in exists, but legal review of upload rights is still required.');
            return done('REVIEW_REQUIRED');
          }
          R('D_NO_TRAINING', 'No model training on uploads without a separate valid legal basis and opt-in.');
          return done('DENY');
        case 'send_to_external_ai':
          if (!s.aiProcessingConsent) {
            R('D_AI_DISCLOSURE', 'Student/guardian has not accepted the AI-provider processing disclosure.');
            return done('DENY');
          }
          R('D_AI_PRIVATE_USE', 'Disclosed processing for the owner’s private learning.');
          cond.push('minimize_context', 'no_training_by_provider');
          return done('ALLOW_WITH_CONDITIONS');
        case 'reproduce_text':
        case 'adapt_text':
        case 'store_source_material':
          R('D_PRIVATE_LEARNING', 'Uploads may be stored and transformed for the owner’s authorized private learning only. Upload does not establish ownership or redistribution rights.');
          cond.push('owner_only', 'private_learning_only');
          return done('ALLOW_WITH_CONDITIONS');
        default:
          R('D_PRIVATE_LEARNING', 'Reading, fact extraction and explanation for the owner’s private learning.');
          cond.push('owner_only');
          return done('ALLOW_WITH_CONDITIONS');
      }
    }

    // ---- External sources: general gates first
    if (s.access !== 'none') {
      R('ACCESS_RESTRICTED', `Source is behind ${s.access}; StudyCloud never circumvents paywalls, authentication, DRM or technical blocks.`);
      return done('DENY');
    }
    if (op === 'train_model') {
      R('TRAIN_UNRESOLVED', 'Training/fine-tuning on third-party content is legally unresolved; manual legal review required.');
      const l = s.license;
      const maybe = cat === 'C' || (cat === 'B' && !!l && !l.nonCommercial && !l.noDerivatives);
      return done(maybe ? 'REVIEW_REQUIRED' : 'DENY');
    }
    if (s.reviewExpiresAt && s.reviewExpiresAt.getTime() < now.getTime()) {
      R('REVIEW_EXPIRED', 'The previous rights review expired; permissions are not reused.');
      return done('REVIEW_REQUIRED');
    }
    if (cat === 'F') {
      R('F_UNESTABLISHED', 'Permission cannot be established (unknown license, untrusted source or restricted).');
      if (op === 'read' || op === 'extract_facts') return done('REVIEW_REQUIRED');
      return done('DENY');
    }
    if (s.conflictingTerms) {
      R('CONFLICTING_TERMS', 'Source states conflicting restrictions; the most restrictive reading applies until reviewed.');
      return done(REPRO_OPS.includes(op) ? 'DENY' : 'REVIEW_REQUIRED');
    }
    if (s.automatedAccessAllowed === false || s.robotsAllowed === false) {
      R('AUTOMATED_ACCESS_FORBIDDEN', 'Terms or robots directives forbid automated access.');
      return done('DENY');
    }
    if (s.rightsReservation === true && (op === 'extract_facts' || op === 'generate_original_explanation' || op === 'read')) {
      R('RIGHTS_RESERVATION', 'A machine-readable rights reservation (§ 44b UrhG) is present; no text-and-data-mining use.');
      return done('DENY');
    }

    // ---- Category C (public domain / CC0)
    if (cat === 'C') {
      R('C_PUBLIC_DOMAIN', s.publicDomainVerified ? 'Public-domain status verified for the relevant jurisdiction.' : 'CC0/PDM dedication verified.');
      if (op === 'display_image') cond.push('check_separate_rights_in_photographs_or_scans');
      return done(cond.length ? 'ALLOW_WITH_CONDITIONS' : 'ALLOW');
    }

    // ---- Category B (verified license)
    if (cat === 'B' && s.license) {
      const l = s.license;
      R('B_LICENSE', `Verified license ${l.id}.`);
      if (l.nonCommercial && commercial && op !== 'read' && op !== 'extract_facts' && op !== 'generate_original_explanation' && op !== 'send_to_external_ai') {
        R('NC_COMMERCIAL', 'NonCommercial license; StudyCloud may operate commercially.');
        return done('DENY');
      }
      if (l.nonCommercial && commercial && (op === 'generate_original_explanation' || op === 'extract_facts')) {
        // Facts are not protected; but NC content must not be used as the base of commercial derivative text.
        R('NC_FACTS_ONLY', 'NonCommercial source: only unprotected facts may inform original wording; no reproduction.');
        cond.push('facts_only', 'no_close_paraphrase');
        return done('ALLOW_WITH_CONDITIONS');
      }
      if ((op === 'adapt_text') && l.noDerivatives) {
        R('ND_NO_ADAPT', 'NoDerivatives license forbids adaptation (translation, simplification, close paraphrase).');
        return done('DENY');
      }
      if (l.attribution) cond.push('attribution: title, author, source URL, license, indicate changes');
      if (l.shareAlike && (op === 'adapt_text' || op === 'multi_user_distribution' || op === 'reproduce_text')) cond.push(`share_alike: derivative must carry ${l.id}`);
      if (op === 'display_image') cond.push('verify_license_applies_to_the_image_itself');
      return done('ALLOW_WITH_CONDITIONS');
    }

    // ---- Category E (public factual info from a trusted provider, unknown license)
    if (cat === 'E') {
      R('E_FACTS', 'Publicly accessible factual information from a trusted provider; credibility is not a license.');
      switch (op) {
        case 'read':
          cond.push('official_access_only', 'respect_rate_limits');
          return done(s.rightsReservation === 'unknown' || s.automatedAccessAllowed === 'unknown' ? 'REVIEW_REQUIRED' : 'ALLOW_WITH_CONDITIONS');
        case 'extract_facts':
        case 'generate_original_explanation':
          if (s.rightsReservation === 'unknown' || s.automatedAccessAllowed === 'unknown') {
            R('E_UNKNOWN_TERMS', 'Automated-use terms or rights reservation unknown; manual review needed.');
            return done('REVIEW_REQUIRED');
          }
          cond.push('facts_only', 'own_wording', 'no_extended_passages', 'cite_source');
          return done('ALLOW_WITH_CONDITIONS');
        case 'send_to_external_ai':
          cond.push('transient_processing_only');
          return done('ALLOW_WITH_CONDITIONS');
        default:
          R('E_NO_REPRODUCTION', 'No license: reproduction, adaptation, images, storage and distribution are denied by default.');
          return done('DENY');
      }
    }

    R('FALLBACK_DENY', 'No rule granted this operation.');
    return done('DENY');
  }
}

export const rightsService = new ContentRightsService();
