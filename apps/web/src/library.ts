import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, color } from './api';
import { ImmediateButton } from './immediate';
import { PlayingButton } from './playing';
import type { Catalog, Desire, GamePage } from '../../../packages/core/src/models';
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, ImmediateButton, PlayingButton],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">TUDO O QUE VOCÊ QUER JOGAR</span>
        <h1>Lista de jogos<span class="heading-dot">.</span></h1>
        <p>Sua coleção inteira. A próxima história começa aqui.</p>
      </div>
      <a class="button primary" routerLink="/ordem">Ver ordem recomendada <span>↗</span></a>
    </div>
    @if (catalog()) {
      <div class="stats">
        <div>
          <small>NA BIBLIOTECA</small
          ><strong>{{ catalog()!.counts.total }} <span>jogos</span></strong>
        </div>
        <div>
          <small>EM ANDAMENTO</small
          ><strong>{{ catalog()!.counts.playing }} <span>jogando</span></strong>
        </div>
        <div>
          <small>CONCLUÍDOS</small
          ><strong>{{ catalog()!.counts.completed }} <span>finalizados</span></strong>
        </div>
      </div>
    }
    <section class="filters">
      <label class="search"
        ><span aria-hidden="true">⌕</span
        ><input
          type="search"
          aria-label="Buscar jogo"
          placeholder="Buscar um jogo ou subgênero…"
          [(ngModel)]="q"
          (ngModelChange)="search()" /></label
      ><select aria-label="Filtrar status" [(ngModel)]="status" (ngModelChange)="reset()">
        <option value="">Status: todos</option>
        @for (s of catalog()?.statuses ?? []; track s) {
          <option>{{ s }}</option>
        }</select
      ><select aria-label="Filtrar gênero" [(ngModel)]="genre" (ngModelChange)="reset()">
        <option value="">Gênero: todos</option>
        @for (g of catalog()?.genres ?? []; track g) {
          <option>{{ g }}</option>
        }</select
      ><select aria-label="Filtrar loja" [(ngModel)]="store" (ngModelChange)="reset()">
        <option value="">Loja: todas</option>
        @for (s of catalog()?.stores ?? []; track s) {
          <option>{{ s }}</option>
        }
      </select>
    </section>
    <div class="list-toolbar">
      <span
        >{{ data()?.total ?? 0 }} jogos encontrados
        @if (loading()) {
          <span class="muted"> · carregando</span>
        }</span
      ><label
        >Ordenar
        <select aria-label="Ordenação" [(ngModel)]="sort" (ngModelChange)="reset()">
          <option value="name">Nome (A-Z)</option>
          <option value="score">Pontuação</option>
          <option value="desire">Vontade de jogar</option>
        </select></label
      >
    </div>
    @if (error()) {
      <div class="error" role="alert">
        {{ error() }} <button (click)="load()">Tentar novamente</button>
      </div>
    }
    <div class="game-grid">
      @for (g of data()?.items ?? []; track g.id) {
        <article class="game-card">
          <a class="card-link" [routerLink]="['/jogos', g.id]"
            ><div class="cover" [attr.data-genre]="g.primaryGenre">
              @if (g.coverUrl) {
                <img
                  [src]="g.coverUrl"
                  alt=""
                  loading="lazy"
                  (error)="$any($event.target).style.display = 'none'"
                />
              }
              <span class="cover-fallback">{{ g.name.slice(0, 1) }}</span
              ><span [class]="'badge cover-status ' + color(g.status)">{{ g.status }}</span>
            </div>
            <div class="card-body">
              <div class="card-store">
                {{ g.store || g.platform || 'Minha biblioteca' }}
              </div>
              <h2>{{ g.name }}</h2>
              <div class="tags">
                <span [class]="'badge ' + color(g.primaryGenre)">{{ g.primaryGenre }}</span>
                @for (t of g.secondaryTags.slice(0, 2); track t) {
                  <span [class]="'badge ' + color(t)">{{ t }}</span>
                }
              </div>
              <div class="card-bottom">
                <span>{{
                  g.plannedHours === null ? 'Tempo a confirmar' : g.plannedHours + ' h estimadas'
                }}</span
                ><span [class]="'badge ' + color(g.desire)">{{ g.desire }}</span>
              </div>
            </div></a
          >
          @if (g.status !== 'Finalizado' && g.status !== 'Desejado') {
            <app-playing [game]="g" />
            <app-immediate
              class="card-immediate"
              [game]="g"
              (changed)="setDesire(g.id, $event)"
              (failed)="error.set($event)"
            />
          }
        </article>
      }
    </div>
    @if (data()?.total === 0 && !loading()) {
      <div class="empty">
        <h2>Nenhum jogo por aqui</h2>
        <p>Tente outro nome ou remova um filtro.</p>
      </div>
    }
    <div class="pagination">
      <button class="button" (click)="previous()" [disabled]="page === 1 || loading()">
        ← Anterior</button
      ><span>Página {{ page }} de {{ pages() }}</span
      ><button class="button" (click)="next()" [disabled]="page >= pages() || loading()">
        Próxima →
      </button>
    </div>`,
})
export class Library {
  api = inject(Api);
  private destroyRef = inject(DestroyRef);
  color = color;
  catalog = signal<Catalog | null>(null);
  data = signal<GamePage | null>(null);
  loading = signal(false);
  error = signal('');
  q = '';
  status = '';
  genre = '';
  store = '';
  sort = 'name';
  page = 1;
  request = 0;
  timer: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    const seen = new WeakSet<object>();
    effect(() => {
      const events = this.api.playingEvents();
      untracked(() => {
        for (const event of events.values()) {
          if (seen.has(event)) continue;
          seen.add(event);
          const previous = this.data()?.items.find((game) => game.id === event.game.id);
          if (previous) {
            this.data.update(
              (data) =>
                data && {
                  ...data,
                  items: data.items.map((game) =>
                    game.id === event.game.id
                      ? {
                          ...game,
                          status: event.game.status,
                          startedAt: event.game.startedAt,
                          finishedAt: event.game.finishedAt,
                        }
                      : game,
                  ),
                },
            );
            const delta =
              Number(event.game.status === 'Jogando') - Number(previous.status === 'Jogando');
            this.catalog.update(
              (catalog) =>
                catalog && {
                  ...catalog,
                  counts: {
                    ...catalog.counts,
                    playing: catalog.counts.playing + delta,
                    pending:
                      catalog.counts.pending +
                      Number(event.game.status === 'Não iniciado') -
                      Number(previous.status === 'Não iniciado'),
                  },
                },
            );
          }
          if (event.phase === 'failed') {
            const message = `Não foi possível mudar o status de ${event.game.name}.`;
            this.error.set(message);
            if (!this.api.pendingPlaying)
              void this.playingSaved().finally(() => {
                if (!this.destroyRef.destroyed) this.error.set(message);
              });
          }
          if (event.phase === 'saved' && !this.api.pendingPlaying) void this.playingSaved();
        }
      });
    });
    this.api.catalog((c) => this.catalog.set(c)).catch(() => {});
    this.load();
  }
  pages() {
    return Math.max(1, Math.ceil((this.data()?.total ?? 0) / 24));
  }
  search() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reset(), 250);
  }
  reset() {
    this.page = 1;
    this.load();
  }
  previous() {
    this.page--;
    this.load();
  }
  next() {
    this.page++;
    this.load();
  }
  /** Atualização otimista da vontade no card (o botão já chamou a API). */
  setDesire(id: string, desire: Desire) {
    this.data.update(
      (d) => d && { ...d, items: d.items.map((g) => (g.id === id ? { ...g, desire } : g)) },
    );
  }
  async load(skipCache = false) {
    const id = ++this.request;
    const playingEvents = this.api.playingEvents();
    this.error.set('');
    // Cache mostra na hora; o indicador só aparece quando não há nada para mostrar.
    let shown = false;
    this.loading.set(true);
    try {
      await this.api.list(
        {
          q: this.q,
          status: this.status,
          primaryGenre: this.genre,
          store: this.store,
          sort: this.sort,
          page: this.page,
          pageSize: 24,
        },
        (d, fromCache) => {
          if (skipCache && fromCache) return;
          if (
            id !== this.request ||
            this.destroyRef.destroyed ||
            this.api.pendingPlaying ||
            playingEvents !== this.api.playingEvents()
          )
            return;
          this.data.set(d);
          if (!shown) this.loading.set(false);
          shown = true;
        },
        skipCache,
      );
    } catch {
      if (id === this.request)
        this.error.set('Não foi possível carregar a biblioteca. Confira se a API está rodando.');
    } finally {
      if (id === this.request) this.loading.set(false);
    }
  }
  async playingSaved() {
    await Promise.all([
      this.load(true),
      this.api.catalog((c, fromCache) => {
        if (!fromCache && !this.api.pendingPlaying) this.catalog.set(c);
      }, true),
    ]);
  }
}
