import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Api, color } from './api';
import { WishlistApi, formatPrice } from './wishlist-api';
import type {
  Desire,
  SteamPrice,
  SteamSearchItem,
  WishlistItem,
} from '../../../packages/core/src/models';

const message = (e: unknown, fallback: string) =>
  (e instanceof HttpErrorResponse && e.error?.error?.message) || fallback;

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">O QUE VEM DEPOIS</span>
        <h1>Lista de desejos<span class="heading-dot">.</span></h1>
        <p>Jogos que você ainda não tem, com o preço atual da Steam.</p>
      </div>
      <button class="button" (click)="refresh()" [disabled]="busy()">
        Atualizar preços <span>↻</span>
      </button>
    </div>

    <section class="filters add">
      <label class="search"
        ><span>⌕</span
        ><input
          aria-label="Buscar na Steam"
          placeholder="Buscar na Steam pelo nome…"
          [(ngModel)]="q"
          (ngModelChange)="typed()"
          autocomplete="off"
      /></label>
      <select aria-label="Vontade de jogar" [(ngModel)]="desire">
        @for (d of desires; track d) {
          <option>{{ d }}</option>
        }
      </select>
      @if (results().length) {
        <ul class="results" role="listbox">
          @for (r of results(); track r.appId) {
            <li>
              <button type="button" (click)="add(r)" [disabled]="busy()">
                @if (r.imageUrl) {
                  <img [src]="r.imageUrl" alt="" />
                }
                <span class="name">{{ r.name }}</span>
                <span class="muted">{{ price(r.price) }}</span>
                <span class="plus">+ Adicionar</span>
              </button>
            </li>
          }
        </ul>
      } @else if (searching()) {
        <p class="muted">Buscando…</p>
      }
      <details>
        <summary>Cadastrar sem a Steam</summary>
        <form class="manual" (ngSubmit)="addManual()">
          <input
            aria-label="Nome"
            placeholder="Nome do jogo"
            name="name"
            [(ngModel)]="manual.name"
            required
          />
          <select aria-label="Gênero" name="genre" [(ngModel)]="manual.primaryGenre">
            <option value="">Sem gênero</option>
            @for (genre of genres(); track genre) {
              <option [value]="genre">{{ genre }}</option>
            }
          </select>
          <input
            aria-label="Horas"
            type="number"
            min="0"
            placeholder="Horas (campanha)"
            name="hours"
            [(ngModel)]="manual.mainHours"
          />
          <button class="button" [disabled]="busy() || !manual.name.trim()">Cadastrar</button>
        </form>
      </details>
      <details>
        <summary>Importar minha lista de desejos da Steam</summary>
        <div class="manual">
          <input
            aria-label="Perfil da Steam"
            placeholder="SteamID64 ou URL do perfil (vazio = perfil configurado)"
            [(ngModel)]="profile"
          />
          <button class="button primary" (click)="importSteam()" [disabled]="busy()">
            Importar
          </button>
        </div>
        <p class="muted">
          A lista precisa estar pública (Steam › Privacidade › Detalhes dos jogos: Público).
        </p>
      </details>
    </section>

    @if (notice()) {
      <div class="notice" role="status">{{ notice() }}</div>
    }
    @if (error()) {
      <div class="error" role="alert">{{ error() }}</div>
    }

    <div class="list-toolbar">
      <span
        >{{ items().length }} desejados
        @if (onSale()) {
          <span class="muted"> · {{ onSale() }} em promoção</span>
        }
        @if (loading()) {
          <span class="muted"> · carregando</span>
        }</span
      ><label
        >Ordenar
        <select aria-label="Ordenação" [(ngModel)]="sort">
          <option value="name">Nome A–Z</option>
          <option value="discount">Maior desconto</option>
          <option value="price">Menor preço</option>
        </select></label
      >
    </div>
    <div class="game-grid">
      @for (i of sorted(); track i.game.id) {
        <a class="game-card" [routerLink]="['/jogos', i.game.id]"
          ><div class="cover" [attr.data-genre]="i.game.primaryGenre">
            @if (i.game.coverUrl) {
              <img
                [src]="i.game.coverUrl"
                alt=""
                loading="lazy"
                (error)="$any($event.target).style.display = 'none'"
              />
            }
            <span class="cover-fallback">{{ i.game.name.slice(0, 1) }}</span>
            @if (i.price?.discountPercent) {
              <span class="badge cover-status green">-{{ i.price!.discountPercent }}%</span>
            }
          </div>
          <div class="card-body">
            <div class="card-store">{{ i.game.store || 'Sem loja' }}</div>
            <h2>{{ i.game.name }}</h2>
            @if (i.description) {
              <p class="description">{{ i.description }}</p>
            }
            <div class="tags">
              @if (i.game.primaryGenre) {
                <span [class]="'badge ' + color(i.game.primaryGenre)">{{
                  i.game.primaryGenre
                }}</span>
              }
              @for (t of i.game.secondaryTags.slice(0, 2); track t) {
                <span [class]="'badge ' + color(t)">{{ t }}</span>
              }
            </div>
            <div class="card-bottom">
              <span class="price">
                @if (i.price?.discountPercent && i.price.initialCents) {
                  <s>{{ original(i.price) }}</s>
                }
                <strong>{{ price(i.price) }}</strong>
              </span>
              <span [class]="'badge ' + color(i.game.desire)">{{ i.game.desire }}</span>
            </div>
          </div></a
        >
      }
    </div>
    @if (!items().length && !loading()) {
      <div class="empty">
        <h2>Nenhum desejo ainda</h2>
        <p>Busque um jogo na Steam ou importe sua lista de desejos.</p>
      </div>
    }`,
  styles: `
    .add {
      position: relative;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      margin-bottom: 18px;
    }
    .add details,
    .add .results,
    .add > p {
      grid-column: 1 / -1;
    }
    .results {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 4px;
    }
    .results button {
      width: 100%;
      display: grid;
      grid-template-columns: 92px 1fr auto auto;
      align-items: center;
      gap: 12px;
      padding: 6px 10px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .results button:hover {
      border-color: currentColor;
    }
    .results img {
      width: 92px;
      height: 35px;
      object-fit: cover;
      border-radius: 4px;
    }
    .plus {
      font-weight: 600;
    }
    summary {
      cursor: pointer;
      font-size: 13px;
    }
    .manual {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .manual input {
      flex: 1 1 160px;
      min-height: 44px;
      font-size: 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 9px 10px;
      background: var(--surface);
    }
    .description {
      font-size: 12px;
      margin: 4px 0 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .price s {
      opacity: 0.6;
      margin-right: 6px;
      font-size: 12px;
    }
    .notice {
      margin-bottom: 12px;
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 13px;
    }
    @media (max-width: 640px) {
      .add {
        grid-template-columns: 1fr;
      }
      .results button {
        grid-template-columns: 1fr auto;
      }
      .results img,
      .results .plus {
        display: none;
      }
    }
  `,
})
export class Wishlist {
  private api = inject(WishlistApi);
  private gamesApi = inject(Api);
  genres = signal<string[]>([]);
  color = color;
  price = formatPrice;
  original = (p: SteamPrice) => formatPrice({ ...p, finalCents: p.initialCents });
  desires: Desire[] = ['Muito Alta', 'Alta', 'Média', 'Baixa', 'Muito Baixa'];
  items = signal<WishlistItem[]>([]);
  results = signal<SteamSearchItem[]>([]);
  loading = signal(false);
  searching = signal(false);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  q = '';
  desire: Desire = 'Média';
  profile = '';
  sort = 'name';
  manual = { name: '', primaryGenre: '', mainHours: null as number | null };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request = 0;
  onSale = computed(() => this.items().filter((i) => i.price?.discountPercent).length);

  constructor() {
    this.load();
    this.gamesApi
      .catalog()
      .then((catalog) => this.genres.set(catalog.genres))
      .catch(() => {});
  }

  sorted() {
    const items = [...this.items()];
    const cents = (i: WishlistItem) => i.price?.finalCents ?? Number.MAX_SAFE_INTEGER;
    if (this.sort === 'discount')
      items.sort((a, b) => (b.price?.discountPercent ?? 0) - (a.price?.discountPercent ?? 0));
    else if (this.sort === 'price') items.sort((a, b) => cents(a) - cents(b));
    return items;
  }

  async load(force = false) {
    this.loading.set(true);
    try {
      await this.api.list((items) => {
        this.items.set(items);
        this.loading.set(false);
      }, force);
    } catch (e) {
      this.error.set(message(e, 'Não foi possível carregar a lista de desejos.'));
    } finally {
      this.loading.set(false);
    }
  }

  typed() {
    clearTimeout(this.timer);
    const q = this.q.trim();
    if (q.length < 2) {
      this.results.set([]);
      return;
    }
    this.timer = setTimeout(async () => {
      const id = ++this.request;
      this.searching.set(true);
      try {
        const r = await this.api.search(q);
        if (id === this.request) this.results.set(r.slice(0, 8));
      } catch (e) {
        if (id === this.request) this.error.set(message(e, 'Busca na Steam indisponível.'));
      } finally {
        if (id === this.request) this.searching.set(false);
      }
    }, 300);
  }

  private async run(action: () => Promise<string>) {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      this.notice.set(await action());
    } catch (e) {
      this.error.set(message(e, 'Algo deu errado. Tente de novo.'));
    } finally {
      this.busy.set(false);
    }
  }

  add(r: SteamSearchItem) {
    return this.run(async () => {
      const res = await this.api.add({ appId: r.appId, desire: this.desire });
      this.q = '';
      this.results.set([]);
      await this.load();
      return res.created
        ? `${res.game.name} entrou na lista de desejos.`
        : `${res.game.name} já está no app (${res.game.status}).`;
    });
  }

  addManual() {
    return this.run(async () => {
      const body: Record<string, unknown> = { name: this.manual.name, desire: this.desire };
      if (this.manual.primaryGenre.trim()) body['primaryGenre'] = this.manual.primaryGenre;
      if (this.manual.mainHours !== null) body['mainHours'] = Number(this.manual.mainHours);
      const res = await this.api.add(body);
      this.manual = { name: '', primaryGenre: '', mainHours: null };
      await this.load();
      return res.created ? `${res.game.name} cadastrado.` : `${res.game.name} já está no app.`;
    });
  }

  importSteam() {
    return this.run(async () => {
      const r = await this.api.importSteam(this.profile);
      await this.load();
      const failed = r.failed.length ? `, ${r.failed.length} fora da loja` : '';
      return `Lista da Steam: ${r.total} itens, ${r.created} novos, ${r.existing} já estavam no app${failed}.`;
    });
  }

  refresh() {
    return this.run(async () => {
      this.items.set(await this.api.refreshPrices());
      return 'Preços atualizados.';
    });
  }
}
