// Esquemas Zod para as rotas de listas (/api/v1/lists, /api/v1/lists/:listId).
import { z } from 'zod';

export const listIdParamSchema = z
  .object({
    listId: z.string().uuid('Id da lista deve ser um UUID válido'),
  })
  .strict();

export const createListBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'O nome da lista deve ter de 1 a 60 caracteres')
      .max(60, 'O nome da lista deve ter de 1 a 60 caracteres'),
  })
  .strict();

export const renameListBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'O nome da lista deve ter de 1 a 60 caracteres')
      .max(60, 'O nome da lista deve ter de 1 a 60 caracteres'),
  })
  .strict();

export type ListIdParam = z.infer<typeof listIdParamSchema>;
export type CreateListBody = z.infer<typeof createListBodySchema>;
export type RenameListBody = z.infer<typeof renameListBodySchema>;
