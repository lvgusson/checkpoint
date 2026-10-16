import { useEffect } from 'react';
import { useLocation, useMatches } from 'react-router';
import { authSession } from '../auth/session';
import { createTrackQueue, type TrackEvent } from './queue';

const SESSION_KEY = 'checkpoint:track-session';
const SCREEN_RE = /^\/[a-z0-9/:_.-]*$/;
const SCREEN_MAX = 120;

let fallbackSessionId: string | undefined;
/** Route pattern of the current page; clicks are attributed to it. */
let currentScreen: string | undefined;

/** One random id per tab. Falls back to memory when sessionStorage is blocked. */
function sessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    fallbackSessionId ??= crypto.randomUUID();
    return fallbackSessionId;
  }
}

/** Fire and forget: the queue retries once and swallows errors. Anonymous batches are dropped. */
async function send(events: TrackEvent[]): Promise<void> {
  const token = await authSession.accessToken();
  if (!token) return;
  const res = await fetch('/api/v1/track', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      sessionId: sessionId(),
      automated: navigator.webdriver === true,
      events,
    }),
  });
  if (!res.ok) throw new Error(String(res.status));
}

const queue = createTrackQueue({ send });

function record(event: Omit<TrackEvent, 'occurredAt'>): void {
  if (!authSession.getState().session) return;
  queue.push({ ...event, occurredAt: new Date().toISOString() });
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Replaces route param values with their pattern (:param), e.g. /ordem/123 -> /ordem/:listid. */
export function patternFor(
  pathname: string,
  params: Record<string, string | undefined>,
): string | undefined {
  const entries = Object.entries(params).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0,
  );

  const segments = pathname.split('/').map((segment) => {
    if (!segment) return segment;
    const decoded = safeDecode(segment);
    for (const [key, value] of entries) {
      if (decoded === value || segment === value) {
        return `:${key}`;
      }
    }
    return segment;
  });

  const screen = segments.join('/').toLowerCase();
  return screen.length <= SCREEN_MAX && SCREEN_RE.test(screen) ? screen : undefined;
}

/** Records one page view per route change, using the route pattern (never the real ids). */
export function useTrackPageViews(): void {
  const matches = useMatches();
  const { pathname } = useLocation();

  useEffect(() => {
    const allParams: Record<string, string | undefined> = {};
    for (const m of matches) {
      if (m.params) Object.assign(allParams, m.params);
    }
    currentScreen = patternFor(pathname, allParams);
    if (currentScreen) record({ kind: 'page_view', screen: currentScreen });
  }, [matches, pathname]);
}

/** Starts the click and flush listeners. Returns the teardown for the effect cleanup. */
export function startTracking(): () => void {
  const onClick = (event: MouseEvent) => {
    if (!currentScreen || !(event.target instanceof Element)) return;
    const element = event.target.closest('[data-testid]')?.getAttribute('data-testid');
    if (element) record({ kind: 'click', screen: currentScreen, element });
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') queue.flush();
  };
  const onPageHide = () => queue.flush();

  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  };
}
