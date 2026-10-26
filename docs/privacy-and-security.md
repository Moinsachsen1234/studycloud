# Privacy and security

> Not a statement of legal compliance. A DPIA, DPAs with providers, and legal review are required before real students use this.

## Data collected

Email, password hash, birth year (age gate only — not the full date), display name, grade, federal state, school type, subjects, goals, UI language, time zone, uploaded documents and derived text/concepts, study activity, tutor messages, consent records with version. Nothing else is required.

## Controls implemented

- **Auth:** scrypt hashing, opaque server-side sessions (only a SHA-256 of the token is stored), a dummy hash so unknown emails take similar time, rate limits (global 300/min; register/login 10/min; uploads 30/min; AI routes 20/min).
- **Minors:** below `DIGITAL_CONSENT_AGE` (default 16) registration requires a guardian-consent declaration; consents are stored with a privacy-notice version. This is self-declaration, not identity verification ⚖.
- **Isolation:** every query filters by the authenticated user; tests assert that user B gets 404 for user A's documents, programs, lessons, sources, conversations and files.
- **Files:** content sniffed by magic bytes (extension and MIME are not trusted), size limited, stored under random keys with no public URL, served only through an authenticated endpoint; the web preview iframe is sandboxed. Deleting a document removes the object and derived rows.
- **AI disclosure and consent:** provider name is shown in settings; content is sent only with `ai_processing` consent; a daily call limit applies. Keys live only in server environment variables.
- **SSRF:** research fetches go through `safeFetch` (private ranges, redirects re-validated, size/type limits).
- **Prompt injection:** untrusted fences, no model-written URLs, run-scoped ids, validation in code (see `ai-pipeline.md`).
- **Data rights:** `GET /api/me/export` (JSON export), `DELETE /api/me` (password-confirmed account deletion, cascades data and stored files), per-document and per-program deletion.
- **Logging:** request logs record method and path without query strings, and redact the `Authorization` and `Cookie` headers; request bodies (document text, prompts, tutor messages) are not logged by the API. Application code paths that log errors have not been audited line by line.

## Not done / known gaps

- No malware scanning of uploads; no CSRF concern for bearer tokens but tokens are in `localStorage` on web (XSS would expose them); no email verification or password reset; no 2FA; no account lockout beyond rate limits.
- No formal retention job; no encryption of stored objects at rest beyond what the host provides.
- No penetration test. The automated suite is a regression net, not an audit.
- Security headers/TLS are the deployment's responsibility (see `deployment.md`).
- Third-party processors (LLM/OCR provider) are configurable and must be documented per deployment ⚖.

## Manual review checklist before launch

1. Legal sign-off of `content-rights-policy.md` open questions. 2. DPA/no-training terms with the LLM provider. 3. DPIA for minors' data. 4. Pen test of upload, auth and research fetch. 5. Review the privacy text shown at registration.
