import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@checkpoint/ui-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Catalog, Desire, ScoredGame } from '../../../../packages/core/src/models';
import { api } from '../api/http';
import { GameCard, useInfiniteCatalog, type LibraryFilters } from '../features/catalog';
import { useGameWriter } from '../features/playing';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useQueryKeys } from '../query/keys';

export function LibraryPage() {
  const k = useQueryKeys();
  const qc = useQueryClient();
  const writer = useGameWriter();
  const [error, setError] = useState('');

  const catalog = useQuery({
    queryKey: k.catalog(),
    queryFn: ({ signal }) => api.get<Catalog>('catalog', { signal }),
  });

  const {
    items,
    total,
    hasMore,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isInitialError,
    nextPageError,
    hasData,
    loadMore,
    refetch,
    retryNextPage,
    filters,
    setFilter,
    sort,
    setSort,
    searchInput,
    setSearch,
  } = useInfiniteCatalog({ pageSize: 24, debounceMs: 250 });

  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: isFetchingNextPage || isLoading,
  });

  // Surface failed playing toggles (the writer already rolled the caches back and refetches).
  useEffect(
    () =>
      writer.onPlaying(
        (e) =>
          e.phase === 'failed' && setError(`Não foi possível mudar o status de ${e.game.name}.`),
      ),
    [writer],
  );

  /** Optimistic desire on the card (the button already calls the API). */
  const setDesire = useCallback(
    async (id: string, desire: Desire) => {
      await qc.cancelQueries({ queryKey: k.games() });
      qc.setQueriesData<{ items: ScoredGame[] }>(
        { queryKey: k.games() },
        (page) =>
          page && { ...page, items: page.items.map((g) => (g.id === id ? { ...g, desire } : g)) },
      );
    },
    [qc, k],
  );

  const handleError = useCallback((message: string) => {
    setError(message);
  }, []);

  const counts = catalog.data?.counts;
  const select = (
    label: string,
    name: keyof LibraryFilters,
    all: string,
    values: string[] = [],
  ) => (
    <select
      data-testid={`library-filter-${name === 'primaryGenre' ? 'genre' : name}`}
      aria-label={label}
      value={filters[name]}
      onChange={(e) => setFilter(name, e.target.value)}
    >
      <option value="">{all}</option>
      {values.map((v) => (
        <option key={v}>{v}</option>
      ))}
    </select>
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TUDO O QUE VOCÊ QUER JOGAR</span>
          <h1>
            Lista de jogos<span className="heading-dot">.</span>
          </h1>
          <p>Sua coleção inteira. A próxima história começa aqui.</p>
        </div>
        <Link data-testid="library-open-queue" className="button primary" to="/ordem">
          Ver ordem recomendada <span>↗</span>
        </Link>
      </div>
      {counts && (
        <div className="stats">
          <div>
            <small>NA BIBLIOTECA</small>
            <strong>
              {counts.total} <span>jogos</span>
            </strong>
          </div>
          <div>
            <small>EM ANDAMENTO</small>
            <strong>
              {counts.playing} <span>jogando</span>
            </strong>
          </div>
          <div>
            <small>CONCLUÍDOS</small>
            <strong>
              {counts.completed} <span>finalizados</span>
            </strong>
          </div>
        </div>
      )}
      <section className="filters">
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input
            data-testid="library-search"
            type="search"
            aria-label="Buscar jogo"
            placeholder="Buscar um jogo ou subgênero…"
            value={searchInput}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {select('Filtrar status', 'status', 'Status: todos', catalog.data?.statuses)}
        {select('Filtrar gênero', 'primaryGenre', 'Gênero: todos', catalog.data?.genres)}
        {select('Filtrar loja', 'store', 'Loja: todas', catalog.data?.stores)}
      </section>
      <div className="list-toolbar">
        <span>
          {total} jogos encontrados
          {isFetching && <span className="muted"> · carregando</span>}
        </span>
        <label>
          Ordenar
          <select
            data-testid="library-sort"
            aria-label="Ordenação"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Nome (A-Z)</option>
            <option value="score">Pontuação</option>
            <option value="desire">Vontade de jogar</option>
          </select>
        </label>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}{' '}
          <button data-testid="library-retry" onClick={() => (setError(''), void refetch())}>
            Tentar novamente
          </button>
        </div>
      )}
      {isInitialError && !hasData ? (
        <ErrorState
          data-testid="library-error"
          message="Não foi possível carregar a biblioteca. Confira se a API está rodando."
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <div className="game-grid">
            {items.map((g) => (
              <GameCard key={g.id} game={g} onDesire={setDesire} onError={handleError} />
            ))}
          </div>
          <div
            ref={sentinelRef}
            className="infinite-scroll-sentinel"
            style={{ height: 1 }}
            aria-hidden="true"
          />
          {isFetchingNextPage && (
            <div
              className="infinite-scroll-loading"
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '1.5rem',
                color: 'var(--muted)',
              }}
            >
              <span className="spinner" aria-hidden="true" />
              <span>Carregando mais jogos…</span>
            </div>
          )}
          {nextPageError && (
            <div
              className="load-more-error"
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                padding: '1rem',
              }}
            >
              <span>Não foi possível carregar mais jogos.</span>
              <button
                data-testid="library-load-more-retry"
                type="button"
                className="button outline"
                onClick={retryNextPage}
              >
                Tentar novamente
              </button>
            </div>
          )}
        </>
      )}
      {hasData && total === 0 && !isLoading && (
        <EmptyState
          title="Nenhum jogo por aqui"
          description="Tente outro nome ou remova um filtro."
        />
      )}
    </>
  );
}
