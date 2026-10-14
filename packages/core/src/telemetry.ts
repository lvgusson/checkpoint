// Wire format of POST /api/v1/telemetry (client-side events, logs and errors).
import { z } from 'zod';

const eventName = z
  .string()
  .regex(/^[A-Za-z][\w.:-]{0,79}$/)
  .optional();
const attributes = z.record(z.string().max(64), z.unknown()).optional();

export const telemetryEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('log'),
    eventName,
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string().max(500),
    attributes,
  }),
  z.object({
    type: z.literal('error'),
    eventName,
    message: z.string().max(500),
    stack: z.string().max(4000).optional(),
    attributes,
  }),
  z.object({
    type: z.literal('metric'),
    eventName,
    name: z.string().regex(/^[A-Za-z][\w.:-]{0,79}$/),
    value: z.number().finite(),
    attributes,
  }),
]);

export const telemetryBatch = z.object({ events: z.array(telemetryEvent).min(1).max(20) });

export type TelemetryEvent = z.infer<typeof telemetryEvent>;
export type TelemetryBatch = z.infer<typeof telemetryBatch>;
