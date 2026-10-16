import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Catalog, ScoredGame } from '../../../../../packages/core/src/models';
import { api } from '../../api/http';
import { useQueryKeys } from '../../query/keys';
import { FinishDialog } from '../finish-dialog';
import { AppLoader } from '../loader/AppLoader';
import { MetadataSelect } from '../metadata';
import { useGameWriter } from '../playing/gameWriter';
import { GameActionIcons } from './GameActionIcons';
import { GameDetailTags } from './GameDetailTags';

export interface GameDetailModalProps {
  gameId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal to display and edit game details without navigating away from the current page.
 * Provides score breakdown, notes editing, status/desire selector and finish action.
 */
export const MODAL_QUERY_TIMEOUT_MS = 20_000;

export function GameDetailModal({ gameId, open, onOpenChange }: GameDetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const k = useQueryKeys();
  const writer = useGameWriter();

  const gameQuery = useQuery({
    queryKey: k.game(gameId ?? ''),
    queryFn: ({ signal }) => {
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(MODAL_QUERY_TIMEOUT_MS)]);
      return api.get<ScoredGame>('games/' + encodeURIComponent(gameId!), {
        signal: combinedSignal,
        timeout: MODAL_QUERY_TIMEOUT_MS,
      });
    },
    enabled: Boolean(open && gameId),
    retry: false,
  });

  const catalogQuery = useQuery({
    queryKey: k.catalog(),
    queryFn: ({ signal }) => {
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(MODAL_QUERY_TIMEOUT_MS)]);
      return api.get<Catalog>('catalog', {
        signal: combinedSignal,
        timeout: MODAL_QUERY_TIMEOUT_MS,
      });
    },
    enabled: Boolean(open),
    retry: false,
  });

  const game = gameQuery.data;
  const catalog = catalogQuery.data;
  const isCatalogDisabled = !catalog || catalogQuery.isError || catalogQuery.isLoading;

  const [notesInput, setNotesInput] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [finishing, setFinishing] = useState(false);

  const notes = notesInput ?? game?.notes ?? '';

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      const prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (!el.open) {
        el.showModal();
        el.focus({ preventScroll: true });
      }
      return () => {
        document.documentElement.style.overflow = prevOverflow;
        if (el.open) el.close();
      };
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  async function handleStatusChange(status: string) {
    if (!game || isCatalogDisabled) return;
    if (catalog?.statuses && !catalog.statuses.includes(status as ScoredGame['status'])) return;
    try {
      await writer.save(game.id, { status: status as ScoredGame['status'] });
    } catch {
      // GameWriter handles error reporting
    }
  }

  async function handleDesireChange(desire: string) {
    if (!game || isCatalogDisabled) return;
    if (catalog?.desires && !catalog.desires.includes(desire as ScoredGame['desire'])) return;
    try {
      await writer.save(game.id, { desire: desire as ScoredGame['desire'] });
    } catch {
      // GameWriter handles error reporting
    }
  }

  async function handleTagsChange(tags: string[]) {
    if (!game || isCatalogDisabled) return;
    try {
      await writer.save(game.id, { secondaryTags: tags });
    } catch {
      // GameWriter handles error reporting
    }
  }

  async function handleGenreChange(genre: string) {
    if (!game || isCatalogDisabled) return;
    if (catalog?.genres && !catalog.genres.includes(genre)) return;
    try {
      await writer.save(game.id, { primaryGenre: genre });
    } catch {
      // GameWriter handles error reporting
    }
  }

  async function handleSaveNotes() {
    if (!game) return;
    setSavingNotes(true);
    setNotesError('');
    try {
      await writer.save(game.id, { notes: notes.trim() });
      setNotesInput(null);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSavingNotes(false);
    }
  }

  if (!open) return null;

  const isLoading = Boolean(gameId) && gameQuery.isLoading && !game;
  const isError = Boolean(!gameId || (gameQuery.isError && !game) || (!isLoading && !game));

  return (
    <>
      <dialog
        data-testid={`modal-game-${gameId?.toLowerCase() ?? 'empty'}`}
        key={gameId ?? 'empty'}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => {
          if (e.target === dialogRef.current) onOpenChange(false);
        }}
        onCancel={(e) => {
          e.preventDefault();
          onOpenChange(false);
        }}
        className="z-50 m-auto flex w-[calc(100vw-24px)] max-w-[720px] max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-[var(--scrim)] outline-none focus:outline-none max-sm:w-[calc(100vw-16px)] max-sm:rounded-xl"
        aria-labelledby="modal-game-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-6 sm:py-4">
          <span className="eyebrow m-0">DETALHES DO JOGO</span>
          <button
            data-testid="modal-close"
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-lg text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12" role="status">
              <AppLoader
                data-testid="loader-modal"
                variant="spinner"
                size={48}
                label="Carregando detalhes do jogo…"
                fill="block"
              />
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-[var(--muted)]" role="alert">
              <p className="text-sm">
                {!gameId
                  ? 'Jogo não especificado.'
                  : gameQuery.isError
                    ? 'Não foi possível carregar o jogo.'
                    : 'Jogo não encontrado.'}
              </p>
              {gameQuery.isError && (
                <button
                  data-testid="modal-game-retry"
                  type="button"
                  className="button mt-3 text-xs"
                  disabled={gameQuery.isFetching}
                  onClick={() => void gameQuery.refetch()}
                >
                  Tentar novamente
                </button>
              )}
            </div>
          ) : game ? (
            <>
              <div className="flex flex-col items-start gap-5 sm:flex-row">
                <div className="relative flex aspect-[460/215] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--cover-a)] sm:w-[200px]">
                  {game.coverUrl && (
                    <img
                      src={game.coverUrl}
                      alt=""
                      className="h-full w-full object-contain"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                  <span className="select-none text-3xl font-bold opacity-30">
                    {game.name.slice(0, 1)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="eyebrow m-0">
                      {game.store} · {game.platform}
                    </span>
                    <Link
                      data-testid="modal-open-detail"
                      to={`/jogos/${encodeURIComponent(game.id)}`}
                      className="text-xs text-[var(--muted)] underline hover:text-[var(--text)] whitespace-nowrap"
                      onClick={() => onOpenChange(false)}
                    >
                      Abrir página completa →
                    </Link>
                  </div>
                  <h2
                    id="modal-game-title"
                    className="my-1 break-words text-xl font-bold sm:text-2xl"
                  >
                    {game.name}
                  </h2>
                  <GameDetailTags game={game} testIdPrefix="modal-badge" className="my-2" />
                  <div className="mt-3 w-full">
                    <GameActionIcons
                      game={game}
                      onFinish={() => setFinishing(true)}
                      testIdPrefix="modal"
                      className="my-0 w-full"
                    />
                  </div>
                </div>
              </div>

              {catalogQuery.isError && (
                <div
                  data-testid="modal-catalog-error"
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]"
                >
                  <span>Não foi possível carregar as opções de catálogo.</span>
                  <button
                    data-testid="modal-catalog-retry"
                    type="button"
                    className="button text-xs"
                    disabled={catalogQuery.isFetching}
                    onClick={() => void catalogQuery.refetch()}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
              {catalogQuery.isLoading && !catalog && (
                <div
                  data-testid="modal-catalog-loading"
                  role="status"
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-center text-xs text-[var(--muted)]"
                >
                  Carregando opções de catálogo…
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="panel p-4">
                  <span className="eyebrow">STATUS DO JOGO</span>
                  <div className="mt-2">
                    <MetadataSelect
                      data-testid="modal-status"
                      label="Status"
                      kind="status"
                      options={catalog?.statuses ?? []}
                      value={game.status}
                      onValueChange={handleStatusChange}
                      isLoading={catalogQuery.isLoading}
                      isError={catalogQuery.isError}
                      disabled={isCatalogDisabled}
                      onRetry={() => void catalogQuery.refetch()}
                    />
                  </div>
                </div>
                <div className="panel p-4">
                  <span className="eyebrow">VONTADE DE JOGAR</span>
                  <div className="mt-2">
                    <MetadataSelect
                      data-testid="modal-desire"
                      label="Vontade"
                      kind="desire"
                      options={catalog?.desires ?? []}
                      value={game.desire}
                      onValueChange={handleDesireChange}
                      isLoading={catalogQuery.isLoading}
                      isError={catalogQuery.isError}
                      disabled={isCatalogDisabled}
                      onRetry={() => void catalogQuery.refetch()}
                    />
                  </div>
                </div>
              </div>

              <div className="panel p-4">
                <span className="eyebrow">GÊNERO</span>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <MetadataSelect
                    data-testid="modal-genre"
                    label="Principal"
                    kind="genre"
                    options={catalog?.genres ?? []}
                    value={game.primaryGenre}
                    onValueChange={handleGenreChange}
                    isLoading={catalogQuery.isLoading}
                    isError={catalogQuery.isError}
                    disabled={isCatalogDisabled}
                    onRetry={() => void catalogQuery.refetch()}
                  />
                  <MetadataSelect
                    data-testid="modal-tags"
                    multiple
                    max={3}
                    label="Secundárias"
                    kind="tag"
                    options={catalog?.tags ?? []}
                    values={game.secondaryTags ?? []}
                    onValuesChange={handleTagsChange}
                    isLoading={catalogQuery.isLoading}
                    isError={catalogQuery.isError}
                    disabled={isCatalogDisabled}
                    onRetry={() => void catalogQuery.refetch()}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="panel p-4">
                  <span className="eyebrow">PONTUAÇÃO PESSOAL</span>
                  <div className="big-score my-2">
                    {game.baseScore}
                    <small>pontos de base</small>
                  </div>
                  <dl>
                    <div>
                      <dt>Afinidade com seu gosto</dt>
                      <dd>{game.affinity} / 100</dd>
                    </div>
                    <div>
                      <dt>Tempo no seu ritmo</dt>
                      <dd>
                        {game.plannedHours === null ? 'A confirmar' : `${game.plannedHours} h`}
                      </dd>
                    </div>
                    <div>
                      <dt>Horas na Steam</dt>
                      <dd>{game.steamHours === null ? '—' : `${game.steamHours} h`}</dd>
                    </div>
                    <div>
                      <dt>Horas para finalizar</dt>
                      <dd>{game.actualHours === null ? '—' : `${game.actualHours} h`}</dd>
                    </div>
                    <div>
                      <dt>Steam App ID</dt>
                      <dd>{game.steamAppId ?? '—'}</dd>
                    </div>
                  </dl>
                </div>

                <div className="panel flex flex-col p-4">
                  <span className="eyebrow">SUAS ANOTAÇÕES</span>
                  <label htmlFor="modal-notes" className="my-1 text-xs text-[var(--muted)]">
                    O que vale lembrar sobre este jogo?
                  </label>
                  <textarea
                    data-testid="modal-notes"
                    id="modal-notes"
                    rows={5}
                    value={notes}
                    onChange={(e) => {
                      setNotesInput(e.target.value);
                      setNotesSaved(false);
                      setNotesError('');
                    }}
                    className="w-full flex-1 resize-none rounded-md border border-[var(--border)] bg-transparent p-2 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    placeholder="Escreva suas anotações aqui…"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-[var(--muted)]" role="status">
                      {notesSaved ? 'Salvo!' : notesError ? notesError : ''}
                    </span>
                    <button
                      data-testid="modal-notes-save"
                      type="button"
                      className="button text-xs"
                      disabled={savingNotes}
                      onClick={handleSaveNotes}
                    >
                      {savingNotes ? (
                        <AppLoader variant="spinner" layout="inline" size="sm" label="Salvando…" />
                      ) : (
                        'Salvar anotações'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </dialog>

      {finishing && game && (
        <FinishDialog
          game={game}
          onClose={() => {
            setFinishing(false);
          }}
        />
      )}
    </>
  );
}
