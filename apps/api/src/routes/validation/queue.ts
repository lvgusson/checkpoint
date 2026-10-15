// Esquemas Zod para a fila e ajustes manuais (/api/v1/queue/reorder, /api/v1/queue/adjustments, /api/v1/recommendations).
import { z } from 'zod';

export const reorderQueueBodySchema = z
  .object({
    gameId: z.string().min(1, 'gameId inválido').max(200, 'gameId inválido'),
    toPosition: z
      .number()
      .int('toPosition deve ser um inteiro a partir de 1')
      .min(1, 'toPosition deve ser um inteiro a partir de 1')
      .max(100000, 'toPosition deve ser um inteiro a partir de 1'),
  })
  .strict();

export const listScopedParamsSchema = z
  .object({
    listId: z.string().uuid('Id da lista deve ser um UUID válido').optional(),
  })
  .strict();

export const resetManualParamsSchema = z
  .object({
    listId: z.string().uuid('Id da lista deve ser um UUID válido').optional(),
    gameId: z.string().min(1, 'gameId inválido').max(200, 'gameId inválido'),
  })
  .strict();

export type ReorderQueueBody = z.infer<typeof reorderQueueBodySchema>;
export type ListScopedParams = z.infer<typeof listScopedParamsSchema>;
export type ResetManualParams = z.infer<typeof resetManualParamsSchema>;
