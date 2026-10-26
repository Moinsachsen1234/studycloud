# Architecture

```
Expo app (iOS / Android / web)  ──HTTPS/JSON──▶  Fastify API
                                                  ├─ auth (scrypt, opaque sessions), consents
                                                  ├─ documents  → validate → private storage → JobRunner
                                                  │                         extract (pdf/docx/txt/OCR) → analyze
                                                  ├─ ContentRightsService   (pure, deterministic)
                                                  ├─ ResearchService        (safeFetch + providers + cache)
                                                  ├─ SourceVerificationService
                                                  ├─ AI pipeline / tutor    (LlmProvider adapter)
                                                  ├─ planner, progress, dashboard
                                                  └─ PostgreSQL (PGlite in dev)
```

## Decisions

- **Modular monolith, TypeScript end to end.** Business logic lives in `server/src/*` with no framework coupling except `app.ts`/`routes/*`, so it can move behind another HTTP layer.
- **Own auth instead of a hosted service.** Passwords use scrypt with a per-user salt; sessions are random opaque tokens stored hashed; login does a dummy hash for unknown emails (timing). Chosen so the app is self-hostable and testable offline. Supabase remains a possible migration target.
- **PostgreSQL everywhere.** PGlite (embedded Postgres) when `DATABASE_URL` is unset so `npm run dev` and the tests need no services; real Postgres in production. The same SQL runs on both.
- **Provider-independent AI.** `LlmProvider` has `json()`/`ocr()`; the only adapter is OpenAI-compatible (Fireworks by default). Keys are read from the environment on the server and never sent to clients.
- **Job runner in-process.** `processing_jobs` rows with real statuses (`queued → processing → analyzing → completed | failed`), retries and error messages. An external queue is unnecessary at this scale; the table is the interface.
- **Expo Router app** with a single codebase: bottom tabs on phones, sidebar on wide screens; settings via the top bar. Auth/onboarding gate in the root layout. Server state via TanStack Query; no client store for server data.
- **i18n:** German default, English complete; UI language is separate from the studied language (a German UI can be used to learn English).
- **Design system:** tokens in `app/src/theme`; contrast is measured in a test. The suggested brand violet `#7A61E8` gives 4.47:1 with white (just under AA), so it is used decoratively and the filled-button colour is `#6A50D8`.

## Extension points (prepared, not built)

- Stable UUIDs for concepts, learning objectives, lessons, claims and sources, so future games can consume verified content through the same tables and inherit the same rights checks.
- `assessment_events` (intended append-only) for later assessments, delayed recall and the Learning Lab; no learner-type labels are stored.
- `subjects` rows are data (name, icon, colour, objectives); adding History, French etc. needs no code change.
