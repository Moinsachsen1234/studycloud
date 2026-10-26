# Database

PostgreSQL schema is created idempotently from `server/src/db/schema.ts` at start-up. Embedded PGlite is used when `DATABASE_URL` is not set.

## Tables

- **Identity:** `users`, `sessions`, `consents`, `student_profiles`, `school_profiles`
- **Curriculum:** `subjects` (system or user-defined, data not code), `user_subjects`, `topics`, `collections`
- **Documents:** `documents`, `processing_jobs`, `document_segments`, `concepts`
- **Learning:** `learning_programs`, `program_documents`, `learning_objectives`, `lessons`, `lesson_progress`, `study_sessions`, `assessment_events`
- **Sources and rights:** `external_sources`, `source_usage_permissions`, `rights_decisions`, `educational_claims`, `claim_sources`
- **Planning:** `exams`, `study_availability`, `plan_items`
- **Tutor / usage:** `tutor_conversations`, `tutor_messages` (ordered by an identity `seq`, because timestamps can tie), `ai_usage`

## Notes

- Relations use foreign keys with `ON DELETE CASCADE` where data belongs to a user, so account deletion removes everything; `external_sources` are shared cache rows keyed by URL and do not contain user data.
- `external_sources.published_at` / `updated_at` are nullable by design; `retrieved_at` is `NOT NULL timestamptz` set by the server.
- `source_usage_permissions` stores the rights outcome per source and intended use, with `review_expires_at`.
- `claim_sources` links a claim to a source and the verified location, so lessons can be regenerated without losing provenance of retained claims.
- `assessment_events` is intended to be append-only (not enforced by the database) and is unused by the UI in phase 1; it exists for delayed-recall and the future Learning Lab.
- `external_sources` also holds `last_used_at` (cache hits update this, never `retrieved_at`), `expires_at` (freshness policy), `content_sha256` (the text itself is **not** stored; the hash lets verification detect that evidence changed), `http_status`, and per-axis `credibility` ratings. Uniqueness is `(canonical_url, content_sha256)`: a changed page becomes a new row, so older claims keep the version they were verified against.
- Indexes cover user-scoped lookups, full-text search over document segments, plan dates, and source lookup by URL.
