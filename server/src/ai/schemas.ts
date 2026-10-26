import { z } from 'zod';

export const GroundingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('material'), ref: z.string().min(1).max(12), quote: z.string().max(500).optional() }),
  z.object({ kind: z.literal('external'), ref: z.string().min(1).max(12), quote: z.string().min(20).max(500), claim: z.string().min(10).max(300) }),
]);
export type Grounding = z.infer<typeof GroundingSchema>;

export const BLOCK_TYPES = ['explanation', 'definition', 'formula', 'worked_example', 'common_mistake', 'summary', 'revision_activity'] as const;

export const BlockSchema = z.object({
  type: z.enum(BLOCK_TYPES),
  title: z.string().max(160).optional(),
  text: z.string().min(1).max(4000),
  origin: z.enum(['material', 'external', 'ai_explanation']),
  grounding: z.array(GroundingSchema).max(4).default([]),
  checks: z.array(z.object({ expression: z.string().max(200), expected: z.number() })).max(6).optional(),
});
export type LlmBlock = z.infer<typeof BlockSchema>;

export const LessonSchema = z.object({
  title: z.string().min(1).max(160),
  objective_keys: z.array(z.string()).max(6).default([]),
  estimated_minutes: z.number().int().min(1).max(180).default(10),
  blocks: z.array(BlockSchema).min(1).max(14),
});

export const ProgramSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(800),
  estimated_minutes: z.number().int().min(1).max(1200).optional(),
  lessons: z.array(LessonSchema).min(1).max(12),
});
export type LlmProgram = z.infer<typeof ProgramSchema>;

export const ObjectivesSchema = z.object({
  objectives: z.array(z.object({ key: z.string().min(1).max(20), text: z.string().min(3).max(300) })).min(1).max(10),
  grade_min: z.number().int().min(1).max(13).optional(),
  grade_max: z.number().int().min(1).max(13).optional(),
  gaps: z
    .array(z.object({ objective_key: z.string(), query: z.string().min(3).max(100), reason: z.string().max(300).optional() }))
    .max(6)
    .default([]),
});

export const AnalysisSchema = z.object({
  subject_guess: z.string().max(60).optional(),
  grade_min: z.number().int().min(1).max(13).optional(),
  grade_max: z.number().int().min(1).max(13).optional(),
  concepts: z
    .array(z.object({ kind: z.enum(['concept', 'definition', 'formula', 'prerequisite', 'misconception']), name: z.string().min(1).max(120), description: z.string().max(500).optional() }))
    .max(40),
  objectives: z.array(z.string().min(3).max(300)).max(10),
});

export const TutorAnswerSchema = z.object({
  answer: z.string().min(1).max(6000),
  citations: z.array(GroundingSchema).max(6).default([]),
});
