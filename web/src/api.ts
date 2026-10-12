import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  Catalog,
  Desire,
  GamePage,
  ScoredGame,
  Recommendations,
  ReorderAccepted,
  ManualResetResult,
} from '../../shared/models';
import { DataCache, GAME_DEPENDENTS, keys } from './data-cache';
import { PlayingUpdates, type PlayingEvent } from './playing-updates';
/** Prefixo das rotas de uma lista (fila, ajustes manuais e configuração são por lista). */
export const listUrl = (listId: string) => '/api/v1/lists/' + encodeURIComponent(listId);
/**
 * Chamadas da API. Leituras passam pelo DataCache (stale-while-revalidate: `onValue` recebe
 * o cache na hora e o dado novo depois); escritas invalidam o que dependem delas.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private cache = inject(DataCache);
  readonly playingEvents = signal(new Map<string, PlayingEvent>());
  private playingUpdates = new PlayingUpdates(
    (id, patch) => this.persistSave(id, patch),
    (event) => {
      if (event.phase === 'failed') this.cache.invalidate(...GAME_DEPENDENTS);
      this.playingEvents.update((events) => new Map(events).set(event.game.id, event));
    },
    (id) => firstValueFrom(this.http.get<ScoredGame>('/api/v1/games/' + encodeURIComponent(id))),
  );
  private writes = new Map<string, Promise<ScoredGame>>();
  get pendingPlaying() {
    return this.playingUpdates.pending;
  }
  togglePlaying(game: ScoredGame) {
    return this.playingUpdates.toggle(game);
  }
  catalog(onValue: (c: Catalog, fromCache: boolean) => void = () => {}, force = false) {
    return this.cache.swr(
      keys.catalog,
      () => firstValueFrom(this.http.get<Catalog>('/api/v1/catalog')),
      onValue,
      { force },
    );
  }
  list(
    params: Record<string, string | number>,
    onValue: (p: GamePage, fromCache: boolean) => void = () => {},
    force = false,
  ) {
    return this.cache.swr(
      keys.games(params),
      () => firstValueFrom(this.http.get<GamePage>('/api/v1/games', { params })),
      onValue,
      // Buscas digitadas ficam só na memória (não enchem o localStorage).
      { persist: !params['q'], force },
    );
  }
  game(id: string, onValue: (g: ScoredGame) => void = () => {}) {
    return this.cache.swr(
      keys.game(id),
      () => firstValueFrom(this.http.get<ScoredGame>('/api/v1/games/' + encodeURIComponent(id))),
      onValue,
    );
  }
  /** Search predecessor candidates by name without persisting typed queries. */
  searchGames(query: string, excludeId?: string) {
    if (query.trim().length < 3) return Promise.resolve([] as ScoredGame[]);
    return firstValueFrom(
      this.http.get<ScoredGame[]>('/api/v1/games/search', {
        params: { q: query.trim(), ...(excludeId ? { excludeId } : {}) },
      }),
    );
  }
  /** Fila da lista; `force` ignora a janela de frescor (botão Recalcular, pós-erro). */
  queue(
    listId: string,
    onValue: (q: Recommendations, fromCache: boolean) => void = () => {},
    force = false,
  ) {
    return this.cache.swr(
      keys.queue(listId),
      () => firstValueFrom(this.http.get<Recommendations>(listUrl(listId) + '/recommendations')),
      onValue,
      { force },
    );
  }
  /** Guarda a fila mostrada (ex.: ordem otimista após arrastar) para a próxima abertura. */
  rememberQueue(q: Recommendations) {
    if (q.listId) this.cache.set(keys.queue(q.listId), q);
  }
  /** Responde assim que valida; o servidor recalcula e grava depois. */
  reorder(listId: string, gameId: string, toPosition: number) {
    return firstValueFrom(
      this.http.post<ReorderAccepted>(listUrl(listId) + '/queue/reorder', {
        gameId,
        toPosition,
      }),
    );
  }
  async resetManual(listId: string, gameId: string) {
    const r = await firstValueFrom(
      this.http.delete<ManualResetResult>(
        listUrl(listId) + '/queue/adjustments/' + encodeURIComponent(gameId),
      ),
    );
    this.cache.set(keys.queue(listId), r.recommendations);
    return r;
  }
  async save(id: string, patch: Record<string, unknown>) {
    await this.playingUpdates.wait(id);
    return this.persistSave(id, patch);
  }
  private persistSave(id: string, patch: Record<string, unknown>) {
    const run = (this.writes.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.writeGame(id, patch));
    this.writes.set(id, run);
    const cleanup = () => {
      if (this.writes.get(id) === run) this.writes.delete(id);
    };
    run.then(cleanup, cleanup);
    return run;
  }
  private async writeGame(id: string, patch: Record<string, unknown>) {
    const g = await firstValueFrom(
      this.http.patch<ScoredGame>('/api/v1/games/' + encodeURIComponent(id), patch),
    );
    this.cache.invalidate(...GAME_DEPENDENTS);
    this.cache.set(keys.game(id), g);
    return g;
  }
  /** Vontade "Imediata" (topo da fila) ou volta à anterior. */
  setDesire(id: string, desire: Desire) {
    return this.save(id, { desire });
  }
}

/**
 * Vontade anterior de cada jogo marcado como "Imediata" (para o botão desfazer). Fica no
 * localStorage; sem registro, volta para "Muito Alta".
 */
const PREV_KEY = 'checkpoint:previous-desire';
export function rememberDesire(id: string, desire: Desire) {
  try {
    const all = JSON.parse(localStorage.getItem(PREV_KEY) ?? '{}') as Record<string, Desire>;
    all[id] = desire;
    localStorage.setItem(PREV_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}
export function previousDesire(id: string): Desire {
  try {
    const all = JSON.parse(localStorage.getItem(PREV_KEY) ?? '{}') as Record<string, Desire>;
    const d = all[id];
    if (d && d !== 'Imediata') return d;
  } catch {
    // ignore
  }
  return 'Muito Alta';
}

export const color = (v: string) => {
  if (v === 'Imediata') return 'rose';
  if (v === 'Finalizado' || v === 'Muito Alta') return 'green';
  if (v === 'Jogando' || v === 'Alta') return 'blue';
  if (v === 'Abandonado' || v === 'Muito Baixa') return 'gray';
  if (v === 'Desejado') return 'rose';
  if (v === 'Média') return 'amber';
  const n = [...v].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ['violet', 'blue', 'amber', 'rose', 'green'][n % 5];
};
