import path from 'node:path';

export interface AppConfig {
  port: number;
  host: string;
  /** If unset, an embedded PostgreSQL (PGlite) is used at dataDir/pgdata. Set for production. */
  databaseUrl?: string;
  dataDir: string;
  storageDir: string;
  maxUploadBytes: number;
  corsOrigins: string[];
  sessionTtlDays: number;
  /** GDPR Art. 8 / Germany: below this age parental consent is required. */
  digitalConsentAge: number;
  llm: {
    provider: 'none' | 'openai_compatible';
    baseUrl: string;
    apiKey?: string;
    model?: string;
    /** Disclosed in the privacy notice shown to students. */
    providerLabel: string;
  };
  ocr: { enabled: boolean; model?: string };
  research: { enabled: boolean; cacheTtlHours: number; userAgent: string };
  dailyAiCallLimit: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(env.DATA_DIR ?? './data');
  const hasKey = !!env.LLM_API_KEY || !!env.FIREWORKS_API_KEY;
  const baseUrl = env.LLM_BASE_URL ?? 'https://api.fireworks.ai/inference/v1';
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL,
    dataDir,
    storageDir: path.resolve(env.STORAGE_DIR ?? path.join(dataDir, 'objects')),
    maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:19006').split(',').map((s) => s.trim()),
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 30),
    digitalConsentAge: Number(env.DIGITAL_CONSENT_AGE ?? 16),
    llm: {
      provider: hasKey && env.LLM_MODEL ? 'openai_compatible' : 'none',
      baseUrl,
      apiKey: env.LLM_API_KEY ?? env.FIREWORKS_API_KEY,
      model: env.LLM_MODEL,
      providerLabel: env.LLM_PROVIDER_LABEL ?? new URL(baseUrl).hostname,
    },
    ocr: { enabled: hasKey && !!env.OCR_MODEL, model: env.OCR_MODEL },
    research: {
      enabled: (env.RESEARCH_ENABLED ?? 'true') !== 'false',
      cacheTtlHours: Number(env.RESEARCH_CACHE_TTL_HOURS ?? 72),
      userAgent: env.RESEARCH_USER_AGENT ?? 'StudyCloudBot/0.1 (educational research; contact: set RESEARCH_USER_AGENT)',
    },
    dailyAiCallLimit: Number(env.DAILY_AI_CALL_LIMIT ?? 100),
  };
}
