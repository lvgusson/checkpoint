import type { Desire, Recommendations, ScoredGame } from '../../../../../packages/core/src/models';

/** Lowercase without accents ("acao" finds "Ação"). */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const PAGE_SIZE = 30;

/** Games left out of the queue, grouped by reason. */
export function excludedReasons(queue: Recommendations) {
  const counts = new Map<string, number>();
  for (const e of queue.excluded) counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count }));
}

/** Optimistic drop: moves one entry. */
export function moveEntry(queue: Recommendations, from: number, to: number): Recommendations {
  const items = [...queue.items];
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved!);
  return { ...queue, items };
}

/**
 * Desire changed through "Jogar já" (optimistic). "Imediata" rises to just after the other
 * immediate games (pinned ones do not move); the exact order arrives on the refetch.
 */
export function withDesire(queue: Recommendations, id: string, desire: Desire): Recommendations {
  const items = queue.items.map((i) =>
    i.game.id === id ? { ...i, game: { ...i.game, desire } } : i,
  );
  const from = items.findIndex((i) => i.game.id === id);
  if (desire === 'Imediata' && from >= 0 && !items[from]!.pinnedPosition) {
    const [moved] = items.splice(from, 1);
    let to = 0;
    while (
      to < items.length &&
      (items[to]!.game.desire === 'Imediata' || items[to]!.pinnedPosition)
    )
      to++;
    items.splice(to, 0, moved!);
  }
  const playing = queue.playing?.map((g: ScoredGame) => (g.id === id ? { ...g, desire } : g));
  return { ...queue, items, playing };
}

export const displayDate = (date: string) => date.split('-').reverse().join('/');
