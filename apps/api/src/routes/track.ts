// POST /api/v1/track: authenticated, rate-limited, schema-validated user tracking collector.
// Returns 202 immediately and persists events in background via waitUntil.
import { getContext } from '../shared/context.ts';
import { logger } from '../observability/logger.ts';
import { createRateLimiter } from '../auth/rate-limit.ts';
import { AppError } from '../shared/errors.ts';
import { ApiPath, HttpMethod, type ReadJson, type RouteResult } from './http.ts';
import { runInBackground } from './background.ts';
import { trackBatchSchema } from './validation/track.ts';
import type { TrackService } from '../services/track.ts';

const TRACK_MAX_BYTES = 16 * 1024;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Own rate limiter: 30 requests per minute per user.
let allow = createRateLimiter(30, 60_000);

export function resetTrackRateLimiter() {
  allow = createRateLimiter(30, 60_000);
}

export async function trackRoute(
  service: TrackService,
  method: string | undefined,
  path: string,
  readJson: ReadJson,
): Promise<RouteResult> {
  if (path !== ApiPath.Track || method !== HttpMethod.Post) return null;

  const userId = getContext()?.userId;
  if (!userId) {
    throw new AppError('Autenticação necessária', 401);
  }

  if (!allow(userId)) {
    throw new AppError('Muitas requisições de tracking', 429, { 'Retry-After': '60' });
  }

  const raw = await readJson(TRACK_MAX_BYTES);
  const parsed = trackBatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('Dados de tracking inválidos', 400);
  }

  const now = new Date();
  const events = parsed.data.events.map((e) => {
    const clientTime = new Date(e.occurredAt);
    const diff = Math.abs(now.getTime() - clientTime.getTime());
    const occurredAt = diff > ONE_DAY_MS ? now : clientTime;
    return {
      kind: e.kind,
      screen: e.screen,
      element: e.element,
      occurredAt,
    };
  });

  runInBackground(
    service
      .record({
        userId,
        sessionId: parsed.data.sessionId,
        automated: parsed.data.automated,
        events,
      })
      .catch((error) => {
        logger.warn('track.insert_failed', { error, userId });
      }),
  );

  return { status: 202, data: { status: 'accepted' } };
}
