# StudyCloud

AI study companion for German students (grades 1–13). Students upload their own worksheets and notes; StudyCloud turns them into structured lessons, a study plan and an AI tutor ("Cloudy") — and shows **exactly where every piece of information came from**.

> **Status: Phase 1 foundation (hackathon build).** It runs end to end locally, but it has not had a legal review, a penetration test, or real-device testing. See [Known limitations](#known-limitations) before relying on any claim here.

## Principles (enforced in code, not only in prompts)

- **Every external fact must be verifiable.** The LLM can only point at run-scoped evidence ids created by the backend. URLs, titles, licences and the retrieval timestamp come from stored source records; the quote must be found in the retrieved text, and numbers must match. Unverifiable blocks are dropped and the student is told.
- **Internet access ≠ permission.** A deterministic `ContentRightsService` (deny by default, per operation) decides what may be done with a source. An LLM's statement about a licence is never an input.
- **Uploads are private.** Owner-only access, random storage keys, no public URLs; content goes to the AI provider only with explicit consent.
- **No invented numbers.** Dashboards show stored activity only. Unknown publication dates show "Not available".

## Repository layout

| Path | What |
|---|---|
| `server/` | Fastify + TypeScript API, PostgreSQL (embedded PGlite for dev, `DATABASE_URL` for production), rights engine, research + verification, AI pipeline, tutor, planner |
| `app/` | Expo (React Native + web) app, Expo Router, TanStack Query, German/English UI, light/dark theme |
| `docs/` | Architecture, AI pipeline, source attribution, rights policy, privacy/security, database, deployment, design research |

## Quick start

Requires Node 20+.

```bash
# 1. API (embedded database, no external services needed)
cd server
npm install
npm run dev            # http://127.0.0.1:8787

# 2. App (web)
cd ../app
npm install
npm run web            # http://localhost:8081
```

Without an LLM key the app runs fully, but "create program", the tutor and photo OCR report *"AI is not configured"* instead of faking results. To enable them, set on the server:

```bash
export LLM_API_KEY=...                      # or FIREWORKS_API_KEY
export LLM_BASE_URL=https://api.fireworks.ai/inference/v1   # any OpenAI-compatible endpoint
export LLM_MODEL=<model id>
export OCR_MODEL=<vision model id>          # optional; needed to read photos
```

The app finds the API through `EXPO_PUBLIC_API_URL` (default `http://localhost:8787`).

## Tests and checks

```bash
cd server && npm test && npm run typecheck     # 94 tests
cd app    && npm test && npm run typecheck     # 16 tests
cd app    && npm run export:web                # production web bundle
```

Server tests cover auth and isolation between users, uploads and file validation, extraction, the rights matrix (CC BY / BY-SA / BY-NC / BY-ND, public domain, paywalled, private uploads, unknown and conflicting terms), SSRF protection, source provenance and timestamps, citation verification, prompt-injection handling, the tutor and the planner. App tests cover WCAG contrast of the design tokens, DE/EN dictionary parity, math rendering and timestamp localisation. The LLM is **scripted** in tests; no test calls a real model.

`server/scripts/mock-llm.mjs` is a **development-only** stand-in for an OpenAI-compatible endpoint so the whole UI can be exercised offline. It is not an integration with a real model and its answers are canned.

## Known limitations

- **No real LLM has been run against this code.** The adapter is OpenAI-compatible and unit-tested with scripted responses; output quality with a real model is untested.
- **Legal review pending.** The rights engine implements a conservative policy, but the policy itself (e.g. § 60a UrhG applicability, TDM reservations, minors' consent age) needs review by a lawyer. See `docs/content-rights-policy.md`.
- **Research provider: Wikipedia only** (CC BY-SA 4.0, ShareAlike condition recorded). Official ministry/KMK/OER providers are designed for but not implemented.
- **Photos need `OCR_MODEL`.** HEIC cannot be read server-side; the app asks the picker for JPEG, which is untested on real iOS devices.
- **Scanned PDFs** (no text layer) are rejected with a clear message; upload them as photos.
- **Math** is rendered as Unicode text from a LaTeX subset, not typeset.
- **Not tested on physical iOS/Android devices**, no screen-reader pass beyond semantics/labels and measured contrast.
- Storage is local filesystem (`LocalFsStorage`); an S3-compatible adapter is the intended production path.
- Mini-games, PC games and the Learning Lab are **not** implemented (stable ids and tables are in place for them).

## Licence

See `LICENSE`.
