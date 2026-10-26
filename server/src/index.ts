import fs from 'node:fs';
import { loadConfig } from './config';
import { openPglite, openPostgres } from './db/db';
import { LocalFsStorage } from './storage';
import { OpenAiCompatibleProvider, type LlmProvider } from './ai/llm';
import { DEFAULT_PROVIDERS } from './research/providers';
import { ResearchService } from './research/researchService';
import { SourceVerificationService } from './research/verification';
import { JobRunner } from './documents/jobs';
import { buildApp, seedSubjects, type AppContext } from './app';
import type { PipelineDeps } from './ai/pipeline';

export async function createContext(env: NodeJS.ProcessEnv = process.env): Promise<AppContext> {
  const config = loadConfig(env);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = config.databaseUrl ? await openPostgres(config.databaseUrl) : await openPglite(`${config.dataDir}/pgdata`);
  await seedSubjects(db);
  const storage = new LocalFsStorage(config.storageDir);
  let llm: LlmProvider | null = null;
  if (config.llm.provider === 'openai_compatible') {
    llm = new OpenAiCompatibleProvider({ baseUrl: config.llm.baseUrl, apiKey: config.llm.apiKey!, model: config.llm.model!, ocrModel: config.ocr.model, label: config.llm.providerLabel });
  }
  const research = config.research.enabled ? new ResearchService(db, DEFAULT_PROVIDERS, { cacheTtlHours: config.research.cacheTtlHours, userAgent: config.research.userAgent }) : null;
  const verifier = research ? new SourceVerificationService(db, DEFAULT_PROVIDERS) : null;
  const pipeline: PipelineDeps = { db, llm, research, verifier, dailyAiCallLimit: config.dailyAiCallLimit };
  const jobs = new JobRunner(db, storage, llm, pipeline, { log: (m, x) => console.error(m, x) });
  return { db, config, storage, llm, research, verifier, jobs, pipeline };
}

async function main() {
  const ctx = await createContext();
  const app = await buildApp(ctx);
  await ctx.jobs.recover();
  await app.listen({ port: ctx.config.port, host: ctx.config.host });
  app.log.info(`StudyCloud API ready. AI: ${ctx.llm ? ctx.llm.name + '/' + ctx.llm.model : 'NOT CONFIGURED'}, research: ${ctx.research ? 'on' : 'off'}`);
  const stop = async () => {
    await app.close();
    await ctx.db.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && /index\.[tj]s$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
