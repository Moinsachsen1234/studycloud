# Source attribution

## How sources are retrieved

Only `ResearchService` talks to the internet, through `safeFetch` and a configured provider (currently the Wikipedia/MediaWiki API). `safeFetch` blocks private/reserved addresses (including after DNS resolution and on every redirect hop), allows only http(s), enforces timeouts, size limits and text content types, and honours robots.txt. Robots permission is **not** treated as a licence.

## What is stored (`external_sources`)

`id`, `title`, `author`, `publisher`, `canonical_url`, `source_type`, `language`, `published_at` (nullable), `updated_at` (nullable), `retrieved_at`, `verification_status`, `verified_at`, `license_identifier`, `license_url`, `rights_status`, `created_at`.

- `retrieved_at` is set by the server clock (`timestamptz`, UTC) at the moment of a real HTTP retrieval. It is never produced by an LLM.
- A cache hit **does not** change `retrieved_at`. Tests assert this, and that an expired cache entry triggers a real re-retrieval.
- `published_at` stays `NULL` unless the provider supplies it; the UI then shows "Not available". The retrieval date is never substituted. `updated_at` is only what the provider's API reported.
- Retrieved text is held in memory for the verification run; only metadata and the verified quote location are persisted, to avoid storing protected content.

## Claims → evidence

`educational_claims` (the claim text, tied to a learning objective) ↔ `claim_sources` (`source_id`, `supporting_location`, `support_status`). Lesson blocks reference claims, so source links survive lesson regeneration, export and deletion of other content. Blocks derived from the student's own upload cite the document name and page instead (`document_segments`).

## Verification (`SourceVerificationService`)

For each external claim: the evidence id exists in this run → the source was actually retrieved (hash of the evidence text still matches) → the quote occurs in the retrieved text (whitespace-normalised) → the quote is long enough to mean something → lexical support incl. matching numbers → provider credibility threshold → rights decision for the intended use. An optional LLM "second opinion" can only **downgrade**. Any failure drops the block; the student sees a notice.

## What the student sees

- Lesson blocks carry an origin label — *From your material*, *Verified source*, *AI explanation* — plus a small source badge.
- Tapping the badge opens the details sheet: title, publisher, author, original link, published / updated (or "Not available"), **retrieved** (converted to the student's time zone), licence with link, location of the quote, verification status and checks, and a note that the link may no longer be reachable.
- Each program has **Sources & References**, grouped into *My uploaded materials*, *Verified external sources*, *Licensed educational resources*. Private files appear by name only; no storage path or URL is exposed.
- Tutor answers show the same provenance under the message.

## Unavailable or unsupported

Dead links remain listed with their retrieval time. Claims that cannot be verified are removed rather than shown with a decorative citation. Programs without external sources say "This program uses no external sources."
