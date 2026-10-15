// Esquemas Zod para as rotas de configurações do algoritmo (/api/v1/settings/scoring).
import { z } from 'zod';
import { Desire } from '../../../../../packages/core/src/models.ts';

const filterDesires = [
  Desire.VeryHigh,
  Desire.High,
  Desire.Medium,
  Desire.Low,
  Desire.VeryLow,
] as const;

export const scoringWeightsSchema = z
  .object({
    desire: z.number().min(0).max(10),
    affinity: z.number().min(0).max(10),
    duration: z.number().min(0).max(10),
    inProgress: z.number().min(-1000).max(1000),
    repeatGenre: z.number().min(-1000).max(1000),
    repeatGenreTwoBack: z.number().min(-1000).max(1000),
    repeatMechanic: z.number().min(-1000).max(1000),
    longHours: z.number().min(0).max(10000),
    consecutiveLong: z.number().min(-1000).max(1000),
    recentHours: z.number().min(0).max(10000),
    longAfterHeavy: z.number().min(-1000).max(1000),
    repeatPace: z.number().min(-1000).max(1000),
    contrastingPace: z.number().min(-1000).max(1000),
    shortAfterLong: z.number().min(-1000).max(1000),
    shortHours: z.number().min(0).max(10000),
    freeDurationHours: z.number().min(0).max(10000),
    priorStrength: z.number().min(0).max(100),
    neutralAffinity: z.number().min(0).max(100),
    repeatTag: z.number().min(-1000).max(1000),
    repeatTagTwoBack: z.number().min(-1000).max(1000),
  })
  .strict();

export const scoringRulesSchema = z
  .object({
    desire: z.boolean(),
    affinity: z.boolean(),
    duration: z.boolean(),
    timeFactor: z.boolean(),
    inProgress: z.boolean(),
    repeatGenre: z.boolean(),
    repeatGenreTwoBack: z.boolean(),
    repeatMechanic: z.boolean(),
    repeatTag: z.boolean(),
    repeatTagTwoBack: z.boolean(),
    consecutiveLong: z.boolean(),
    longAfterHeavy: z.boolean(),
    repeatPace: z.boolean(),
    contrastingPace: z.boolean(),
    shortAfterLong: z.boolean(),
    excludeEndless: z.boolean(),
    excludeAbandoned: z.boolean(),
    excludeCompetitive: z.boolean(),
    prerequisites: z.boolean(),
    manual: z.boolean(),
  })
  .strict();

export const scoringFiltersSchema = z
  .object({
    excludedGenres: z.array(z.string().trim().min(1).max(100)).max(200),
    excludedTags: z.array(z.string().trim().min(1).max(100)).max(200),
    stores: z.array(z.string().trim().min(1).max(100)).max(200),
    paces: z.array(z.string().trim().min(1).max(100)).max(200),
    minHours: z.number().min(0).max(10000).nullable(),
    maxHours: z.number().min(0).max(10000).nullable(),
    excludeUnknownHours: z.boolean(),
    coopOnly: z.boolean(),
    minDesire: z.enum(filterDesires).nullable(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.minHours !== null && val.maxHours !== null && val.minHours > val.maxHours) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Filtro de horas: o mínimo passa do máximo',
      });
    }
  });

export const scoringConfigSchema = z
  .object({
    weights: scoringWeightsSchema,
    rules: scoringRulesSchema,
    filters: scoringFiltersSchema,
  })
  .strict();

export type ScoringWeightsInput = z.infer<typeof scoringWeightsSchema>;
export type ScoringRulesInput = z.infer<typeof scoringRulesSchema>;
export type ScoringFiltersInput = z.infer<typeof scoringFiltersSchema>;
export type ScoringConfigInput = z.infer<typeof scoringConfigSchema>;
