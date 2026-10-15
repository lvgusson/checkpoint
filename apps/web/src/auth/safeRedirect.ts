/**
 * Prevents open redirects. The value is resolved like a browser would (which strips tabs/newlines
 * and normalizes backslashes) and accepted only when it stays on this origin.
 */
export const safeRedirect = (value: string | null | undefined, fallback = '/jogos') => {
  if (!value) return fallback;
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
};
