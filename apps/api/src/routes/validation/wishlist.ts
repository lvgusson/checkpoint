// Esquemas Zod para a lista de desejos e integração com Steam (/api/v1/steam/*, /api/v1/wishlist/*).
import { z } from 'zod';
import { Desire } from '../../../../../packages/core/src/models.ts';

const desireValues = Object.values(Desire) as [Desire, ...Desire[]];

export const steamSearchQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1, 'Informe o nome (1 a 100 caracteres)')
      .max(100, 'Informe o nome (1 a 100 caracteres)'),
  })
  .strict();

export const steamAppParamSchema = z
  .object({
    appId: z.coerce
      .number()
      .int('appId inválido')
      .min(1, 'appId inválido')
      .max(2147483647, 'appId inválido'),
  })
  .strict();

export const addWishlistSteamBodySchema = z
  .object({
    appId: z
      .number()
      .int('appId inválido')
      .min(1, 'appId inválido')
      .max(2147483647, 'appId inválido'),
    desire: z.enum(desireValues, { message: 'Vontade inválida' }).optional(),
  })
  .strict();

export const addWishlistManualBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome do jogo').max(300, 'Informe o nome do jogo'),
    primaryGenre: z.string().max(10000).optional(),
    store: z.string().max(10000).optional(),
    platform: z.string().max(10000).optional(),
    pace: z.string().max(10000).optional(),
    structure: z.string().max(10000).optional(),
    notes: z.string().max(10000).optional(),
    size: z.string().max(10000).optional(),
    coop: z.string().max(10000).optional(),
    mechanic: z.string().max(10000).optional(),
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
    desire: z.enum(desireValues, { message: 'Vontade inválida' }).optional(),
    secondaryTags: z
      .array(z.string().trim().min(1).max(80))
      .max(3, 'Use até três tags secundárias')
      .optional(),
    steamAppId: z.number().int('appId inválido').min(1).max(2147483647).nullable().optional(),
  })
  .strict();

export const addWishlistBodySchema = z.union([
  addWishlistSteamBodySchema,
  addWishlistManualBodySchema,
]);

export const importSteamWishlistBodySchema = z
  .object({
    profile: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type SteamSearchQuery = z.infer<typeof steamSearchQuerySchema>;
export type SteamAppParam = z.infer<typeof steamAppParamSchema>;
export type AddWishlistSteamBody = z.infer<typeof addWishlistSteamBodySchema>;
export type AddWishlistManualBody = z.infer<typeof addWishlistManualBodySchema>;
export type AddWishlistBody = z.infer<typeof addWishlistBodySchema>;
export type ImportSteamWishlistBody = z.infer<typeof importSteamWishlistBodySchema>;
