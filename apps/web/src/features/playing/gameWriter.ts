import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  Catalog,
  Desire,
  QueueEntry,
  Recommendations,
  ScoredGame,
} from '../../../../../packages/core/src/models';
import { api } from '../../api/http';
import { useAuth } from '../../auth/AuthProvider';
import { queryKeys } from '../../query/keys';
import { PlayingUpdates, updatePlayingQueue, type PlayingEvent } from './playingUpdates';

/**
 * Single writer for game PATCHes (port of Api.save / setDesire / togglePlaying).
 * Writes of one game are serialized and wait for pending playing toggles. Playing toggles are
 * optimistic: every cache (games pages, game detail, catalog counts, queues) is patched at once, so
 * pages only read the cache. Failures roll back to the confirmed state and refetch dependents.
 */
export interface GameWriter {
  save(id: string, patch: Record<string, unknown>): Promise<ScoredGame>;
  setDesire(id: string, desire: Desire): Promise<ScoredGame>;
  togglePlaying(game: ScoredGame): Promise<void>;
  purchase(id: string): Promise<ScoredGame>;
  unpurchase(id: string): Promise<ScoredGame>;
  readonly pendingPlaying: number;
  /** Subscribe to playing outcomes; returns the unsubscribe function. */
  onPlaying(listener: (event: PlayingEvent) => void): () => void;
}

type PageLike = { items: ScoredGame[] };
const gamePath = (id: string) => 'games/' + encodeURIComponent(id);

function createGameWriter(qc: QueryClient, userId: string): GameWriter {
  const k = queryKeys(userId);
  const writes = new Map<string, Promise<unknown>>();
  const originalEntries = new Map<string, Map<string, QueueEntry>>();
  let applying: Promise<void> = Promise.resolve();
  const listeners = new Set<(event: PlayingEvent) => void>();

  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleSettleInvalidation = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: [userId, 'queue'] }),
        qc.invalidateQueries({ queryKey: k.catalog() }),
      ]);
    }, 300);
  };

  const invalidateDependents = (exceptGameId?: string) => {
    clearTimeout(settleTimer);
    return Promise.all(
      k.gameDependents().map((queryKey) =>
        qc.invalidateQueries({
          queryKey,
          predicate: (q) =>
            !(exceptGameId && q.queryKey[1] === 'game' && q.queryKey[2] === exceptGameId),
        }),
      ),
    );
  };

  const previousOf = (id: string): ScoredGame | undefined => {
    for (const [, page] of qc.getQueriesData<PageLike>({ queryKey: k.games() })) {
      const found = page?.items.find((g) => g.id === id);
      if (found) return found;
    }
    return qc.getQueryData<ScoredGame>(k.game(id));
  };

  /** Mirrors a playing event into every cache that shows the game. */
  async function applyPlaying(event: PlayingEvent) {
    const { game } = event;
    const confirmed = event.phase !== 'changed';
    // Cancel in-flight reads so a late response cannot overwrite the optimistic patch.
    await Promise.all(
      [k.games(), k.catalog(), [userId, 'queue'], k.game(game.id)].map((queryKey) =>
        qc.cancelQueries({ queryKey }),
      ),
    );
    const previous = previousOf(game.id);
    const fields = { status: game.status, startedAt: game.startedAt, finishedAt: game.finishedAt };
    qc.setQueriesData<PageLike>(
      { queryKey: k.games() },
      (page) =>
        page && {
          ...page,
          items: page.items.map((g) => (g.id === game.id ? { ...g, ...fields } : g)),
        },
    );
    qc.setQueryData<ScoredGame>(k.game(game.id), (old) =>
      confirmed ? game : old && { ...old, ...fields },
    );
    if (previous) {
      const delta = (s: string) => Number(game.status === s) - Number(previous.status === s);
      qc.setQueryData<Catalog>(
        k.catalog(),
        (c) =>
          c && {
            ...c,
            counts: {
              ...c.counts,
              playing: c.counts.playing + delta('Jogando'),
              pending: c.counts.pending + delta('Não iniciado'),
            },
          },
      );
    }
    // Remember each queue entry on the first change so a failure restores its old position.
    const originals = (originalEntries.get(game.id) ?? new Map()) as Map<string, QueueEntry>;
    originalEntries.set(game.id, originals);
    for (const [key, q] of qc.getQueriesData<Recommendations>({ queryKey: [userId, 'queue'] })) {
      if (!q) continue;
      const hash = JSON.stringify(key);
      if (event.phase === 'changed' && !originals.has(hash)) {
        const entry = q.items.find((e) => e.game.id === game.id);
        if (entry) originals.set(hash, entry);
      }
      qc.setQueryData(
        key,
        updatePlayingQueue(q, game, event.phase === 'failed' ? originals.get(hash) : undefined),
      );
    }
    if (event.phase !== 'changed') originalEntries.delete(game.id);
  }

  async function write(id: string, patch: Record<string, unknown>) {
    return api.patch<ScoredGame>(gamePath(id), { json: patch });
  }
  /** Serialize writes per game; a failed predecessor never blocks the next write. */
  function chain(id: string, patch: Record<string, unknown>): Promise<ScoredGame> {
    const run = (writes.get(id) ?? Promise.resolve()).catch(() => {}).then(() => write(id, patch));
    writes.set(id, run);
    const cleanup = () => writes.get(id) === run && writes.delete(id);
    run.then(cleanup, cleanup);
    return run;
  }

  const playing = new PlayingUpdates(
    (id, patch) => chain(id, patch),
    (event) => {
      // Events apply in order; listeners run after the cache patch; failures invalidate dependents.
      applying = applying.then(async () => {
        await applyPlaying(event);
        if (event.phase === 'changed') clearTimeout(settleTimer);
        if (event.phase === 'failed' && !playing.pending) void invalidateDependents();
        if (event.phase === 'saved' && !playing.pending) scheduleSettleInvalidation();
        listeners.forEach((l) => l(event));
      });
    },
    (id) => api.get<ScoredGame>(gamePath(id)),
  );

  async function save(id: string, patch: Record<string, unknown>) {
    await playing.wait(id);
    const game = await chain(id, patch);
    await qc.cancelQueries({ queryKey: k.game(id) });
    qc.setQueryData(k.game(id), game);
    void invalidateDependents(id);
    return game;
  }

  async function purchase(id: string): Promise<ScoredGame> {
    await playing.wait(id);
    const game = await api.post<ScoredGame>(`games/${encodeURIComponent(id)}/purchase`, {
      json: {},
    });
    await qc.cancelQueries({ queryKey: k.game(id) });
    qc.setQueryData(k.game(id), game);
    void invalidateDependents(id);
    return game;
  }

  async function unpurchase(id: string): Promise<ScoredGame> {
    await playing.wait(id);
    const game = await api.post<ScoredGame>(`games/${encodeURIComponent(id)}/unpurchase`, {
      json: {},
    });
    await qc.cancelQueries({ queryKey: k.game(id) });
    qc.setQueryData(k.game(id), game);
    await Promise.all([
      qc.invalidateQueries({ queryKey: k.games() }),
      qc.invalidateQueries({ queryKey: k.wishlist() }),
      qc.invalidateQueries({ queryKey: k.game(id) }),
      qc.invalidateQueries({ queryKey: [...k.all, 'queue'] }),
      qc.invalidateQueries({ queryKey: k.catalog() }),
    ]);
    return game;
  }

  return {
    save,
    setDesire: (id, desire) => save(id, { desire }),
    togglePlaying: (game) => playing.toggle(game),
    purchase,
    unpurchase,
    get pendingPlaying() {
      return playing.pending;
    },
    onPlaying(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const writers = new WeakMap<QueryClient, Map<string, GameWriter>>();

/** One writer per query client and user, so pending toggles survive page changes. */
export function useGameWriter(): GameWriter {
  const qc = useQueryClient();
  const { userId } = useAuth();
  let byUser = writers.get(qc);
  if (!byUser) writers.set(qc, (byUser = new Map()));
  let writer = byUser.get(userId);
  if (!writer) byUser.set(userId, (writer = createGameWriter(qc, userId)));
  return writer;
}
