import { useQueries } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { GamePage, ScoredGame } from '../../../../../packages/core/src/models';
import { api } from '../../api/http';
import { useQueryKeys } from '../../query/keys';

export interface LibraryFilters {
  status: string;
  primaryGenre: string;
  store: string;
}

export interface UseInfiniteCatalogOptions {
  pageSize?: number;
  debounceMs?: number;
}

export function useInfiniteCatalog(options: UseInfiniteCatalogOptions = {}) {
  const { pageSize = 24, debounceMs = 250 } = options;
  const k = useQueryKeys();
  const [params, setParams] = useSearchParams();

  const urlQ = params.get('q') ?? '';
  const urlStatus = params.get('status') ?? '';
  const urlGenre = params.get('primaryGenre') ?? '';
  const urlStore = params.get('store') ?? '';
  const urlSort = params.get('sort') ?? 'name';

  const [searchInput, setSearchInput] = useState(urlQ);
  const [debouncedSearch, setDebouncedSearch] = useState(urlQ);
  const [filters, setFilters] = useState<LibraryFilters>({
    status: urlStatus,
    primaryGenre: urlGenre,
    store: urlStore,
  });
  const [sort, setSort] = useState(urlSort);
  const [loadedPages, setLoadedPages] = useState(1);

  const updateUrl = useCallback(
    (newSearch: string, newFilters: LibraryFilters, newSort: string) => {
      const next = new URLSearchParams();
      if (newSearch) next.set('q', newSearch);
      if (newFilters.status) next.set('status', newFilters.status);
      if (newFilters.primaryGenre) next.set('primaryGenre', newFilters.primaryGenre);
      if (newFilters.store) next.set('store', newFilters.store);
      if (newSort && newSort !== 'name') next.set('sort', newSort);
      setParams(next, { replace: true });
    },
    [setParams],
  );

  // Synchronize state when URL search parameters change externally
  const prevParamsRef = useRef(params.toString());
  useEffect(() => {
    const currentParams = params.toString();
    if (currentParams !== prevParamsRef.current) {
      prevParamsRef.current = currentParams;
      const q = params.get('q') ?? '';
      const s = params.get('status') ?? '';
      const g = params.get('primaryGenre') ?? '';
      const st = params.get('store') ?? '';
      const so = params.get('sort') ?? 'name';

      setSearchInput(q);
      setDebouncedSearch(q);
      setFilters({ status: s, primaryGenre: g, store: st });
      setSort(so);
      setLoadedPages(1);
    }
  }, [params]);

  // Debounce search input changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== debouncedSearch) {
        setDebouncedSearch(trimmed);
        setLoadedPages(1);
        updateUrl(trimmed, filters, sort);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchInput, debouncedSearch, filters, sort, debounceMs, updateUrl]);

  const setFilter = useCallback(
    (name: keyof LibraryFilters, value: string) => {
      const nextFilters = { ...filters, [name]: value };
      setFilters(nextFilters);
      setLoadedPages(1);
      updateUrl(debouncedSearch, nextFilters, sort);
    },
    [filters, debouncedSearch, sort, updateUrl],
  );

  const handleSetSort = useCallback(
    (nextSort: string) => {
      setSort(nextSort);
      setLoadedPages(1);
      updateUrl(debouncedSearch, filters, nextSort);
    },
    [debouncedSearch, filters, updateUrl],
  );

  const handleSearchChange = useCallback((text: string) => {
    setSearchInput(text);
  }, []);

  // Fetch page 1 through loadedPages
  const pageQueries = useQueries({
    queries: Array.from({ length: loadedPages }, (_, i) => {
      const pageNum = i + 1;
      return {
        queryKey: [
          ...k.games(),
          'page',
          {
            filters,
            search: debouncedSearch,
            sort,
            page: pageNum,
            pageSize,
          },
        ] as const,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          api.get<GamePage>('games', {
            searchParams: {
              q: debouncedSearch,
              status: filters.status,
              primaryGenre: filters.primaryGenre,
              store: filters.store,
              sort,
              page: pageNum,
              pageSize,
            },
            signal,
          }),
      };
    }),
  });

  // Combine items across all loaded pages and deduplicate by id
  const items = useMemo(() => {
    const seen = new Set<string>();
    const result: ScoredGame[] = [];
    for (const q of pageQueries) {
      if (!q.data?.items) continue;
      for (const game of q.data.items) {
        if (!seen.has(game.id)) {
          seen.add(game.id);
          result.push(game);
        }
      }
    }
    return result;
  }, [pageQueries]);

  const firstQuery = pageQueries[0];
  const lastQuery = pageQueries[pageQueries.length - 1];

  const total = firstQuery?.data?.total ?? 0;
  const isLoading = Boolean(firstQuery?.isLoading);
  const isFetching = pageQueries.some((q) => q.isFetching);
  const isFetchingNextPage = loadedPages > 1 && Boolean(lastQuery?.isFetching);

  const lastPageData = lastQuery?.data;
  const hasMore = Boolean(
    firstQuery?.data &&
    items.length < total &&
    (lastPageData ? lastPageData.items.length >= pageSize : true),
  );

  const loadMore = useCallback(() => {
    if (hasMore && !lastQuery?.isFetching) {
      setLoadedPages((prev) => prev + 1);
    }
  }, [hasMore, lastQuery?.isFetching]);

  const isInitialError = Boolean(firstQuery?.isError);
  const nextPageError = loadedPages > 1 && Boolean(lastQuery?.isError);

  const refetch = useCallback(() => {
    void firstQuery?.refetch();
  }, [firstQuery]);

  const retryNextPage = useCallback(() => {
    void lastQuery?.refetch();
  }, [lastQuery]);

  return {
    items,
    total,
    loadedPages,
    hasMore,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isInitialError,
    nextPageError,
    hasData: Boolean(firstQuery?.data),
    loadMore,
    refetch,
    retryNextPage,
    filters,
    setFilter,
    sort,
    setSort: handleSetSort,
    searchInput,
    setSearch: handleSearchChange,
  };
}
