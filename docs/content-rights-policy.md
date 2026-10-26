# Content rights policy

> Engineering policy, **not legal advice**. Items marked ⚖ need review by a qualified lawyer before production use.

## Categories

| | Meaning | Typical handling |
|---|---|---|
| A | Original StudyCloud content | allowed per our own rights |
| B | Verified licence (CC, OER) | per licence terms |
| C | Verified public domain (must be confirmed per jurisdiction) | allowed; an unverified claim is not enough |
| D | Student's private upload | owner may study; no other user; no redistribution |
| E | Public facts from a trusted provider without a reuse licence | facts only; no reproduction, images or storage |
| F | Restricted / uncertain / prohibited | deny, find an alternative or require review |

## Operations are separate

`read`, `extract_facts`, `generate_original_explanation`, `reproduce_text`, `adapt_text`, `display_image`, `store_source_material`, `multi_user_distribution`, `send_to_external_ai`, `train_model`. Permission for one never implies another (e.g. CC BY-ND: verbatim reproduction with attribution is allowed, adaptation is denied).

## Outcomes

`ALLOW`, `ALLOW_WITH_CONDITIONS` (e.g. attribution, share-alike), `REVIEW_REQUIRED`, `DENY`. Every decision includes reasons and a timestamp and is logged in `rights_decisions` (no protected content is logged).

## Licence handling

Recorded: name, version, URL, holder, attribution, non-commercial, no-derivatives, share-alike, and whether the licence was **verified from machine-readable metadata**. Because StudyCloud may become commercial, **NonCommercial is treated as unsuitable by default** (commercial reproduction, storage, distribution denied; facts only, with conditions). ShareAlike adds a condition on adaptation. **Unknown licence ids are treated as the most restrictive.** Conflicting terms deny reproduction and send other uses to review. Reviews expire (`review_expires_at`); an expired review forces `REVIEW_REQUIRED`.

## Hard denials

Paywalled, authenticated, DRM-protected or technically blocked content is denied for every operation; nothing circumvents access controls. A machine-readable rights reservation (TDM opt-out, § 44b UrhG / EU DSM Art. 4) blocks fact extraction; a ToS/robots prohibition blocks reading. Training on third-party content is never `ALLOW`. Model training on student uploads is never `ALLOW` — even with an explicit opt-in the result is `REVIEW_REQUIRED`.

## User uploads

Private by default. Students attest at upload that they may use the file for private study (`rightsAck`); this is recorded but **does not establish ownership or redistribution rights**. Uploads are never shown to other users and are sent to the AI provider only with the student's disclosed `ai_processing` consent.

## Currently implemented research

One provider: Wikipedia (CC BY-SA 4.0). It is a *trusted* provider with a *verified* licence; the ShareAlike condition is recorded. Provider ratings keep factual credibility, currency, curriculum relevance, access permissions and reuse permissions separate; trusted ≠ licensed.

## Unresolved / assumptions requiring review ⚖

1. Whether § 60a UrhG or any licensing arrangement applies to a **commercial consumer** learning platform (the code assumes it does **not**).
2. Whether summarising/transforming a student's upload for that student, using an external AI provider, is covered by the student's attestation, and what the provider agreement must say (DPA, no training, retention).
3. How CC BY-SA applies to AI-generated lesson text that is derived from Wikipedia evidence (the code records the condition; the legal consequence is open).
4. Age of digital consent (default 16 via `DIGITAL_CONSENT_AGE`) and the sufficiency of the guardian-consent checkbox (a self-declaration, not verification).
5. Retention periods for uploads, logs and AI-provider-side data.
6. Treatment of the quoted passages shown in the source sheet (short quotations; the limit is a policy choice).
