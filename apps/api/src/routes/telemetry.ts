// POST /api/v1/telemetry: authenticated, size-limited, rate-limited, schema-validated
// collector. Events go through the log sink strategy; sinks never fail the request.
import { telemetryBatch } from '../../../../packages/core/src/telemetry.ts';
import { getContext } from '../shared/context.ts';
import { log, metrics } from '../observability/logger.ts';
import { createRateLimiter } from '../auth/rate-limit.ts';
import { AppError } from '../shared/errors.ts';
import { ApiPath, HttpMethod, type ReadJson, type RouteResult } from './http.ts';

const TELEMETRY_MAX_BYTES = 16 * 1024;
const allow = createRateLimiter(60, 60_000);

async function collect(readJson: ReadJson) {
  if (!allow(getContext()?.userId ?? 'anonymous'))
    throw new AppError('Muitas requisições de telemetria', 429, { 'Retry-After': '60' });
  const parsed = telemetryBatch.safeParse(await readJson(TELEMETRY_MAX_BYTES));
  if (!parsed.success) throw new AppError('Telemetria inválida');
  for (const e of parsed.data.events) {
    const fields = { source: 'client', attributes: e.attributes };
    // Client names are namespaced so they cannot impersonate server events.
    const name = 'client.' + (e.eventName ?? e.type);
    if (e.type === 'log') log.log(e.level, name, { ...fields, message: e.message });
    // Client stacks are data, not server errors: log only, never through the ErrorReporter.
    else if (e.type === 'error') log.error(name, { ...fields, message: e.message, stack: e.stack });
    else metrics.count('client.' + e.name, e.value, fields);
  }
  return { status: 'accepted' };
}

export async function telemetryRoute(
  method: string | undefined,
  path: string,
  readJson: ReadJson,
): Promise<RouteResult> {
  if (path !== ApiPath.Telemetry || method !== HttpMethod.Post) return null;
  return { data: await collect(readJson), status: 202 };
}
