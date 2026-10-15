import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Desire,
  ManualResetResult,
  Recommendations,
  ReorderAccepted,
} from '../../../../../packages/core/src/models';
import { api, listPath } from '../../api/http';
import { useQueryKeys } from '../../query/keys';
import { useGameWriter } from '../playing/gameWriter';
import { useSyncScoringVersion } from '../scoring';
import { moveEntry, withDesire } from './queue-model';

const SETTLE_MS = 1200;
const FLASH_MS = 2500;

/**
 * Queue of one list plus its mutations. Reads come from the query cache (60 s fresh). A drop
 * is applied optimistically to the cache; moves are sent one at a time in drop order; the API
 * answers "accepted" before persisting, so the queue is reconciled by refetching: immediately
 * after a failure, otherwise {@link SETTLE_MS} after the last move.
 */
export function useQueue(listId: string) {
  const qc = useQueryClient();
  const k = useQueryKeys();
  const writer = useGameWriter();
  const syncVersion = useSyncScoringVersion();
  const key = k.queue(listId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api.get<Recommendations>(listPath(listId) + '/recommendations', { signal }),
  });
  const data = query.data;

  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [announcement, say] = useState('');
  const pendingMoves = useRef(0);
  const moveFailed = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nameOf = (id: string) => data?.items.find((i) => i.game.id === id)?.game.name ?? 'Jogo';
  const refetchNow = useCallback(() => void qc.invalidateQueries({ queryKey: key }), [qc, key]);
  // Moves still in flight own the order: refetching now would undo the drag, so wait and retry.
  const reconcile = useCallback(
    function run() {
      if (pendingMoves.current > 0) {
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null;
          run();
        }, SETTLE_MS);
        return;
      }
      refetchNow();
    },
    [refetchNow],
  );
  const showFlash = (id: string | null) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(id);
    if (id) flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  // The configuration cached for this list must match the version that produced the queue.
  const version = data?.configVersion;
  useEffect(() => {
    if (version !== undefined && !query.isPlaceholderData) syncVersion(listId, version);
  }, [listId, version, query.isPlaceholderData, syncVersion]);

  // Outcomes of optimistic playing toggles (the writer already patches the cache).
  useEffect(
    () =>
      writer.onPlaying((event) => {
        if (event.phase === 'failed')
          setActionError(`Não foi possível mudar o status de ${event.game.name}.`);
        if (event.phase === 'saved' && !writer.pendingPlaying)
          setNotice(
            event.game.status === 'Jogando'
              ? `${event.game.name} está em andamento.`
              : `${event.game.name} voltou para a fila.`,
          );
      }),
    [writer],
  );

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      // A pending quiet refresh must not be lost when leaving the page.
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        refetchNow();
      }
    },
    [refetchNow],
  );

  const reorder = useMutation({
    scope: { id: 'queue:' + listId },
    mutationFn: (v: { id: string; toPosition: number }) =>
      api.post<ReorderAccepted>(listPath(listId) + '/queue/reorder', {
        json: { gameId: v.id, toPosition: v.toPosition },
      }),
    onError: (e, v) => {
      moveFailed.current = true;
      setActionError(
        `Não foi possível mover ${nameOf(v.id)}${e.message ? ': ' + e.message : ''}. A fila voltou à última ordem salva.`,
      );
      say('Erro ao salvar. A ordem salva foi restaurada.');
    },
    onSettled: () => {
      if (--pendingMoves.current > 0) return;
      if (moveFailed.current) {
        moveFailed.current = false;
        reconcile();
      } else {
        // Gives the server time to finish persisting before re-reading scores and reasons.
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null;
          reconcile();
        }, SETTLE_MS);
      }
    },
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<ManualResetResult>(
        listPath(listId) + '/queue/adjustments/' + encodeURIComponent(id),
      ),
  });

  return {
    data,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    /** Pull the queue again (the "Recalcular a fila" action). */
    recalculate: () => {
      setActionError('');
      return query.refetch();
    },
    error:
      actionError ||
      (query.isError
        ? data
          ? 'Sem conexão com a API: mostrando a última ordem salva neste aparelho.'
          : 'Não foi possível calcular a ordem. Confira a API.'
        : ''),
    setError: setActionError,
    notice,
    setNotice,
    flash,
    busyId,
    announcement,
    say,
    nameOf,

    /** A drop: the game is already where it was dropped (optimistic); the server validates later. */
    move(id: string, fromIndex: number, toIndex: number) {
      if (!data) return;
      void qc.cancelQueries({ queryKey: key });
      qc.setQueryData<Recommendations>(key, moveEntry(data, fromIndex, toIndex));
      setNotice(null);
      showFlash(id);
      setActionError('');
      say(`${nameOf(id)} fixado na posição ${toIndex + 1}.`);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      pendingMoves.current++;
      reorder.mutate({ id, toPosition: toIndex + 1 });
    },

    /** "Jogar já" changed the desire optimistically. */
    async setDesire(id: string, desire: Desire) {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<Recommendations>(key, (q) => q && withDesire(q, id, desire));
      showFlash(id);
    },

    /** Desire persisted: re-read the queue so it slides to the order the server computed. */
    desireSaved: reconcile,

    /** Release a pinned position. */
    async resetManual(id: string) {
      if (busyId || pendingMoves.current) return;
      setBusyId(id);
      setActionError('');
      try {
        const r = await resetMutation.mutateAsync(id);
        qc.setQueryData(key, r.recommendations);
        showFlash(id);
        const pos = r.recommendations.items.findIndex((i) => i.game.id === id) + 1;
        const text = `${nameOf(id)} voltou à posição do algoritmo${pos ? ' (' + pos + 'ª)' : ''}.`;
        setNotice(text);
        say(text);
      } catch {
        setActionError('Não foi possível soltar a posição fixa.');
      } finally {
        setBusyId(null);
      }
    },

    /** After finishing a game: everything that depends on games is stale, the queue is re-read now. */
    async finished(name: string) {
      await Promise.all(k.gameDependents().map((queryKey) => qc.invalidateQueries({ queryKey })));
      setNotice(`${name} finalizado. A fila foi recalculada.`);
    },
  };
}
