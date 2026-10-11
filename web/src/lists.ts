import { Component, Injectable, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import type { GameList } from '../../shared/models';
import { AuthService } from './auth/auth.service';
import { removeScoringCache, scoringCacheKey } from './scoring-cache';

const URL = '/api/v1/lists';

/** Listas do usuário (todas com todos os jogos; regras e ordem manual são por lista). */
@Injectable({ providedIn: 'root' })
export class ListsStore {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  readonly lists = signal<GameList[]>([]);
  /** Última lista aberta (para quando a URL não traz uma). */
  lastId: string | null = null;
  private loaded: Promise<GameList[]> | null = null;
  private owner: string | undefined;

  /** Carrega uma vez por usuário logado (a API cria a lista "Principal" se não houver nenhuma). */
  ensure(): Promise<GameList[]> {
    const user = this.auth.user()?.id;
    if (user !== this.owner) {
      this.owner = user;
      this.loaded = null;
      this.lastId = null;
    }
    this.loaded ??= this.reload().catch((e) => {
      this.loaded = null;
      throw e;
    });
    return this.loaded;
  }
  async reload(): Promise<GameList[]> {
    const lists = await firstValueFrom(this.http.get<GameList[]>(URL));
    this.lists.set(lists);
    return lists;
  }
  async create(name: string): Promise<GameList> {
    const list = await firstValueFrom(this.http.post<GameList>(URL, { name }));
    this.lists.update((ls) => [...ls, list]);
    return list;
  }
  async rename(id: string, name: string): Promise<GameList> {
    const list = await firstValueFrom(
      this.http.patch<GameList>(URL + '/' + encodeURIComponent(id), { name }),
    );
    this.lists.update((ls) => ls.map((l) => (l.id === id ? list : l)));
    return list;
  }
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(URL + '/' + encodeURIComponent(id)));
    this.lists.update((ls) => ls.filter((l) => l.id !== id));
    removeScoringCache(scoringCacheKey(this.auth.user()?.id, id));
  }
}

/**
 * `listId` da rota (`/ordem/:listId`, `/configuracoes/:listId`). Sem id na URL, redireciona
 * para a lista padrão (a primeira); id desconhecido também cai nela.
 */
export function routeListId(base: string) {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const store = inject(ListsStore);
  const id = toSignal(route.paramMap.pipe(map((p) => p.get('listId'))), { initialValue: null });
  effect(() => {
    const current = id();
    void store
      .ensure()
      // Lê o signal (não o resultado do 1º carregamento): inclui listas criadas depois.
      .then(() => {
        const lists = store.lists();
        if (!lists.length) return;
        if (lists.some((l) => l.id === current)) {
          store.lastId = current;
          return;
        }
        // Sem lista na URL: volta para a última usada (ex.: da fila para as configurações).
        const target = lists.find((l) => l.id === store.lastId) ?? lists[0];
        void router.navigate([base, target.id], { replaceUrl: true });
      })
      .catch(() => undefined);
  });
  return id;
}

const message = (e: unknown, fallback: string) =>
  (e as { error?: { error?: { message?: string } } })?.error?.error?.message ?? fallback;

/** Seletor da lista atual + criar/renomear/apagar. Trocar de lista navega para `base/:id`. */
@Component({
  selector: 'app-list-picker',
  standalone: true,
  template: `<div class="list-picker">
    @if (mode() === 'idle') {
      <label class="list-select">
        <span>LISTA</span>
        <select
          [value]="current() ?? ''"
          (change)="go($any($event.target).value)"
          aria-label="Lista atual"
        >
          @for (l of store.lists(); track l.id) {
            <option [value]="l.id" [selected]="l.id === current()">{{ l.name }}</option>
          }
        </select>
      </label>
      <button type="button" class="button" (click)="start('create')">+ Nova lista</button>
      <button type="button" class="button" (click)="start('rename')" [disabled]="!current()">
        Renomear
      </button>
      <button
        type="button"
        class="button"
        (click)="remove()"
        [disabled]="!current() || store.lists().length < 2"
        [title]="store.lists().length < 2 ? 'Você precisa de ao menos uma lista' : ''"
      >
        Apagar
      </button>
    } @else {
      <form class="list-form" (submit)="$event.preventDefault(); submit()">
        <input
          [value]="name()"
          (input)="name.set($any($event.target).value)"
          maxlength="60"
          required
          [attr.aria-label]="mode() === 'create' ? 'Nome da nova lista' : 'Novo nome da lista'"
          [placeholder]="mode() === 'create' ? 'Nome da nova lista' : 'Novo nome'"
        />
        <button type="submit" class="button primary" [disabled]="busy() || !name().trim()">
          {{ mode() === 'create' ? 'Criar' : 'Salvar' }}
        </button>
        <button type="button" class="button" (click)="cancel()">Cancelar</button>
      </form>
    }
    @if (error()) {
      <span class="list-error" role="alert">{{ error() }}</span>
    }
  </div>`,
  styles: `
    .list-picker {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 8px;
      margin: 0 0 18px;
    }
    .list-select {
      display: grid;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: var(--muted);
      min-width: 0;
    }
    .list-select select,
    .list-form input {
      min-width: 0;
      max-width: 100%;
      padding: 8px 10px;
      font-size: 14px;
      color: inherit;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .list-form {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .list-error {
      flex-basis: 100%;
      color: #944c40;
      font-size: 13px;
    }
  `,
})
export class ListPicker {
  readonly store = inject(ListsStore);
  private router = inject(Router);
  /** Rota base (`/ordem` ou `/configuracoes`). */
  readonly base = input.required<string>();
  readonly current = input<string | null>(null);
  readonly mode = signal<'idle' | 'create' | 'rename'>('idle');
  readonly name = signal('');
  readonly busy = signal(false);
  readonly error = signal('');

  go(id: string) {
    if (id && id !== this.current()) void this.router.navigate([this.base(), id]);
  }
  start(mode: 'create' | 'rename') {
    this.error.set('');
    this.name.set(
      mode === 'rename'
        ? (this.store.lists().find((l) => l.id === this.current())?.name ?? '')
        : '',
    );
    this.mode.set(mode);
  }
  cancel() {
    this.mode.set('idle');
    this.error.set('');
  }
  async submit() {
    const name = this.name().trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.mode() === 'create') this.go((await this.store.create(name)).id);
      else await this.store.rename(this.current()!, name);
      this.mode.set('idle');
    } catch (e) {
      this.error.set(message(e, 'Não foi possível salvar a lista.'));
    } finally {
      this.busy.set(false);
    }
  }
  async remove() {
    const list = this.store.lists().find((l) => l.id === this.current());
    if (
      !list ||
      !confirm(`Apagar a lista "${list.name}"? A ordem manual e as regras dela serão perdidas.`)
    )
      return;
    this.error.set('');
    try {
      await this.store.remove(list.id);
      const next = this.store.lists()[0];
      if (next) void this.router.navigate([this.base(), next.id], { replaceUrl: true });
    } catch (e) {
      this.error.set(message(e, 'Não foi possível apagar a lista.'));
    }
  }
}
