import { useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';

/**
 * Query key factory. Every key starts with the user id, so cached data can never cross identities
 * and `qc.invalidateQueries({ queryKey: k.games() })` matches every games page of that user.
 * Mirrors the keys of the Angular DataCache.
 */
const createQueryKeys = (userId: string) =>
  ({
    all: [userId] as const,
    catalog: () => [userId, 'catalog'] as const,
    /** Prefix of every games page. */
    games: () => [userId, 'games'] as const,
    gamesPage: (params: Record<string, string | number>) => [userId, 'games', params] as const,
    game: (id: string) => [userId, 'game', id] as const,
    queue: (listId: string) => [userId, 'queue', listId] as const,
    recommendations: (listId: string) => [userId, 'queue', listId] as const,
    lists: () => [userId, 'lists'] as const,
    settings: (listId: string) => [userId, 'settings', listId] as const,
    wishlist: () => [userId, 'wishlist'] as const,
    /** Everything that changes when a game changes (score, every queue, catalog, wishlist). */
    gameDependents(): (readonly unknown[])[] {
      return [
        [userId, 'games'],
        [userId, 'game'],
        [userId, 'queue'],
        [userId, 'catalog'],
        [userId, 'wishlist'],
      ];
    },
  }) as const;

export type QueryKeys = ReturnType<typeof createQueryKeys>;

const keysCache = new Map<string, QueryKeys>();

export const queryKeys = (userId: string): QueryKeys => {
  let cached = keysCache.get(userId);
  if (!cached) {
    cached = createQueryKeys(userId);
    keysCache.set(userId, cached);
  }
  return cached;
};

/** Keys scoped to the signed-in user (call inside components/hooks only). */
export function useQueryKeys(): QueryKeys {
  const { userId } = useAuth();
  return useMemo(() => queryKeys(userId), [userId]);
}
