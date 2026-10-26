# Deployment

Nothing in this repository deploys itself, and no hosted environment exists yet.

## Server

Node 20+. `cd server && npm ci && npm start` (runs via `tsx`). Configure with environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `PORT`, `HOST` | listen address | `8787`, `127.0.0.1` |
| `DATABASE_URL` | PostgreSQL URL (**set this in production**) | embedded PGlite |
| `DATA_DIR`, `STORAGE_DIR` | local data / object storage | `./data`, `DATA_DIR/objects` |
| `MAX_UPLOAD_MB` | upload limit | `20` |
| `CORS_ORIGINS` | allowed web origins, comma-separated | localhost dev origins |
| `SESSION_TTL_DAYS` | session lifetime | `30` |
| `DIGITAL_CONSENT_AGE` | guardian-consent threshold | `16` |
| `LLM_API_KEY` / `FIREWORKS_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER_LABEL` | AI provider (shown to students) | none; Fireworks URL |
| `OCR_MODEL` | vision model for photos | unset → photos rejected |
| `DAILY_AI_CALL_LIMIT` | per-user daily AI calls | see `config.ts` |
| `RESEARCH_ENABLED`, `RESEARCH_CACHE_TTL_HOURS`, `RESEARCH_USER_AGENT` | research | on, see `config.ts` |

Before production: put the API behind TLS and a reverse proxy, use managed PostgreSQL, replace `LocalFsStorage` with a private S3-compatible bucket adapter (not yet written), set a descriptive `RESEARCH_USER_AGENT` with a contact, and complete the checklist in `privacy-and-security.md`.

## App

```bash
cd app
EXPO_PUBLIC_API_URL=https://api.example.org npx expo export --platform web   # static site in dist/
```

Serve `dist/` with an SPA fallback to `index.html`. Native builds use EAS (not configured here); `app.json` already carries the iOS permission strings and the `studycloud` scheme.
