import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  inject,
  signal,
} from '@angular/core';
import { Api } from './api';
import type { ScoredGame } from '../../../packages/core/src/models';

@Component({
  selector: 'prerequisite-search',
  standalone: true,
  template: `
    <label for="prerequisite-query">Predecessor</label>
    @if (selected(); as game) {
      <div class="selected-game">
        <span class="cover">
          @if (game.coverUrl) {
            <img [src]="game.coverUrl" alt="" (error)="$any($event.target).hidden = true" />
          }
          <span>{{ game.name.slice(0, 1) }}</span></span
        >
        <span class="game-name" [title]="game.name">{{ game.name }}</span>
        <button type="button" (click)="clear()" aria-label="Remover predecessor">×</button>
      </div>
    } @else if (value) {
      <div class="selected-game">
        <span class="game-name">{{
          selectionError() ? 'Predecessor indisponível' : 'Carregando predecessor…'
        }}</span
        ><button type="button" (click)="clear()" aria-label="Remover predecessor">×</button>
      </div>
    }
    <input
      id="prerequisite-query"
      type="search"
      [value]="query()"
      (input)="search($any($event.target).value)"
      placeholder="Buscar jogo pelo nome"
      autocomplete="off"
      aria-describedby="prerequisite-help"
    />
    <small id="prerequisite-help">Opcional. Digite pelo menos 3 caracteres.</small>
    <div role="status" class="search-status">
      @if (loading()) {
        Buscando jogos…
      } @else if (error()) {
        {{ error() }}
      } @else if (searched() && !results().length) {
        Nenhum jogo encontrado.
      }
    </div>
    @if (results().length) {
      <ul aria-label="Jogos encontrados">
        @for (game of results(); track game.id) {
          <li>
            <button type="button" (click)="choose(game)">
              <span class="cover">
                @if (game.coverUrl) {
                  <img [src]="game.coverUrl" alt="" (error)="$any($event.target).hidden = true" />
                }
                <span>{{ game.name.slice(0, 1) }}</span></span
              >
              <span class="game-name" [title]="game.name">{{ game.name }}</span>
            </button>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      margin-top: 17px;
    }
    label {
      display: block;
      font-size: 11px;
      font-weight: 600;
    }
    input {
      width: 100%;
      min-height: 46px;
      margin-top: 8px;
      padding: 11px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--surface);
      color: var(--text);
      font-size: 16px;
    }
    small,
    .search-status {
      display: block;
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
    }
    ul {
      list-style: none;
      padding: 4px;
      margin: 8px 0 0;
      max-height: 270px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
    }
    li button,
    .selected-game {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-width: 0;
      min-height: 50px;
      padding: 6px;
      background: transparent;
      color: var(--text);
      border: 0;
      border-radius: 6px;
      text-align: left;
    }
    li button:hover {
      background: var(--surface-2);
    }
    .selected-game {
      margin-top: 8px;
      background: var(--surface-2);
    }
    .selected-game button {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      font-size: 24px;
      color: var(--text);
      border: 0;
      background: transparent;
    }
    .game-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 14px;
    }
    .cover {
      display: grid;
      place-items: center;
      position: relative;
      width: 54px;
      height: 36px;
      flex-shrink: 0;
      overflow: hidden;
      border-radius: 5px;
      background: var(--cover-a);
      color: var(--cover-ink);
    }
    .cover img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 1;
    }
    @media (max-width: 600px) {
      label {
        font-size: 13px;
      }
    }
  `,
})
export class PrerequisiteSearch implements OnChanges, OnDestroy {
  private api = inject(Api);
  @Input() value: string | null = null;
  @Input() excludeId = '';
  @Output() valueChange = new EventEmitter<string | null>();
  selected = signal<ScoredGame | null>(null);
  selectionError = signal(false);
  query = signal('');
  results = signal<ScoredGame[]>([]);
  loading = signal(false);
  searched = signal(false);
  error = signal('');
  private timer?: ReturnType<typeof setTimeout>;
  private searchVersion = 0;
  private selectionVersion = 0;
  ngOnChanges() {
    const version = ++this.selectionVersion;
    if (!this.value) {
      this.selected.set(null);
      return;
    }
    if (this.selected()?.id === this.value) return;
    this.selected.set(null);
    this.selectionError.set(false);
    this.api
      .game(this.value, (game) => {
        if (version === this.selectionVersion) this.selected.set(game);
      })
      .catch(() => {
        if (version === this.selectionVersion) this.selectionError.set(true);
      });
  }
  search(value: string) {
    this.query.set(value);
    clearTimeout(this.timer);
    const version = ++this.searchVersion;
    this.results.set([]);
    this.searched.set(false);
    this.error.set('');
    this.loading.set(false);
    const query = value.trim();
    if (query.length < 3) return;
    this.loading.set(true);
    this.timer = setTimeout(async () => {
      try {
        const games = await this.api.searchGames(query, this.excludeId);
        if (version === this.searchVersion)
          this.results.set(games.filter((game) => game.id !== this.excludeId));
        if (version === this.searchVersion) this.searched.set(true);
      } catch {
        if (version === this.searchVersion)
          this.error.set('Não foi possível buscar. Tente novamente.');
      } finally {
        if (version === this.searchVersion) this.loading.set(false);
      }
    }, 300);
  }
  choose(game: ScoredGame) {
    this.selected.set(game);
    this.valueChange.emit(game.id);
    this.search('');
  }
  clear() {
    this.selectionVersion++;
    this.selected.set(null);
    this.valueChange.emit(null);
    this.search('');
  }
  ngOnDestroy() {
    clearTimeout(this.timer);
    this.searchVersion++;
    this.selectionVersion++;
  }
}
