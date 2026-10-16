import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/http';
import { useQueryKeys } from '../../query/keys';
import type {
  Catalog,
  ScoredGame,
  SteamPrice,
  SteamSearchItem,
  WishlistImportResult,
  WishlistItem,
} from '../../../../../packages/core/src/models';

/** "R$ 46,99" from cents. */
export function formatPrice(p: SteamPrice | null): string {
  if (!p) return 'Sem preço';
  if (p.isFree) return 'Gratuito';
  if (p.finalCents === null) return 'Indisponível';
  return (p.finalCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: p.currency ?? 'BRL',
  });
}

/** Wishlist (the API refreshes prices older than 6 h) and the catalog genres for manual entries. */
export function useWishlist() {
  const k = useQueryKeys();
  const wishlist = useQuery({
    queryKey: k.wishlist(),
    queryFn: ({ signal }) => api.get<WishlistItem[]>('wishlist', { signal }),
  });
  const catalog = useQuery({
    queryKey: k.catalog(),
    queryFn: ({ signal }) => api.get<Catalog>('catalog', { signal }),
  });
  return { wishlist, genres: catalog.data?.genres ?? [] };
}

/** Debounced (300 ms) Steam store search; returns at most 8 results. */
export function useSteamSearch(term: string) {
  const k = useQueryKeys();
  const [debounced, setDebounced] = useState('');
  const q = term.trim();
  useEffect(() => {
    if (q.length < 2) return;
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const enabled = q.length >= 2 && debounced === q;
  const query = useQuery({
    queryKey: [...k.all, 'steam-search', debounced],
    queryFn: ({ signal }) =>
      api.get<SteamSearchItem[]>('steam/search', { searchParams: { q: debounced }, signal }),
    enabled,
    placeholderData: keepPreviousData,
    select: (r) => r.slice(0, 8),
  });
  return {
    results: enabled ? (query.data ?? []) : [],
    searching: q.length >= 2 && !query.data && !query.isError,
    error: query.error,
  };
}

/** Wishlist mutations. */
export function useWishlistActions() {
  const k = useQueryKeys();
  const qc = useQueryClient();
  const invalidateDependents = () =>
    Promise.all(k.gameDependents().map((queryKey) => qc.invalidateQueries({ queryKey })));

  return {
    add: useMutation({
      mutationFn: (json: Record<string, unknown>) =>
        api.post<WishlistItem & { created: boolean }>('wishlist', { json }),
      onSuccess: invalidateDependents,
      onError: () => {},
    }),
    purchase: useMutation({
      mutationFn: (id: string) =>
        api.post<ScoredGame>(`games/${encodeURIComponent(id)}/purchase`, { json: {} }),
      onSuccess: (_data, id) =>
        Promise.all(
          [k.wishlist(), k.games(), k.catalog(), [...k.all, 'queue'], k.game(id)].map((queryKey) =>
            qc.invalidateQueries({ queryKey }),
          ),
        ),
      onError: () => {},
    }),
    importSteam: useMutation({
      mutationFn: (profile: string) =>
        api.post<WishlistImportResult>('wishlist/import-steam', {
          json: profile.trim() ? { profile: profile.trim() } : {},
        }),
      onSuccess: invalidateDependents,
      onError: () => {},
    }),
    refreshPrices: useMutation({
      mutationFn: () => api.post<WishlistItem[]>('wishlist/prices/refresh', { json: {} }),
      onSuccess: (items) => qc.setQueryData(k.wishlist(), items),
      onError: () => {},
    }),
  };
}
