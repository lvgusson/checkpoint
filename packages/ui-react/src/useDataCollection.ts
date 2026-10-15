import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  initialState,
  parseState,
  serializeState,
  type CollectionDefaults,
  type CollectionState,
  type Filters,
  type ViewMode,
} from './collectionState';
import {
  defaultPrefetchPolicy,
  isSaveData,
  PrefetchScheduler,
  type PrefetchPolicy,
} from './prefetch';

export interface PageResult<T> {
  items: T[];
  total?: number;
  pageCount?: number;
  nextCursor?: string | null;
}

/** What `fetchPage` receives; it is also the last element of the query key. */
export interface PageRequest<F extends Filters = Filters> {
  filters: F;
  search: string;
  sort: string;
  page: number;
  cursor?: string;
  pageSize: number;
}

/** Router-agnostic URL binding. With it the URL is the single source of truth for the state. */
export interface UrlBinding {
  search: URLSearchParams;
  replace(next: URLSearchParams): void;
}

export interface DataCollectionOptions<T, F extends Filters> {
  /** User-scoped key prefix, e.g. `[userId, 'games']`; identity changes cancel prefetching. */
  keyPrefix: QueryKey;
  /** Must honor `signal` so superseded requests are aborted. */
  fetchPage(request: PageRequest<F>, signal: AbortSignal): Promise<PageResult<T>>;
  defaults: CollectionDefaults<F>;
  getId(item: T): string;
  pageSize?: number;
  debounceMs?: number;
  url?: UrlBinding;
  /** Pass false to disable prefetching. */
  prefetch?: Partial<PrefetchPolicy> | false;
  enabled?: boolean;
}

export interface DataCollection<T, F extends Filters> {
  state: CollectionState<F>;
  /** Raw (not yet debounced) search text for the input. */
  searchInput: string;
  setSearch(text: string): void;
  setFilter(name: keyof F & string, value: F[keyof F]): void;
  setSort(sort: string): void;
  setPage(page: number, cursor?: string): void;
  setView(view: ViewMode): void;
  selection: {
    ids: ReadonlySet<string>;
    isSelected(item: T): boolean;
    toggle(item: T): void;
    set(items: T[]): void;
    clear(): void;
  };
  query: UseQueryResult<PageResult<T>>;
  items: T[];
  pageCount: number | undefined;
  /** True while showing the previous page/filter result during a transition. */
  isTransitioning: boolean;
}

export function useDataCollection<T, F extends Filters = Filters>(
  opts: DataCollectionOptions<T, F>,
): DataCollection<T, F> {
  const { defaults, url, keyPrefix, fetchPage, getId } = opts;
  const pageSize = opts.pageSize ?? 24;
  const queryClient = useQueryClient();
  const [local, setLocal] = useState(() =>
    url ? parseState(url.search, defaults) : initialState(defaults),
  );
  const state = url ? parseState(url.search, defaults) : local;

  // Latest-value refs let the setters stay stable without stale closures.
  const stateRef = useRef(state);
  const urlRef = useRef(url);
  useEffect(() => {
    stateRef.current = state;
    urlRef.current = url;
  });
  const commit = useCallback(
    (patch: Partial<CollectionState<F>>) => {
      const next = { ...stateRef.current, ...patch };
      stateRef.current = next;
      if (urlRef.current) urlRef.current.replace(serializeState(next, defaults));
      else setLocal(next);
    },
    [defaults],
  );

  // Debounced search: only the committed text reaches the query key, so keystrokes in between never fetch.
  const [searchInput, setSearchInput] = useState(state.search);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // The URL changed from outside (Back, clear filters): follow it and drop any pending debounce.
  const [seenSearch, setSeenSearch] = useState(state.search);
  if (seenSearch !== state.search) {
    setSeenSearch(state.search);
    setSearchInput(state.search);
  }
  // A committed or external search value supersedes any pending debounce.
  useEffect(() => clearTimeout(timer.current), [state.search]);
  const setSearch = useCallback(
    (text: string) => {
      setSearchInput(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(
        () => commit({ search: text.trim(), page: 1, cursor: undefined, selection: [] }),
        opts.debounceMs ?? 300,
      );
    },
    [commit, opts.debounceMs],
  );

  const request = (page: number, cursor?: string): PageRequest<F> => ({
    filters: state.filters,
    search: state.search,
    sort: state.sort,
    page,
    cursor,
    pageSize,
  });
  const keyFor = (r: PageRequest<F>): QueryKey => [...keyPrefix, 'page', r];
  const query = useQuery({
    queryKey: keyFor(request(state.page, state.cursor)),
    // TanStack aborts `signal` when the key changes or the component unmounts: stale responses are dropped.
    queryFn: ({ signal }) => fetchPage(request(state.page, state.cursor), signal),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });

  const total = query.data?.total;
  const pageCount =
    query.data?.pageCount ??
    (total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize)));

  // A stale URL (?page=999) or a shrunk result set must not leave the user on an empty page.
  useEffect(() => {
    if (
      pageCount !== undefined &&
      !state.cursor &&
      state.page > pageCount &&
      !query.isPlaceholderData
    )
      commit({ page: pageCount });
  }, [pageCount, state.page, state.cursor, query.isPlaceholderData, commit]);

  // Prefetch ahead. The scheduler is recreated (and the old one cancelled) when identity or filters change.
  const policy = opts.prefetch === false ? false : { ...defaultPrefetchPolicy, ...opts.prefetch };
  const scopeKey = JSON.stringify([keyPrefix, state.filters, state.search, state.sort, pageSize]);
  const scheduler = useRef<PrefetchScheduler>(undefined);
  const concurrency = policy ? policy.maxConcurrency : 0;
  useEffect(() => {
    scheduler.current = new PrefetchScheduler(queryClient, Math.max(1, concurrency));
    return () => scheduler.current?.cancel();
  }, [queryClient, scopeKey, concurrency]);

  const nextCursor = query.data?.nextCursor;
  useEffect(() => {
    if (
      !policy ||
      !query.data ||
      query.isPlaceholderData ||
      (policy.respectSaveData && isSaveData())
    )
      return;
    const jobs = [];
    for (let i = 1; i <= policy.aheadPages; i++) {
      const page = state.page + i;
      if (pageCount !== undefined && page > pageCount) break;
      // shortcut: cursor endpoints only know the next cursor, so they prefetch one page ahead.
      if (nextCursor !== undefined && i > 1) break;
      if (nextCursor === null) break;
      const r = request(page, i === 1 ? (nextCursor ?? undefined) : undefined);
      jobs.push({ key: keyFor(r), fetch: (signal: AbortSignal) => fetchPage(r, signal) });
    }
    scheduler.current?.enqueue(jobs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- request()/keyFor derive from the listed values
  }, [scopeKey, state.page, pageCount, nextCursor, query.data, query.isPlaceholderData]);

  const selected = useMemo(() => new Set(state.selection), [state.selection]);
  const resetPage = { page: 1, cursor: undefined, selection: [] as string[] };
  return {
    state,
    searchInput,
    setSearch,
    setFilter: (name, value) =>
      commit({ filters: { ...stateRef.current.filters, [name]: value }, ...resetPage }),
    setSort: (sort) => commit({ sort, page: 1, cursor: undefined }),
    setPage: (page, cursor) => commit({ page: Math.max(1, Math.floor(page)), cursor }),
    setView: (view) => commit({ view }),
    selection: {
      ids: selected,
      isSelected: (item) => selected.has(getId(item)),
      toggle: (item) => {
        const id = getId(item);
        commit({
          selection: selected.has(id)
            ? state.selection.filter((s) => s !== id)
            : [...state.selection, id],
        });
      },
      set: (items) => commit({ selection: items.map(getId) }),
      clear: () => commit({ selection: [] }),
    },
    query,
    items: query.data?.items ?? [],
    pageCount,
    isTransitioning: query.isPlaceholderData,
  };
}
