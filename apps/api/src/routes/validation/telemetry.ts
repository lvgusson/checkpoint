// Esquemas Zod estritos para a rota de telemetria (/api/v1/telemetry).
import { z } from 'zod';

const eventName = z
  .string()
  .regex(/^[A-Za-z][\w.:-]{0,79}$/, 'eventName inválido')
  .optional();

const attributes = z.record(z.string().max(64), z.unknown()).optional();

export const telemetryLogEventSchema = z
  .object({
    type: z.literal('log'),
    eventName,
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string().max(500),
    attributes,
  })
  .strict();

export const telemetryErrorEventSchema = z
  .object({
    type: z.literal('error'),
    eventName,
    message: z.string().max(500),
    stack: z.string().max(4000).optional(),
    attributes,
  })
  .strict();

export const telemetryMetricEventSchema = z
  .object({
    type: z.literal('metric'),
    eventName,
    name: z.string().regex(/^[A-Za-z][\w.:-]{0,79}$/, 'name da métrica inválido'),
    value: z.number().finite(),
    attributes,
  })
  .strict();

export const telemetryEventSchema = z.discriminatedUnion('type', [
  telemetryLogEventSchema,
  telemetryErrorEventSchema,
  telemetryMetricEventSchema,
]);

export const telemetryBatchSchema = z
  .object({
    events: z
      .array(telemetryEventSchema)
      .min(1, 'Envie ao menos um evento')
      .max(20, 'Máximo de 20 eventos por lote'),
  })
  .strict();

export type TelemetryLogEventInput = z.infer<typeof telemetryLogEventSchema>;
export type TelemetryErrorEventInput = z.infer<typeof telemetryErrorEventSchema>;
export type TelemetryMetricEventInput = z.infer<typeof telemetryMetricEventSchema>;
export type TelemetryEventInput = z.infer<typeof telemetryEventSchema>;
export type TelemetryBatchInput = z.infer<typeof telemetryBatchSchema>;
