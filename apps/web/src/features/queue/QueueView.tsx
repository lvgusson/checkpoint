import { SortableList } from '@checkpoint/ui-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import type { Desire, QueueEntry, ScoredGame } from '../../../../../packages/core/src/models';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { FinishDialog } from '../finish-dialog';
import { ImmediateButton } from '../immediate';
import { ListPicker } from '../lists';
import { MetadataBadge } from '../metadata';
import { PlayingButton } from '../playing';
import { AppLoader } from '../loader/AppLoader';
import { GameDetailModal } from '../details';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { fold, PAGE_SIZE, displayDate, excludedReasons } from './queue-model';
import { useQueue } from './useQueue';
import './queue.css';

const DETAIL_STATE = '?from=ordem';

function Cover({ game, lazy = true }: { game: ScoredGame; lazy?: boolean }) {
  return (
    <>
      {game.coverUrl && (
        <img
          src={game.coverUrl}
          alt=""
          loading={lazy ? 'lazy' : undefined}
          draggable={false}
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      <span>{game.name.slice(0, 1)}</span>
    </>
  );
}

function FinishIcon({ withFlagDetail }: { withFlagDetail?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 21V4m0 0h13l-2.5 4L18 12H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {withFlagDetail && <path d="M8 4h3v4H8zm3 4h3v4h-3z" fill="currentColor" />}
    </svg>
  );
}

/** The queue of one list: playing games, summary, search, sortable rows. Remount with `key={listId}`. */
export function QueueView({ listId }: { listId: string }) {
  const q = useQueue(listId);
  const qRef = useRef(q);
  useEffect(() => {
    qRef.current = q;
  });
  const { data, busyId } = q;
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [finishing, setFinishing] = useState<ScoredGame | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const searching = !!fold(search).trim();

  const hasMore = !searching && Boolean(data && visible < data.items.length);
  const handleLoadMore = useCallback(() => {
    setVisible((v) => Math.min(v + PAGE_SIZE, data?.items.length ?? 0));
  }, [data?.items.length]);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    hasMore,
    isLoading: false,
    enabled: !searching,
    resetKey: visible,
  });

  const haystacks = useMemo(() => {
    const cache = new Map<string, string>();
    for (const item of data?.items ?? []) {
      const g = item.game;
      cache.set(
        g.id,
        fold([g.name, g.primaryGenre, ...g.secondaryTags, g.mechanic, g.pace].join(' ')),
      );
    }
    return cache;
  }, [data]);

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const q = fold(search).trim();
    if (!q) {
      return items.slice(0, visible).map((item, index) => ({ item, index }));
    }
    const words = q.split(/\s+/);
    const result: { item: QueueEntry; index: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const hay = haystacks.get(item.game.id) ?? '';
      if (words.every((w) => hay.includes(w))) {
        result.push({ item, index: i });
        if (result.length >= 100) break;
      }
    }
    return result;
  }, [data, search, visible, haystacks]);

  const firstGameId = !searching ? data?.items[0]?.game.id : undefined;

  const handleFinish = useCallback((game: ScoredGame, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFinishing(game);
  }, []);

  const handleSetDesire = useCallback((id: string, desire: Desire) => {
    qRef.current.setDesire(id, desire);
  }, []);

  const handleDesireSaved = useCallback(() => {
    qRef.current.desireSaved();
  }, []);

  const handleDesireFailed = useCallback((message: string) => {
    qRef.current.setError(message);
    qRef.current.desireSaved();
  }, []);

  const handleResetManual = useCallback((id: string) => {
    void qRef.current.resetManual(id);
  }, []);

  const handleOpenDetails = useCallback((id: string) => {
    setSelectedGameId(id);
  }, []);

  const handleMoveIntent = useCallback(
    ({ id, fromIndex, toIndex }: { id: string; fromIndex: number; toIndex: number }) => {
      qRef.current.move(id, fromIndex, toIndex);
    },
    [],
  );

  return (
    <>
      <ListPicker base="/ordem" current={listId}>
        <DropdownMenuItem
          data-testid="queue-recalculate"
          className="min-h-11"
          disabled={q.isFetching}
          onSelect={() => void q.recalculate()}
        >
          <span aria-hidden="true">↻</span>
          Recalcular a fila
        </DropdownMenuItem>
      </ListPicker>
      {q.error && (
        <div className="error" role="alert">
          {q.error}
          {!data && !q.isFetching && (
            <button data-testid="queue-retry" type="button" onClick={() => void q.recalculate()}>
              Tentar novamente
            </button>
          )}
        </div>
      )}
      {data ? (
        <>
          <section className="playing-section" aria-labelledby="playing-heading">
            <div className="playing-heading">
              <h2 id="playing-heading">
                Jogando agora <span className="badge blue">{data.playing?.length ?? 0}</span>
              </h2>
              <p className="muted">
                Continue suas partidas. O controle inicia ou pausa um jogo; a espada ajusta a
                prioridade.
              </p>
            </div>
            {data.playing?.length ? (
              <div className="playing-list">
                {data.playing.map((game) => (
                  <article className="playing-row" key={game.id}>
                    <Link
                      data-testid={`queue-playing-detail-${game.id.toLowerCase()}`}
                      className="playing-link"
                      to={`/jogos/${encodeURIComponent(game.id)}${DETAIL_STATE}`}
                      onClick={(e) => {
                        if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                          e.preventDefault();
                          setSelectedGameId(game.id);
                        }
                      }}
                    >
                      <div className="queue-cover">
                        <Cover game={game} />
                      </div>
                      <div className="playing-copy">
                        <h3>{game.name}</h3>
                        <div className="tags">
                          <MetadataBadge kind="status" value={game.status} />
                          <MetadataBadge kind="genre" value={game.primaryGenre} />
                          {game.secondaryTags.map((tag) => (
                            <MetadataBadge key={tag} kind="tag" value={tag} />
                          ))}
                          <MetadataBadge kind="desire" value={game.desire} />
                        </div>
                        <p className="muted">
                          {game.startedAt
                            ? 'Iniciado em ' + displayDate(game.startedAt)
                            : 'Data de início não informada'}
                        </p>
                      </div>
                    </Link>
                    <div className="playing-actions">
                      <PlayingButton
                        data-testid={`queue-playing-${game.id.toLowerCase()}`}
                        game={game}
                      />
                      <ImmediateButton
                        data-testid={`queue-immediate-${game.id.toLowerCase()}`}
                        game={game}
                        onChanged={(desire) => handleSetDesire(game.id, desire)}
                        onSaved={handleDesireSaved}
                        onFailed={handleDesireFailed}
                      />
                      <button
                        data-testid={`queue-finish-${game.id.toLowerCase()}`}
                        type="button"
                        className="icon-button finish-btn"
                        aria-label={`Finalizar ${game.name}`}
                        title="Finalizar: nota, horas e avaliação"
                        onClick={(e) => handleFinish(game, e)}
                      >
                        <FinishIcon withFlagDetail />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="playing-empty">
                Nenhum jogo em andamento. Clique no controle de um jogo para começar.
              </p>
            )}
          </section>
          <p className="stats-line">
            <b>{data.total}</b> jogos · <b>{data.estimatedHours}</b> h · ritmo{' '}
            <b>{data.timeFactor.toFixed(2)}×</b>
          </p>
          <div className="stats">
            <div>
              <small>NA SUA FILA</small>
              <strong>
                {data.total} <span>jogos</span>
              </strong>
            </div>
            <div>
              <small>TEMPO ESTIMADO</small>
              <strong>
                {data.estimatedHours} <span>horas</span>
              </strong>
            </div>
            <div>
              <small>SEU RITMO</small>
              <strong>
                {data.timeFactor.toFixed(2)}
                <span> × tempo de referência</span>
              </strong>
            </div>
          </div>
          {data.items[0] && <NextGame entry={data.items[0]} onOpenDetails={handleOpenDetails} />}
          <section className="filters queue-search" role="search">
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                data-testid="queue-search"
                type="search"
                aria-label="Buscar na fila por nome, gênero ou tag"
                placeholder="Buscar na fila por nome, gênero ou tag…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </label>
            {search && (
              <Button
                data-testid="queue-search-clear"
                type="button"
                variant="outline"
                onClick={() => setSearch('')}
              >
                Limpar
              </Button>
            )}
          </section>
          <div className="list-toolbar">
            {searching ? (
              <>
                <span role="status">
                  {rows.length} de {data.total} jogos{' '}
                  <span className="muted">· posições reais da fila</span>
                </span>
                <span className="muted">Limpe a busca para arrastar</span>
              </>
            ) : (
              <>
                <span>Seu roteiro de próximas partidas</span>
                <span className="muted drag-hint">Segure um jogo e arraste para reordenar</span>
              </>
            )}
          </div>
          <p id="reorder-help" className="sr-only">
            Para reordenar pelo teclado: foque o puxador, pressione espaço para pegar o jogo, use as
            setas para mover, espaço para soltar ou Esc para cancelar.
          </p>
          <div className="sr-only" aria-live="assertive" aria-atomic="true">
            {q.announcement}
          </div>
          {q.notice && (
            <div className="reorder-notice" role="status">
              <span>{q.notice}</span>
              <button
                data-testid="queue-notice-close"
                type="button"
                onClick={() => q.setNotice(null)}
                aria-label="Fechar aviso"
              >
                ×
              </button>
            </div>
          )}
          <div
            className={cn('queue-list', busyId !== null && 'is-busy', searching && 'is-searching')}
          >
            <SortableList
              data-testid="queue-sortable-list"
              items={rows}
              getId={(row) => row.item.game.id}
              disabled={searching || busyId !== null}
              aria-label="Fila de jogos"
              onMoveIntent={handleMoveIntent}
              renderItem={({ item, index: i }, { isDragging, handleProps }) => {
                // The row is the pointer/touch target; only the invisible handle takes keyboard drags.
                const {
                  onPointerDown,
                  onTouchStart,
                  onKeyDown,
                  style: _style,
                  ...aria
                } = handleProps;
                return (
                  <QueueRow
                    entry={item}
                    index={i}
                    isNextGame={item.game.id === firstGameId}
                    searching={searching}
                    busy={busyId === item.game.id}
                    anyBusy={busyId !== null}
                    flash={q.flash === item.game.id}
                    isDragging={isDragging}
                    pointerProps={{ onPointerDown, onTouchStart }}
                    handleProps={{ ...aria, onKeyDown }}
                    onResetManual={handleResetManual}
                    onOpenDetails={handleOpenDetails}
                    onFinish={handleFinish}
                    onSetDesire={handleSetDesire}
                    onDesireSaved={handleDesireSaved}
                    onDesireFailed={handleDesireFailed}
                  />
                );
              }}
            />
          </div>
          {searching && !rows.length && (
            <div className="empty">Nenhum jogo da fila com “{search}”.</div>
          )}
          {!searching && hasMore && (
            <div
              ref={sentinelRef}
              data-testid="queue-load-more"
              className="py-4 flex items-center justify-center text-sm text-[var(--muted)]"
            >
              <AppLoader layout="inline" size="sm" label="Carregando mais jogos…" />
            </div>
          )}
          {data.total === 0 && (
            <div className="empty">
              <h2>Nenhum jogo disponível na fila</h2>
              <p>Confira os status e os predecessores na biblioteca.</p>
            </div>
          )}
          {data.excluded.length > 0 && (
            <details className="method">
              <summary data-testid="queue-excluded-open">
                {data.excluded.length} jogos fora da fila
              </summary>
              {excludedReasons(data).map((r) => (
                <p key={r.reason}>
                  {r.reason}: {r.count}
                </p>
              ))}
            </details>
          )}
        </>
      ) : (
        q.isLoading && (
          <div className="empty flex flex-col items-center justify-center py-16">
            <AppLoader data-testid="loader-queue" size={64} label="Calculando seu roteiro…" />
          </div>
        )
      )}
      {finishing && (
        <FinishDialog
          key={finishing.id}
          game={finishing}
          onClose={(saved) => {
            setFinishing(null);
            if (saved) void q.finished(finishing.name);
          }}
        />
      )}
      <GameDetailModal
        gameId={selectedGameId}
        open={Boolean(selectedGameId)}
        onOpenChange={(open) => !open && setSelectedGameId(null)}
      />
    </>
  );
}

function NextGame({
  entry: first,
  onOpenDetails,
}: {
  entry: QueueEntry;
  onOpenDetails?: (id: string) => void;
}) {
  return (
    <Link
      data-testid={`queue-next-${first.game.id.toLowerCase()}`}
      className="next-game"
      to={`/jogos/${encodeURIComponent(first.game.id)}${DETAIL_STATE}`}
      onClick={(e) => {
        if (onOpenDetails && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          onOpenDetails(first.game.id);
        }
      }}
    >
      <div className="next-copy">
        <span className="eyebrow">01 / SUA PRÓXIMA PARTIDA</span>
        <h2>{first.game.name}</h2>
        <div className="tags">
          <MetadataBadge kind="genre" value={first.game.primaryGenre} />
          <MetadataBadge kind="desire" value={`Vontade ${first.game.desire.toLowerCase()}`} />
        </div>
        <p>
          {first.game.plannedHours === null
            ? 'Tempo a confirmar'
            : first.game.plannedHours + ' horas estimadas'}{' '}
          · {first.score} pontos
          {first.pinnedPosition ? ' · posição fixada por você' : ''}
        </p>
        <span className="button primary">Ver jogo e avaliar ↗</span>
      </div>
      <div className="next-cover">
        <Cover game={first.game} lazy={false} />
      </div>
    </Link>
  );
}

interface RowProps {
  entry: QueueEntry;
  index: number;
  isNextGame?: boolean;
  searching: boolean;
  busy: boolean;
  anyBusy: boolean;
  flash: boolean;
  isDragging: boolean;
  pointerProps: React.HTMLAttributes<HTMLElement>;
  handleProps: React.HTMLAttributes<HTMLElement>;
  onResetManual(id: string): void;
  onOpenDetails?: (id: string) => void;
  onFinish(game: ScoredGame, e: MouseEvent): void;
  onSetDesire(id: string, desire: Desire): void;
  onDesireSaved(): void;
  onDesireFailed(message: string): void;
}

function areRowPropsEqual(prev: RowProps, next: RowProps): boolean {
  return (
    prev.entry === next.entry &&
    prev.index === next.index &&
    prev.isNextGame === next.isNextGame &&
    prev.searching === next.searching &&
    prev.busy === next.busy &&
    prev.anyBusy === next.anyBusy &&
    prev.flash === next.flash &&
    prev.isDragging === next.isDragging &&
    prev.onResetManual === next.onResetManual &&
    prev.onOpenDetails === next.onOpenDetails &&
    prev.onFinish === next.onFinish &&
    prev.onSetDesire === next.onSetDesire &&
    prev.onDesireSaved === next.onDesireSaved &&
    prev.onDesireFailed === next.onDesireFailed
  );
}

const QueueRow = memo(function QueueRow({
  entry: item,
  index: i,
  isNextGame = false,
  searching,
  busy,
  anyBusy,
  flash,
  isDragging,
  pointerProps,
  handleProps,
  onResetManual,
  onOpenDetails,
  onFinish,
  onSetDesire,
  onDesireSaved,
  onDesireFailed,
}: RowProps) {
  const { game } = item;
  const release = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onResetManual(game.id);
  };
  return (
    <div
      className={cn(
        'queue-row',
        isNextGame && 'is-next-game',
        busy && 'saving',
        flash && 'just-moved',
        isDragging && 'lifted',
      )}
      data-id={game.id}
      data-testid={`queue-row-${game.id.toLowerCase()}`}
      {...pointerProps}
    >
      {!searching && (
        <button
          data-testid={`queue-drag-${game.id.toLowerCase()}`}
          type="button"
          {...handleProps}
          className="drag-handle"
          aria-label={`Reordenar ${game.name}, posição ${i + 1}`}
          aria-describedby="reorder-help"
          disabled={anyBusy}
        >
          <span className="sr-only">Reordenar</span>
        </button>
      )}
      <Link
        data-testid={`queue-game-${game.id.toLowerCase()}`}
        className="queue-link"
        draggable={false}
        to={`/jogos/${encodeURIComponent(game.id)}${DETAIL_STATE}`}
        onClick={(e) => {
          if (onOpenDetails && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            onOpenDetails(game.id);
          }
        }}
      >
        <span className="rank">
          {String(i + 1).padStart(2, '0')}{' '}
          {item.pinnedPosition && (
            <>
              <span className="pin-mark" title="Posição fixada por você" aria-hidden="true">
                •
              </span>
              <span className="sr-only">, fixado</span>
            </>
          )}
        </span>
        <div className="queue-cover">
          <Cover game={game} />
        </div>
        <div className="queue-title">
          <h3>{game.name}</h3>
          <div className="tags">
            <MetadataBadge kind="genre" value={game.primaryGenre} />
            {game.secondaryTags.map((t) => (
              <MetadataBadge key={t} kind="tag" value={t} />
            ))}
            <MetadataBadge kind="status" value={game.status} />
            <MetadataBadge kind="desire" value={game.desire} />
          </div>
          <p>{item.reasons.join(' · ')}</p>
        </div>
        <div className="queue-time">
          {game.plannedHours === null ? '—' : game.plannedHours + ' h'}
          <small>estimadas</small>
        </div>
        <div className="score">
          {busy ? <AppLoader layout="inline" size={16} label="" /> : item.score}
          <small>pontos</small>
        </div>
        <span className="row-arrow">↗</span>
      </Link>
      <div className="queue-actions">
        {busy ? (
          <span className="saving-pill">Recalculando…</span>
        ) : (
          item.pinnedPosition && (
            <span
              className={cn('manual-chip', item.pinnedBeforePrerequisite && 'neg')}
              title={
                item.pinnedBeforePrerequisite
                  ? 'Fixado antes do jogo anterior da série'
                  : 'Posição fixada por você ao arrastar'
              }
            >
              {item.pinnedBeforePrerequisite && (
                <span aria-label="Antes do jogo anterior da série">⚠ </span>
              )}
              Fixado
              <button
                data-testid={`queue-release-${game.id.toLowerCase()}`}
                type="button"
                className="chip-remove"
                disabled={anyBusy}
                aria-label={`Soltar a posição fixa de ${game.name}`}
                onClick={release}
              >
                ×
              </button>
            </span>
          )
        )}
        <PlayingButton data-testid={`queue-playing-${game.id.toLowerCase()}`} game={game} />
        <ImmediateButton
          data-testid={`queue-immediate-${game.id.toLowerCase()}`}
          game={game}
          onChanged={(desire) => onSetDesire(game.id, desire)}
          onSaved={onDesireSaved}
          onFailed={onDesireFailed}
        />
        <button
          data-testid={`queue-finish-${game.id.toLowerCase()}`}
          type="button"
          className="icon-button finish-btn"
          aria-label={`Finalizar ${game.name}`}
          title="Finalizar: nota, horas e avaliação"
          onClick={(e) => onFinish(game, e)}
        >
          <FinishIcon withFlagDetail />
        </button>
      </div>
    </div>
  );
}, areRowPropsEqual);
