import {
  Component,
  ElementRef,
  Injectable,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import type { GameList } from '../../../packages/core/src/models';
import { AuthService } from './auth/auth.service';
import { DataCache, keys } from './data-cache';
const URL = '/api/v1/lists';

/** Listas do usuário (todas com todos os jogos; regras e ordem manual são por lista). */
@Injectable({ providedIn: 'root' })
export class ListsStore {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private cache = inject(DataCache);
  readonly lists = signal<GameList[]>([]);
  /** Última lista aberta (para quando a URL não traz uma). */
  lastId: string | null = null;
  private loaded: Promise<GameList[]> | null = null;
  private owner: string | undefined;

  /**
   * Uma vez por usuário logado (a API cria a lista "Principal" se não houver nenhuma).
   * Com cache, resolve na hora e revalida em segundo plano.
   */
  ensure(): Promise<GameList[]> {
    const user = this.auth.user()?.id;
    if (user !== this.owner) {
      this.owner = user;
      this.loaded = null;
      this.lastId = null;
    }
    this.loaded ??= new Promise<GameList[]>((resolve, reject) => {
      let done = false;
      this.cache
        .swr(
          keys.lists,
          () => this.request(),
          (lists) => {
            this.lists.set(lists);
            if (!done && lists.length) {
              done = true;
              resolve(lists);
            }
          },
        )
        .then((lists) => !done && resolve(lists))
        .catch((e) => {
          this.loaded = null;
          if (!done) reject(e);
        });
    });
    return this.loaded;
  }
  async reload(): Promise<GameList[]> {
    const lists = await this.request();
    this.store(lists);
    return lists;
  }
  async create(name: string): Promise<GameList> {
    const list = await firstValueFrom(this.http.post<GameList>(URL, { name }));
    this.store([...this.lists(), list]);
    return list;
  }
  async rename(id: string, name: string): Promise<GameList> {
    const list = await firstValueFrom(
      this.http.patch<GameList>(URL + '/' + encodeURIComponent(id), { name }),
    );
    this.store(this.lists().map((l) => (l.id === id ? list : l)));
    return list;
  }
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(URL + '/' + encodeURIComponent(id)));
    this.store(this.lists().filter((l) => l.id !== id));
    this.cache.drop(keys.settings(id), keys.queue(id));
  }
  private request() {
    return firstValueFrom(this.http.get<GameList[]>(URL));
  }
  private store(lists: GameList[]) {
    this.lists.set(lists);
    this.cache.set(keys.lists, lists);
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

/** Selects the active list and manages list names and actions. */
@Component({
  selector: 'app-list-picker',
  standalone: true,
  host: {
    '(document:pointerdown)': 'onOutsidePointer($event)',
    '(keydown)': 'onKeydown($event)',
    '(focusout)': 'onFocusOut()',
    '(click)': 'onActionClick($event)',
  },
  template: `<div class="list-picker">
    <div class="list-controls">
      @if (mode() === 'idle') {
        <div class="list-select">
          <button
            type="button"
            class="list-trigger"
            aria-label="Lista atual"
            aria-haspopup="menu"
            [attr.aria-expanded]="openMenu() === 'lists'"
            (click)="toggleMenu('lists')"
            data-menu-trigger="lists"
          >
            <span>{{ currentName() }}</span
            ><span aria-hidden="true">⌄</span>
          </button>
          @if (openMenu() === 'lists') {
            <div class="list-popup" role="menu" aria-label="Listas" data-menu="lists">
              @for (list of store.lists(); track list.id) {
                <div class="list-option" role="group" [attr.aria-label]="list.name">
                  <button
                    type="button"
                    class="list-option-name"
                    role="menuitemradio"
                    [attr.aria-checked]="list.id === current()"
                    tabindex="-1"
                    (click)="go(list.id); closeMenu(true)"
                  >
                    <span>{{ list.name }}</span
                    ><span aria-hidden="true">{{ list.id === current() ? '✓' : '' }}</span>
                  </button>
                  <button
                    type="button"
                    class="icon-button rename-button"
                    role="menuitem"
                    tabindex="-1"
                    [attr.aria-label]="'Renomear ' + list.name"
                    [title]="'Renomear ' + list.name"
                    (click)="start('rename', list.id)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      aria-hidden="true"
                    >
                      <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" />
                    </svg>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <form class="list-form" (submit)="$event.preventDefault(); submit()">
          <input
            [value]="name()"
            (input)="name.set($any($event.target).value)"
            maxlength="60"
            required
            [attr.aria-label]="
              mode() === 'create' ? 'Nome da nova lista' : 'Novo nome de ' + editingName()
            "
            [placeholder]="mode() === 'create' ? 'Nome da nova lista' : 'Novo nome da lista'"
            [disabled]="busy()"
          />
          <button
            type="submit"
            class="button icon-button primary"
            [disabled]="busy() || !name().trim()"
            [attr.aria-label]="mode() === 'create' ? 'Criar lista' : 'Salvar nome'"
            [title]="mode() === 'create' ? 'Criar lista' : 'Salvar nome'"
          >
            <span aria-hidden="true">✓</span>
          </button>
          <button
            type="button"
            class="button icon-button"
            (click)="cancel()"
            [disabled]="busy()"
            aria-label="Cancelar edição"
            title="Cancelar edição"
          >
            <span aria-hidden="true">×</span>
          </button>
        </form>
      }
      <div class="list-actions">
        <button
          type="button"
          class="button icon-button"
          aria-label="Ações da lista"
          title="Ações da lista"
          aria-haspopup="menu"
          [attr.aria-expanded]="openMenu() === 'actions'"
          data-menu-trigger="actions"
          [disabled]="mode() !== 'idle' || busy()"
          (click)="toggleMenu('actions')"
        >
          <span aria-hidden="true">⋯</span>
        </button>
        <div
          class="list-popup action-popup"
          role="menu"
          aria-label="Ações da lista"
          data-menu="actions"
          [hidden]="openMenu() !== 'actions'"
        >
          <button type="button" role="menuitem" tabindex="-1" (click)="start('create')">
            Adicionar lista
          </button>
          <button
            type="button"
            class="danger"
            role="menuitem"
            tabindex="-1"
            (click)="closeMenu(true); remove()"
            [disabled]="!current() || store.lists().length < 2"
            [title]="store.lists().length < 2 ? 'Você precisa de ao menos uma lista' : ''"
          >
            Remover lista
          </button>
          <ng-content />
        </div>
      </div>
    </div>
    @if (error()) {
      <span class="list-error" role="alert">{{ error() }}</span>
    }
  </div>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .list-picker {
      margin: 0 0 14px;
    }
    .list-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
    }
    .list-select,
    .list-form {
      flex: 1 1 0;
      min-width: 0;
    }
    .list-select,
    .list-actions {
      position: relative;
    }
    .list-actions {
      flex: 0 0 44px;
    }
    .list-trigger,
    .list-form input {
      min-width: 0;
      height: 44px;
      padding: 8px 12px;
      font: inherit;
      font-size: 16px;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .list-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      font-weight: 600;
      cursor: pointer;
    }
    .list-trigger > span:first-child,
    .list-option-name > span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .list-popup {
      position: absolute;
      z-index: 30;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      max-height: min(360px, 60vh);
      overflow-y: auto;
      padding: 6px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgb(0 0 0 / 0.18);
    }
    .list-popup[hidden] {
      display: none;
    }
    .action-popup {
      left: auto;
      width: min(240px, calc(100vw - 32px));
    }
    .list-option {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .list-option-name,
    .action-popup > button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 44px;
      min-width: 0;
      padding: 8px 12px;
      text-align: left;
      font: inherit;
      color: var(--text);
      background: none;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
    }
    .list-option-name {
      flex: 1;
    }
    .action-popup > button {
      width: 100%;
    }
    .list-option-name[aria-checked='true'] {
      color: var(--accent);
      font-weight: 600;
    }
    .list-option-name:hover,
    .action-popup > button:hover:not(:disabled) {
      background: var(--surface-2);
    }
    .rename-button {
      flex: 0 0 44px;
    }
    .action-popup .danger {
      color: var(--danger);
    }
    .list-form {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .list-form input {
      flex: 1 1 0;
      width: 0;
    }
    .list-form .icon-button {
      flex: 0 0 44px;
    }
    .list-error {
      display: block;
      margin-top: 8px;
      color: var(--danger);
      font-size: 13px;
    }
  `,
})
export class ListPicker {
  readonly store = inject(ListsStore);
  private router = inject(Router);
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly base = input.required<string>();
  readonly current = input<string | null>(null);
  readonly mode = signal<'idle' | 'create' | 'rename'>('idle');
  readonly openMenu = signal<'lists' | 'actions' | null>(null);
  readonly name = signal('');
  readonly editingId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly currentName = computed(
    () => this.store.lists().find((list) => list.id === this.current())?.name ?? 'Selecionar lista',
  );
  readonly editingName = computed(
    () => this.store.lists().find((list) => list.id === this.editingId())?.name ?? 'lista',
  );

  go(id: string) {
    if (id && id !== this.current()) void this.router.navigate([this.base(), id]);
  }
  toggleMenu(menu: 'lists' | 'actions') {
    if (this.openMenu() === menu) {
      this.closeMenu(true);
      return;
    }
    this.openMenu.set(menu);
    this.focusAfterRender(() => this.menuItems()[0]);
  }
  closeMenu(restoreFocus = false) {
    const menu = this.openMenu();
    this.openMenu.set(null);
    if (restoreFocus && menu)
      this.host.querySelector<HTMLElement>(`[data-menu-trigger="${menu}"]`)?.focus();
  }
  onOutsidePointer(event: PointerEvent) {
    if (!this.host.contains(event.target as Node)) this.closeMenu();
  }
  onFocusOut() {
    queueMicrotask(() => {
      if (!this.host.contains(document.activeElement)) this.closeMenu();
    });
  }
  onActionClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('[data-menu="actions"]')) return;
    const button = target.closest('button');
    if (button && !button.disabled) this.closeMenu(this.mode() === 'idle');
  }
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.openMenu()) {
        event.preventDefault();
        event.stopPropagation();
        this.closeMenu(true);
      } else if (this.mode() !== 'idle' && !this.busy()) {
        event.preventDefault();
        this.cancel();
      }
      return;
    }
    const target = event.target as HTMLElement;
    if (!this.openMenu()) {
      const menu = target.dataset['menuTrigger'];
      if (
        (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        (menu === 'lists' || menu === 'actions')
      ) {
        event.preventDefault();
        this.toggleMenu(menu);
        if (event.key === 'ArrowUp') this.focusAfterRender(() => this.menuItems().at(-1));
      }
      return;
    }
    const items = this.menuItems();
    if (!items.length) return;
    const index = items.findIndex((item) => item === target);
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'Tab') {
      this.closeMenu(true);
      return;
    } else return;
    event.preventDefault();
    items[next].focus();
  }
  private menuItems() {
    return Array.from(
      this.host.querySelectorAll<HTMLButtonElement>(
        `[data-menu="${this.openMenu()}"] button:not(:disabled)`,
      ),
    );
  }
  private focusAfterRender(target: () => HTMLElement | null | undefined) {
    setTimeout(() => target()?.focus(), 0);
  }
  start(mode: 'create' | 'rename', id: string | null = this.current()) {
    this.closeMenu();
    this.error.set('');
    this.editingId.set(mode === 'rename' ? id : null);
    this.name.set(mode === 'rename' ? this.editingName() : '');
    this.mode.set(mode);
    this.focusAfterRender(() => this.host.querySelector<HTMLInputElement>('input'));
  }
  cancel() {
    this.mode.set('idle');
    this.error.set('');
    this.focusAfterRender(() =>
      this.host.querySelector<HTMLElement>('[data-menu-trigger="lists"]'),
    );
  }
  async submit() {
    const name = this.name().trim();
    if (!name || this.busy() || this.mode() === 'idle') return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.mode() === 'create') this.go((await this.store.create(name)).id);
      else if (this.editingId()) await this.store.rename(this.editingId()!, name);
      this.mode.set('idle');
      this.focusAfterRender(() =>
        this.host.querySelector<HTMLElement>('[data-menu-trigger="lists"]'),
      );
    } catch (e) {
      this.error.set(message(e, 'Não foi possível salvar a lista.'));
    } finally {
      this.busy.set(false);
    }
  }
  async remove() {
    const list = this.store.lists().find((list) => list.id === this.current());
    if (
      !list ||
      this.busy() ||
      this.store.lists().length < 2 ||
      !confirm(`Apagar a lista "${list.name}"? A ordem manual e as regras dela serão perdidas.`)
    )
      return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.store.remove(list.id);
      const next = this.store.lists()[0];
      if (next) void this.router.navigate([this.base(), next.id], { replaceUrl: true });
    } catch (e) {
      this.error.set(message(e, 'Não foi possível apagar a lista.'));
    } finally {
      this.busy.set(false);
    }
  }
}
