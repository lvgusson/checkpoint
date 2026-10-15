// Esquemas Zod para a rota de rastreamento (/api/v1/track).
import { z } from 'zod';

const SCREEN_RE = /^\/[a-z0-9/:_.-]*$/;
const ELEMENT_RE = /^[a-zA-Z0-9_.:-]+$/;

export const trackEventSchema = z
  .object({
    kind: z.enum(['page_view', 'click']),
    screen: z.string().min(1).max(120).regex(SCREEN_RE, 'screen inválido'),
    element: z.string().min(1).max(120).regex(ELEMENT_RE, 'element inválido').optional().nullable(),
    occurredAt: z
      .string()
      .refine((val) => !Number.isNaN(Date.parse(val)), 'occurredAt deve ser uma data ISO válida'),
  })
  .strict();

export const trackBatchSchema = z
  .object({
    sessionId: z.string().min(1).max(64),
    automated: z.boolean().default(false),
    events: z
      .array(trackEventSchema)
      .min(1, 'Envie ao menos um evento')
      .max(50, 'Máximo de 50 eventos por lote'),
  })
  .strict();

export type TrackEventInput = z.infer<typeof trackEventSchema>;
export type TrackBatchInput = z.infer<typeof trackBatchSchema>;
