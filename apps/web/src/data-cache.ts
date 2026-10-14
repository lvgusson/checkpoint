// Cache de dados do front (stale-while-revalidate), por usuário.
//
// Por que aqui e não Next/Redis: o custo que o usuário sente é a ida à API a cada troca de
// tela no celular. Um cache no servidor (Redis) não evita essa ida; trocar de framework
// também não. O que resolve é o cliente mostrar na hora o último dado conhecido (memória,
// e localStorage entre aberturas do app) e revalidar em segundo plano.
//
// - `swr(key, fetcher, onValue)`: entrega o cache na hora (se houver) e, se estiver velho
//   (> FRESH_MS) ou ausente, busca e entrega de novo. Requisições iguais em voo são
//   compartilhadas.
// - `invalidate(...prefixos)`: marca como velho (o próximo `swr` mostra e revalida) e avisa
//   as telas abertas via `version`.
// - Logout limpa tudo (clearDataCache em auth.service).
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth/auth.service';

const PREFIX = 'checkpoint:cache:';
/** Até aqui o dado é usado sem revalidar. */
export const FRESH_MS = 60_000;
/** Mais velho que isso, o que está no localStorage é descartado. */
const MAX_AGE_MS = 7 * 24 * 3600_000;

interface Entry<T = unknown> {
  at: number;
  value: T;
  /** Marcado por invalidate: mostra, mas revalida. */
  stale?: boolean;
}

export function clearDataCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      // + chaves antigas do cache de configuração (antes do DataCache)
      if (key?.startsWith(PREFIX) || key?.startsWith('checkpoint:scoring-settings:'))
        localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

@Injectable({ providedIn: 'root' })
export class DataCache {
  private auth = inject(AuthService);
  private mem = new Map<string, Entry>();
  private inflight = new Map<string, Promise<unknown>>();
  private owner: string | null = null;
  /** Sobe a cada invalidação; telas abertas podem reagir (effect) e revalidar. */
  readonly version = signal(0);

  private scope() {
    const uid = this.auth.user()?.id ?? 'local';
    if (uid !== this.owner) {
      this.owner = uid;
      this.mem.clear();
      this.inflight.clear();
    }
    return PREFIX + uid + ':';
  }

  peek<T>(key: string): Entry<T> | null {
    const full = this.scope() + key;
    const hit = this.mem.get(full);
    if (hit) return hit as Entry<T>;
    try {
      const raw = localStorage.getItem(full);
      if (!raw) return null;
      const e = JSON.parse(raw) as Entry<T>;
      if (!Number.isFinite(e?.at) || Date.now() - e.at > MAX_AGE_MS) return null;
      this.mem.set(full, e);
      return e;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T, persist = true): void {
    const full = this.scope() + key;
    const e: Entry<T> = { at: Date.now(), value };
    this.mem.set(full, e);
    if (persist) this.persist(full, e);
  }

  /** Atualiza o valor em cache (ex.: atualização otimista) sem mudar a idade. */
  patch<T>(key: string, fn: (v: T) => T): void {
    const e = this.peek<T>(key);
    if (!e) return;
    const next = { ...e, value: fn(e.value) };
    const full = this.scope() + key;
    this.mem.set(full, next);
    this.persist(full, next);
  }

  /** Dado fresco do cache ou da rede (sem entrega dupla). */
  async get<T>(key: string, fetcher: () => Promise<T>, persist = true): Promise<T> {
    const e = this.peek<T>(key);
    if (e && !e.stale && Date.now() - e.at < FRESH_MS) return e.value;
    return this.fetch(key, fetcher, persist);
  }

  /**
   * Entrega o cache na hora (se houver) e revalida quando necessário. `onValue` recebe
   * `fromCache=true` na entrega imediata. A promise termina com o dado mais novo.
   */
  async swr<T>(
    key: string,
    fetcher: () => Promise<T>,
    onValue: (value: T, fromCache: boolean) => void,
    { force = false, persist = true } = {},
  ): Promise<T> {
    const e = this.peek<T>(key);
    if (e) onValue(e.value, true);
    if (e && !force && !e.stale && Date.now() - e.at < FRESH_MS) return e.value;
    const fresh = await this.fetch(key, fetcher, persist);
    onValue(fresh, false);
    return fresh;
  }

  /** Marca como velhas as chaves que começam com algum dos prefixos. */
  invalidate(...prefixes: string[]): void {
    const scope = this.scope();
    const hit = (full: string) => prefixes.some((p) => full.startsWith(scope + p));
    // Reads started before a mutation must not populate the cache or be reused afterward.
    for (const full of this.inflight.keys()) if (hit(full)) this.inflight.delete(full);
    for (const [full, e] of this.mem) if (hit(full)) this.mem.set(full, { ...e, stale: true });
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const full = localStorage.key(i);
        if (!full || !hit(full)) continue;
        const raw = localStorage.getItem(full);
        if (raw) localStorage.setItem(full, JSON.stringify({ ...JSON.parse(raw), stale: true }));
      }
    } catch {
      // ignore
    }
    this.version.update((v) => v + 1);
  }

  /** Remove de vez (ex.: lista apagada). */
  drop(...prefixes: string[]): void {
    const scope = this.scope();
    const hit = (full: string) => prefixes.some((p) => full.startsWith(scope + p));
    for (const full of [...this.mem.keys()]) if (hit(full)) this.mem.delete(full);
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const full = localStorage.key(i);
        if (full && hit(full)) localStorage.removeItem(full);
      }
    } catch {
      // ignore
    }
  }

  private fetch<T>(key: string, fetcher: () => Promise<T>, persist: boolean): Promise<T> {
    const full = this.scope() + key;
    const running = this.inflight.get(full) as Promise<T> | undefined;
    if (running) return running;
    const p = fetcher()
      .then((value) => {
        if (this.inflight.get(full) !== p) return value;
        const e: Entry<T> = { at: Date.now(), value };
        this.mem.set(full, e);
        if (persist) this.persist(full, e);
        return value;
      })
      .finally(() => {
        if (this.inflight.get(full) === p) this.inflight.delete(full);
      });
    this.inflight.set(full, p);
    return p;
  }

  private persist(full: string, e: Entry): void {
    const raw = JSON.stringify(e);
    try {
      localStorage.setItem(full, raw);
    } catch {
      // Cota cheia: libera as entradas mais antigas deste cache e tenta uma vez.
      try {
        const ours: { key: string; at: number }[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k?.startsWith(PREFIX) || k === full) continue;
          ours.push({ key: k, at: JSON.parse(localStorage.getItem(k) ?? '{}').at ?? 0 });
        }
        ours.sort((a, b) => a.at - b.at);
        for (const o of ours.slice(0, Math.ceil(ours.length / 2))) localStorage.removeItem(o.key);
        localStorage.setItem(full, raw);
      } catch {
        // Fica só na memória.
      }
    }
  }
}

/** Chaves do cache (um lugar só, para as invalidações baterem). */
export const keys = {
  catalog: 'catalog',
  games: (params: Record<string, string | number>) =>
    'games?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])),
  game: (id: string) => 'game:' + id,
  queue: (listId: string) => 'queue:' + listId,
  lists: 'lists',
  settings: (listId: string) => 'settings:' + listId,
  wishlist: 'wishlist',
};
/** Tudo que muda quando um jogo muda (pontuação, fila de todas as listas, catálogo). */
export const GAME_DEPENDENTS = ['games?', 'game:', 'queue:', 'catalog', 'wishlist'];
