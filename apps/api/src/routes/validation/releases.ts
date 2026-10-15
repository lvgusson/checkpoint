// Esquemas Zod para as rotas de versões (/api/v1/releases).
import { z } from 'zod';
import {
  RELEASE_KINDS,
  ENVIRONMENTS,
  type ReleaseKind,
  type Environment,
  type Bump,
} from '../../domain/releases.ts';

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA_REGEX = /^[0-9a-fA-F]{40}$/;

export const releaseKindValues = RELEASE_KINDS.filter(
  (k): k is Exclude<ReleaseKind, 'rollback'> => k !== 'rollback',
) as [Exclude<ReleaseKind, 'rollback'>, ...Exclude<ReleaseKind, 'rollback'>[]];

export const environmentValues = [...ENVIRONMENTS] as [Environment, ...Environment[]];
export const bumpValues: [Bump, ...Bump[]] = ['patch', 'minor', 'major'];

export const getReleasesQuerySchema = z
  .object({
    environment: z.enum(environmentValues).optional().default('production'),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    before: z.coerce.number().int().min(1).nullable().optional(),
  })
  .strict();

export const getLatestReleaseQuerySchema = z
  .object({
    environment: z.enum(environmentValues).optional().default('production'),
  })
  .strict();

export const postReleaseBodySchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(3, 'description deve ter de 3 a 500 caracteres')
      .max(500, 'description deve ter de 3 a 500 caracteres'),
    kind: z.enum(releaseKindValues, {
      message: `kind deve ser um de: ${releaseKindValues.join(', ')}`,
    }),
    name: z
      .string()
      .trim()
      .min(1, 'name deve ter de 1 a 80 caracteres')
      .max(80, 'name deve ter de 1 a 80 caracteres')
      .nullable()
      .optional(),
    bump: z.enum(bumpValues, { message: 'bump deve ser patch, minor ou major' }).optional(),
    version: z
      .string()
      .trim()
      .regex(SEMVER_REGEX, 'version deve ser SemVer (ex.: 1.0.0)')
      .nullable()
      .optional(),
    gitSha: z.string().trim().regex(SHA_REGEX, 'gitSha deve conter 40 caracteres hexadecimais'),
    gitRef: z.string().trim().min(1).max(200, 'gitRef inválido').nullable().optional(),
    environment: z
      .enum(environmentValues, {
        message: 'environment deve ser production, preview ou development',
      })
      .optional()
      .default('production'),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.version !== undefined && val.version !== null && val.bump !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Envie version ou bump, não os dois',
      });
    }
  });

export type GetReleasesQuery = z.infer<typeof getReleasesQuerySchema>;
export type GetLatestReleaseQuery = z.infer<typeof getLatestReleaseQuerySchema>;
export type PostReleaseBody = z.infer<typeof postReleaseBodySchema>;
