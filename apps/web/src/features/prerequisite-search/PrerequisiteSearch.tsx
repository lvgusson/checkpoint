import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type { ScoredGame } from '../../../../../packages/core/src/models';
import { api } from '../../api/http';
import { useQueryKeys } from '../../query/keys';
import { AppLoader } from '../loader/AppLoader';

import { Cover } from '@/components/Cover';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

const rowClass =
  'flex min-h-[50px] w-full min-w-0 items-center gap-2.5 rounded-md border-0 bg-transparent p-1.5 text-left text-foreground';
const nameClass = 'min-w-0 flex-1 truncate text-sm';

/** Search predecessor candidates by name (3+ characters, debounced); typed queries are never cached. */
export function PrerequisiteSearch({
  value,
  excludeId = '',
  onValueChange,
}: {
  value: string | null;
  excludeId?: string;
  onValueChange(value: string | null): void;
}) {
  const k = useQueryKeys();
  const qc = useQueryClient();
  const inputId = useId();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const selected = useQuery({
    queryKey: k.game(value ?? ''),
    queryFn: ({ signal }) => api.get<ScoredGame>('games/' + encodeURIComponent(value!), { signal }),
    enabled: !!value,
  });
  const search = useQuery({
    queryKey: [...k.all, 'game-search', excludeId, query],
    queryFn: ({ signal }) =>
      api.get<ScoredGame[]>('games/search', {
        searchParams: { q: query, ...(excludeId ? { excludeId } : {}) },
        signal,
      }),
    enabled: query.length >= MIN_CHARS,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const results = (search.data ?? []).filter((g) => g.id !== excludeId);
  const waiting = text.trim().length >= MIN_CHARS && (text.trim() !== query || search.isFetching);

  function type(next: string) {
    setText(next);
    clearTimeout(timer.current);
    const trimmed = next.trim();
    if (trimmed.length < MIN_CHARS) return setQuery('');
    timer.current = setTimeout(() => setQuery(trimmed), DEBOUNCE_MS);
  }
  function choose(game: ScoredGame) {
    qc.setQueryData(k.game(game.id), game);
    onValueChange(game.id);
    type('');
  }
  function clear() {
    onValueChange(null);
    type('');
  }

  const clearButton = (
    <button
      data-testid="detail-prerequisite-remove"
      type="button"
      className="size-11 shrink-0 border-0 bg-transparent text-2xl text-foreground"
      onClick={clear}
      aria-label="Remover predecessor"
    >
      ×
    </button>
  );
  return (
    <div className="mt-[17px] block min-w-0">
      <label htmlFor={inputId} className="block text-[11px] font-semibold max-sm:text-[13px]">
        Predecessor
      </label>
      {value && (
        <div className={`${rowClass} mt-2 bg-secondary`}>
          {selected.data ? (
            <>
              <Cover
                game={selected.data}
                className="h-9 w-[54px] aspect-auto shrink-0 rounded-[5px]"
              />
              <span className={nameClass} title={selected.data.name}>
                {selected.data.name}
              </span>
            </>
          ) : selected.isError ? (
            <span className={nameClass}>Predecessor indisponível</span>
          ) : (
            <AppLoader
              layout="inline"
              size="sm"
              label="Carregando predecessor…"
              data-testid="loader-prerequisite"
            />
          )}
          {clearButton}
        </div>
      )}
      <input
        data-testid="detail-prerequisite-search"
        id={inputId}
        type="search"
        value={text}
        onChange={(e) => type(e.target.value)}
        placeholder="Buscar jogo pelo nome"
        autoComplete="off"
        aria-describedby={inputId + '-help'}
        className="mt-2 min-h-[46px] w-full rounded-[7px] border border-border bg-card p-[11px] text-base text-foreground"
      />
      <small id={inputId + '-help'} className="mt-1.5 block text-xs text-muted-foreground">
        Opcional. Digite pelo menos 3 caracteres.
      </small>
      <div role="status" className="mt-1.5 block text-xs text-muted-foreground">
        {waiting ? (
          <AppLoader
            layout="inline"
            size="sm"
            label="Buscando jogos…"
            data-testid="loader-prerequisite-search"
          />
        ) : search.isError ? (
          'Não foi possível buscar. Tente novamente.'
        ) : (
          query && search.isSuccess && !results.length && 'Nenhum jogo encontrado.'
        )}
      </div>
      {results.length > 0 && (
        <ul
          aria-label="Jogos encontrados"
          className="mt-2 max-h-[270px] list-none overflow-auto rounded-lg border border-border bg-card p-1"
        >
          {results.map((game) => (
            <li key={game.id}>
              <button
                data-testid={`detail-prerequisite-result-${game.id.toLowerCase()}`}
                type="button"
                className={`${rowClass} hover:bg-secondary`}
                onClick={() => choose(game)}
              >
                <Cover game={game} className="h-9 w-[54px] aspect-auto shrink-0 rounded-[5px]" />
                <span className={nameClass} title={game.name}>
                  {game.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
