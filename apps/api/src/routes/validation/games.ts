// Esquemas Zod para as rotas de jogos (/api/v1/games, /api/v1/games/search, /api/v1/games/:id).
import { z } from 'zod';
import { GameStatus, Desire } from '../../../../../packages/core/src/models.ts';

export const gameStatusValues = Object.values(GameStatus) as [GameStatus, ...GameStatus[]];
export const desireValues = Object.values(Desire) as [Desire, ...Desire[]];

export const getGamesQuerySchema = z
  .object({
    q: z.string().max(200).optional(),
    status: z.enum(gameStatusValues).optional(),
    primaryGenre: z.string().max(100).optional(),
    store: z.string().max(100).optional(),
    sort: z.enum(['score', 'desire', 'name']).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(24),
  })
  .strict();

export const searchGamesQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(3, 'Busque usando pelo menos 3 caracteres')
      .max(120, 'Busque usando até 120 caracteres'),
    excludeId: z.string().max(200).optional(),
  })
  .strict();

export const gameIdParamSchema = z
  .object({
    id: z.string().min(1).max(200),
  })
  .strict();

export const patchGameBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Texto inválido: name').max(10000).optional(),
    primaryGenre: z.string().max(10000).optional(),
    store: z.string().max(10000).optional(),
    platform: z.string().max(10000).optional(),
    pace: z.string().max(10000).optional(),
    structure: z.string().max(10000).optional(),
    notes: z.string().max(10000).optional(),
    size: z.string().max(10000).optional(),
    timeVerification: z.string().max(10000).optional(),
    timeSource: z.string().max(10000).optional(),
    reviewNotes: z.string().max(10000).optional(),
    coop: z.string().max(10000).optional(),
    mechanic: z.string().max(10000).optional(),
    actualHours: z
      .number()
      .min(0, 'Horas inválidas')
      .max(100000, 'Horas inválidas')
      .nullable()
      .optional(),
    mainHours: z
      .number()
      .min(0, 'Horas inválidas')
      .max(100000, 'Horas inválidas')
      .nullable()
      .optional(),
    extraHours: z
      .number()
      .min(0, 'Horas inválidas')
      .max(100000, 'Horas inválidas')
      .nullable()
      .optional(),
    completionistHours: z
      .number()
      .min(0, 'Horas inválidas')
      .max(100000, 'Horas inválidas')
      .nullable()
      .optional(),
    previousEstimatedHours: z
      .number()
      .min(0, 'Horas inválidas')
      .max(100000, 'Horas inválidas')
      .nullable()
      .optional(),
    startedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
      .nullable()
      .optional(),
    finishedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
      .nullable()
      .optional(),
    status: z.enum(gameStatusValues, { message: 'Status inválido' }).optional(),
    desire: z.enum(desireValues, { message: 'Vontade inválida' }).optional(),
    rating: z
      .number()
      .min(1, 'A nota deve ser de 1 a 5')
      .max(5, 'A nota deve ser de 1 a 5')
      .nullable()
      .optional(),
    secondaryTags: z
      .array(z.string().trim().min(1).max(80))
      .max(3, 'Use até três tags secundárias')
      .optional(),
    prerequisiteId: z.string().min(1).max(200).nullable().optional(),
    autoFinish: z.boolean({ message: 'autoFinish precisa ser booleano' }).optional(),
  })
  .strict();

export type GetGamesQuery = z.infer<typeof getGamesQuerySchema>;
export type SearchGamesQuery = z.infer<typeof searchGamesQuerySchema>;
export type GameIdParam = z.infer<typeof gameIdParamSchema>;
export type PatchGameBody = z.infer<typeof patchGameBodySchema>;
