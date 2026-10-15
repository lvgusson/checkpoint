/** Serializable state of a data collection (list/grid of server-side items). */
export type FilterValue = string | string[];
export type Filters = Record<string, FilterValue>;

export interface CollectionState<F extends Filters = Filters> {
  filters: F;
  /** Committed (already debounced) search text. */
  search: string;
  sort: string;
  page: number;
  /** Opaque cursor for cursor-paginated endpoints; undefined for the first page. */
  cursor?: string;
}

export type CollectionDefaults<F extends Filters = Filters> = Omit<
  CollectionState<F>,
  'page' | 'cursor'
> &
  Partial<Pick<CollectionState<F>, 'page'>>;

/** Query-string names owned by the collection; filter names must not collide with these. */
const RESERVED = ['q', 'sort', 'page', 'cursor'];

export function initialState<F extends Filters>(d: CollectionDefaults<F>): CollectionState<F> {
  return { page: 1, ...d };
}

/** Writes only values that differ from the defaults, so default URLs stay clean. */
export function serializeState<F extends Filters>(
  state: CollectionState<F>,
  d: CollectionDefaults<F>,
): URLSearchParams {
  const p = new URLSearchParams();
  if (state.search) p.set('q', state.search);
  if (state.sort !== d.sort) p.set('sort', state.sort);
  if (state.page > 1) p.set('page', String(state.page));
  if (state.cursor) p.set('cursor', state.cursor);
  for (const [name, value] of Object.entries(state.filters)) {
    if (RESERVED.includes(name)) throw new Error(`Filter name "${name}" is reserved`);
    const values = Array.isArray(value) ? value : value === '' ? [] : [value];
    const same = JSON.stringify(values) === JSON.stringify(toArray(d.filters[name]));
    if (!same) values.forEach((v) => p.append(name, v));
  }
  return p;
}

/** Reads state from a query string; unknown or invalid values fall back to the defaults. */
export function parseState<F extends Filters>(
  p: URLSearchParams,
  d: CollectionDefaults<F>,
): CollectionState<F> {
  const page = Number(p.get('page'));
  const filters = { ...d.filters } as Filters;
  for (const name of Object.keys(d.filters)) {
    if (!p.has(name)) continue;
    const values = p.getAll(name);
    filters[name] = Array.isArray(d.filters[name]) ? values : (values[0] ?? '');
  }
  return {
    filters: filters as F,
    search: p.get('q') ?? d.search,
    sort: p.get('sort') ?? d.sort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    cursor: p.get('cursor') ?? undefined,
  };
}

const toArray = (v: FilterValue | undefined) =>
  v === undefined || v === '' ? [] : Array.isArray(v) ? v : [v];
