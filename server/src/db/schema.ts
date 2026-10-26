/**
 * StudyCloud PostgreSQL schema (idempotent). See docs/database.md.
 * All user-owned rows carry user_id and are deleted via ON DELETE CASCADE on account deletion.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  birth_year int NOT NULL CHECK (birth_year BETWEEN 1900 AND 2100),
  guardian_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('privacy_policy','terms','ai_processing','guardian')),
  version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz
);
CREATE INDEX IF NOT EXISTS consents_user_kind_idx ON consents (user_id, kind);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  grade int NOT NULL CHECK (grade BETWEEN 1 AND 13),
  ui_language text NOT NULL DEFAULT 'de' CHECK (ui_language IN ('de','en')),
  time_zone text NOT NULL DEFAULT 'Europe/Berlin',
  learning_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  onboarding_completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  federal_state text NOT NULL,
  school_type text NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id text PRIMARY KEY,
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name_de text NOT NULL,
  name_en text NOT NULL,
  icon text NOT NULL,
  color text NOT NULL,
  learning_objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 100,
  study_language text
);

CREATE TABLE IF NOT EXISTS user_subjects (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, subject_id)
);

CREATE TABLE IF NOT EXISTS topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS topics_user_subject_idx ON topics (user_id, subject_id);

CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES topics(id) ON DELETE SET NULL,
  collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,
  name text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  storage_key text NOT NULL,
  page_count int,
  content_category text NOT NULL DEFAULT 'D' CHECK (content_category = 'D'),
  rights_acknowledged_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_user_idx ON documents (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued','uploading','processing','analyzing','completed','failed')),
  analysis_state text NOT NULL DEFAULT 'pending' CHECK (analysis_state IN ('pending','done','skipped','failed')),
  analysis_note text,
  attempt int NOT NULL DEFAULT 1,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_doc_idx ON processing_jobs (document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS document_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ordinal int NOT NULL,
  page int,
  heading text,
  text text NOT NULL,
  UNIQUE (document_id, ordinal)
);
CREATE INDEX IF NOT EXISTS segments_fts_idx ON document_segments USING gin (to_tsvector('simple', text));

CREATE TABLE IF NOT EXISTS concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('concept','definition','formula','prerequisite','misconception')),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES topics(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  grade_min int NOT NULL,
  grade_max int NOT NULL,
  estimated_minutes int NOT NULL,
  source_mode text NOT NULL CHECK (source_mode IN ('materials_only','materials_plus_research')),
  generation_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS program_documents (
  program_id uuid NOT NULL REFERENCES learning_programs(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, document_id)
);

CREATE TABLE IF NOT EXISTS learning_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id uuid REFERENCES learning_programs(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  objective_key text,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES learning_programs(id) ON DELETE CASCADE,
  ordinal int NOT NULL,
  title text NOT NULL,
  estimated_minutes int NOT NULL,
  objective_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocks jsonb NOT NULL,
  UNIQUE (program_id, ordinal)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('in_progress','completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  seconds int NOT NULL CHECK (seconds BETWEEN 1 AND 14400),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Future Learning Lab / games: generic, append-only assessment events (not used in Phase 1 UI).
CREATE TABLE IF NOT EXISTS assessment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES concepts(id) ON DELETE SET NULL,
  objective_id uuid REFERENCES learning_objectives(id) ON DELETE SET NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

/* ---------- Source & rights infrastructure ---------- */
CREATE TABLE IF NOT EXISTS external_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  title text NOT NULL,
  author text,
  publisher text,
  canonical_url text NOT NULL,
  final_url text NOT NULL,
  source_type text NOT NULL,
  language text,
  published_at timestamptz,          -- nullable: never invented
  updated_at timestamptz,            -- nullable: never invented
  retrieved_at timestamptz NOT NULL, -- system-generated at actual retrieval
  last_used_at timestamptz,          -- cache hits update THIS, never retrieved_at
  expires_at timestamptz NOT NULL,   -- freshness policy
  content_sha256 text NOT NULL,
  http_status int NOT NULL,
  verification_status text NOT NULL CHECK (verification_status IN ('unverified','verified','failed')),
  verified_at timestamptz,
  license_identifier text,
  license_url text,
  license_holder text,
  rights_status text NOT NULL CHECK (rights_status IN ('licensed','public_domain','factual_only','restricted','unknown')),
  credibility jsonb NOT NULL DEFAULT '{}'::jsonb, -- factual, currency, curriculum, access, reuse ratings
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_url, content_sha256)
);
CREATE INDEX IF NOT EXISTS ext_sources_url_idx ON external_sources (canonical_url, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS source_usage_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES external_sources(id) ON DELETE CASCADE,
  intended_use text NOT NULL,
  permission_status text NOT NULL CHECK (permission_status IN ('ALLOW','ALLOW_WITH_CONDITIONS','REVIEW_REQUIRED','DENY')),
  license_basis text,
  restriction_details text,
  reviewed_at timestamptz,
  review_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, intended_use)
);

CREATE TABLE IF NOT EXISTS rights_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES external_sources(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  operation text NOT NULL,
  outcome text NOT NULL,
  reasons jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS educational_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  learning_objective_id uuid REFERENCES learning_objectives(id) ON DELETE SET NULL,
  program_id uuid REFERENCES learning_programs(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES lessons(id) ON DELETE CASCADE,
  conversation_id uuid,
  claim_text text NOT NULL,
  verification_status text NOT NULL CHECK (verification_status IN ('unverified','verified','failed','material_grounded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claims_program_idx ON educational_claims (program_id);

CREATE TABLE IF NOT EXISTS claim_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES educational_claims(id) ON DELETE CASCADE,
  source_id uuid REFERENCES external_sources(id) ON DELETE RESTRICT,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  segment_id uuid REFERENCES document_segments(id) ON DELETE SET NULL,
  supporting_location text,
  evidence_hash text,
  support_status text NOT NULL CHECK (support_status IN ('supported','partially_supported','unsupported')),
  CHECK ((source_id IS NOT NULL AND document_id IS NULL) OR (source_id IS NULL AND document_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS claim_sources_claim_idx ON claim_sources (claim_id);

/* ---------- Planner ---------- */
CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  exam_date date NOT NULL,
  goal text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS study_availability (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Monday
  minutes int NOT NULL CHECK (minutes BETWEEN 0 AND 600),
  PRIMARY KEY (user_id, weekday)
);
CREATE TABLE IF NOT EXISTS plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES lessons(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lesson','revision')),
  title text NOT NULL,
  scheduled_for date NOT NULL,
  minutes int NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','skipped')),
  completed_at timestamptz,
  rescheduled_from date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_items_user_day_idx ON plan_items (user_id, scheduled_for);

/* ---------- Tutor ---------- */
CREATE TABLE IF NOT EXISTS tutor_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  program_id uuid REFERENCES learning_programs(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tutor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY, -- monotonic order (timestamps can tie on coarse clocks)
  conversation_id uuid NOT NULL REFERENCES tutor_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  calls int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
`;
