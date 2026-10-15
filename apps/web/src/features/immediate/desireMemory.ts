import type { Desire } from '../../../../../packages/core/src/models';

/** Previous desire of each game marked "Imediata" (for undo); same localStorage key as the Angular app. */
const PREV_KEY = 'checkpoint:previous-desire';
const read = (): Record<string, Desire> => {
  try {
    return JSON.parse(localStorage.getItem(PREV_KEY) ?? '{}') as Record<string, Desire>;
  } catch {
    return {};
  }
};

export function rememberDesire(id: string, desire: Desire) {
  try {
    localStorage.setItem(PREV_KEY, JSON.stringify({ ...read(), [id]: desire }));
  } catch {
    // Storage may be unavailable; undo then falls back to "Muito Alta".
  }
}

export function previousDesire(id: string): Desire {
  const d = read()[id];
  return d && d !== 'Imediata' ? d : 'Muito Alta';
}
