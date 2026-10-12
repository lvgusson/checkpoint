import type { QueueEntry, Recommendations, ScoredGame } from '../../shared/models.ts';

export interface PlayingEvent {
  game: ScoredGame;
  phase: 'changed' | 'saved' | 'failed';
}

export class PlayingUpdates {
  private states = new Map<
    string,
    { confirmed: ScoredGame; desired: ScoredGame; revision: number; done: Promise<void> }
  >();
  get pending() {
    return this.states.size;
  }
  private save: (id: string, patch: Record<string, unknown>) => Promise<ScoredGame>;
  private notify: (event: PlayingEvent) => void;
  private reconcile?: (id: string) => Promise<ScoredGame>;
  constructor(
    save: PlayingUpdates['save'],
    notify: PlayingUpdates['notify'],
    reconcile?: PlayingUpdates['reconcile'],
  ) {
    this.save = save;
    this.notify = notify;
    this.reconcile = reconcile;
  }
  wait(id: string) {
    return this.states.get(id)?.done ?? Promise.resolve();
  }
  toggle(game: ScoredGame): Promise<void> {
    let state = this.states.get(game.id);
    const current = state?.desired ?? game;
    const today = new Date();
    const startedAt =
      current.startedAt ??
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const desired: ScoredGame = {
      ...current,
      status: current.status === 'Jogando' ? 'Não iniciado' : 'Jogando',
      startedAt,
      finishedAt: null,
    };
    if (state) {
      state.desired = desired;
      state.revision++;
      this.notify({ game: desired, phase: 'changed' });
      return state.done;
    }
    state = { confirmed: game, desired, revision: 0, done: Promise.resolve() };
    this.states.set(game.id, state);
    this.notify({ game: desired, phase: 'changed' });
    state.done = this.drain(state);
    return state.done;
  }
  private async drain(state: NonNullable<ReturnType<PlayingUpdates['states']['get']>>) {
    while (true) {
      const { desired, revision } = state;
      try {
        state.confirmed = await this.save(desired.id, {
          status: desired.status,
          startedAt: desired.startedAt,
        });
      } catch {
        if (state.revision !== revision) continue;
        // A response can fail after persistence; confirm the actual state when reachable.
        try {
          if (this.reconcile) state.confirmed = await this.reconcile(desired.id);
        } catch {
          /* Preserve the last known confirmation while offline. */
        }
        if (state.revision !== revision) continue;
        this.states.delete(desired.id);
        this.notify({ game: state.confirmed, phase: 'failed' });
        return;
      }
      if (state.revision !== revision) continue;
      this.states.delete(desired.id);
      this.notify({ game: state.confirmed, phase: 'saved' });
      return;
    }
  }
}

export function updatePlayingQueue(
  queue: Recommendations,
  game: ScoredGame,
  original?: QueueEntry,
): Recommendations {
  const current = queue.items.find((entry) => entry.game.id === game.id);
  const previousPlaying = queue.playing?.find((entry) => entry.id === game.id);
  const wasPlaying = !!previousPlaying;
  if (!current && !wasPlaying && !original) return queue;
  const previous = current?.game ?? previousPlaying;
  if (previous)
    game = {
      ...previous,
      status: game.status,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
    };
  const playing = (queue.playing ?? []).filter((entry) => entry.id !== game.id);
  const items = queue.items.filter((entry) => entry.game.id !== game.id);
  if (game.status === 'Jogando') playing.push(game);
  else if (
    game.status === 'Não iniciado' ||
    (game.status === 'Abandonado' && !queue.rules.excludeAbandoned)
  ) {
    const entry: QueueEntry = {
      position: 1,
      score: game.baseScore,
      cumulativeHours: 0,
      reasons: [],
      adjustments: [],
      pinnedPosition: null,
      pinnedBeforePrerequisite: false,
      ...(original ?? current),
      game,
    };
    items.splice(
      Math.min((original?.position ?? current?.position ?? 1) - 1, items.length),
      0,
      entry,
    );
  }
  let hours = 0;
  const positioned = items.map((entry, index) => {
    hours += entry.game.plannedHours ?? 0;
    return { ...entry, position: index + 1, cumulativeHours: Math.round(hours * 10) / 10 };
  });
  return {
    ...queue,
    items: positioned,
    playing,
    total: positioned.length,
    estimatedHours: Math.round(hours * 10) / 10,
  };
}
