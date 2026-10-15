import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, Pagination, useDataCollection } from '@checkpoint/ui-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Catalog, Desire, GamePage, ScoredGame } from '../../../../packages/core/src/models';
import { api } from '../api/http';
import { ImmediateButton } from '../features/immediate';
import { badgeColor } from '../features/metadata';
import { PlayingButton, useGameWriter } from '../features/playing';
import { useQueryKeys } from '../query/keys';

const DEFAULTS = {
  filters: { status: '', primaryGenre: '', store: '' },
  search: '',
  sort: 'name',
} as const;
type LibraryFilters = { status: string; primaryGenre: string; store: string };

function GameCard({
  game,
  onDesire,
  onError,
}: {
  game: ScoredGame;
  onDesire(id: string, desire: Desire): void;
  onError(message: string): void;
}) {
  const [coverBroken, setCoverBroken] = useState(false);
  const g = game;
  return (
    <article className="game-card">
      <Link className="card-link" to={`/jogos/${encodeURIComponent(g.id)}`}>
        <div className="cover" data-genre={g.primaryGenre}>
          {g.coverUrl && !coverBroken && (
            <img src={g.coverUrl} alt="" loading="lazy" onError={() => setCoverBroken(true)} />
          )}
          <span className="cover-fallback">{g.name.slice(0, 1)}</span>
          <span className={'badge cover-status ' + badgeColor(g.status)}>{g.status}</span>
        </div>
        <div className="card-body">
          <div className="card-store">{g.store || g.platform || 'Minha biblioteca'}</div>
          <h2>{g.name}</h2>
          <div className="tags">
            <span className={'badge ' + badgeColor(g.primaryGenre)}>{g.primaryGenre}</span>
            {g.secondaryTags.slice(0, 2).map((t) => (
              <span key={t} className={'badge ' + badgeColor(t)}>
                {t}
              </span>
            ))}
          </div>
          <div className="card-bottom">
            <span>
              {g.plannedHours === null ? 'Tempo a confirmar' : g.plannedHours + ' h estimadas'}
            </span>
            <span className={'badge ' + badgeColor(g.desire)}>{g.desire}</span>
          </div>
        </div>
      </Link>
      {g.status !== 'Finalizado' && g.status !== 'Desejado' && (
        <>
          <PlayingButton game={g} />
          <span className="card-immediate">
            <ImmediateButton game={g} onChanged={(d) => onDesire(g.id, d)} onFailed={onError} />
          </span>
        </>
      )}
    </article>
  );
}

export function LibraryPage() {
  const k = useQueryKeys();
  const qc = useQueryClient();
  const writer = useGameWriter();
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState('');
  const url = useMemo(
    () => ({
      search: params,
      replace: (next: URLSearchParams) => setParams(next, { replace: true }),
    }),
    [params, setParams],
  );

  const catalog = useQuery({
    queryKey: k.catalog(),
    queryFn: ({ signal }) => api.get<Catalog>('catalog', { signal }),
  });
  const fetchPage = useCallback(
    async (
      r: { filters: LibraryFilters; search: string; sort: string; page: number; pageSize: number },
      signal: AbortSignal,
    ) => {
      const data = await api.get<GamePage>('games', {
        searchParams: {
          q: r.search,
          status: r.filters.status,
          primaryGenre: r.filters.primaryGenre,
          store: r.filters.store,
          sort: r.sort,
          page: r.page,
          pageSize: r.pageSize,
        },
        signal,
      });
      return { items: data.items, total: data.total };
    },
    [],
  );
  const list = useDataCollection<ScoredGame, LibraryFilters>({
    keyPrefix: k.games(),
    fetchPage,
    defaults: DEFAULTS,
    pageSize: 24,
    debounceMs: 250,
    url,
    // Typed searches are never prefetched (parity with the Angular cache policy).
    prefetch: params.get('q') ? false : { aheadPages: 1 },
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
  const setDesire = async (id: string, desire: Desire) => {
    await qc.cancelQueries({ queryKey: k.games() });
    qc.setQueriesData<{ items: ScoredGame[] }>(
      { queryKey: k.games() },
      (page) =>
        page && { ...page, items: page.items.map((g) => (g.id === id ? { ...g, desire } : g)) },
    );
  };

  const { state, query } = list;
  const loading = query.isFetching;
  const total = query.data?.total ?? 0;
  const counts = catalog.data?.counts;
  const select = (
    label: string,
    name: keyof LibraryFilters,
    all: string,
    values: string[] = [],
  ) => (
    <select
      aria-label={label}
      value={state.filters[name]}
      onChange={(e) => list.setFilter(name, e.target.value)}
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
        <Link className="button primary" to="/ordem">
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
            type="search"
            aria-label="Buscar jogo"
            placeholder="Buscar um jogo ou subgênero…"
            value={list.searchInput}
            onChange={(e) => list.setSearch(e.target.value)}
          />
        </label>
        {select('Filtrar status', 'status', 'Status: todos', catalog.data?.statuses)}
        {select('Filtrar gênero', 'primaryGenre', 'Gênero: todos', catalog.data?.genres)}
        {select('Filtrar loja', 'store', 'Loja: todas', catalog.data?.stores)}
      </section>
      <div className="list-toolbar">
        <span>
          {total} jogos encontrados
          {loading && <span className="muted"> · carregando</span>}
        </span>
        <label>
          Ordenar
          <select
            aria-label="Ordenação"
            value={state.sort}
            onChange={(e) => list.setSort(e.target.value)}
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
          <button onClick={() => (setError(''), void query.refetch())}>Tentar novamente</button>
        </div>
      )}
      {query.isError && !query.data ? (
        <ErrorState
          message="Não foi possível carregar a biblioteca. Confira se a API está rodando."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="game-grid">
          {list.items.map((g) => (
            <GameCard key={g.id} game={g} onDesire={setDesire} onError={setError} />
          ))}
        </div>
      )}
      {query.data && total === 0 && !loading && (
        <EmptyState
          title="Nenhum jogo por aqui"
          description="Tente outro nome ou remova um filtro."
        />
      )}
      <Pagination
        page={state.page}
        pageCount={list.pageCount}
        onPageChange={(p) => list.setPage(p)}
        labels={{
          previous: '← Anterior',
          next: 'Próxima →',
          position: (p, c) => `Página ${p} de ${c}`,
        }}
      />
    </>
  );
}
