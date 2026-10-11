import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, color } from './api';
import type { Catalog, GamePage } from '../../shared/models';
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
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
          <small>HISTÓRIAS CONCLUÍDAS</small
          ><strong>{{ catalog()!.counts.completed }} <span>finalizados</span></strong>
        </div>
      </div>
    }
    <section class="filters">
      <label class="search"
        ><span>⌕</span
        ><input
          aria-label="Buscar jogo"
          placeholder="Buscar um jogo ou subgênero…"
          [(ngModel)]="q"
          (ngModelChange)="search()" /></label
      ><select aria-label="Filtrar status" [(ngModel)]="status" (ngModelChange)="reset()">
        <option value="">Todos os status</option>
        @for (s of catalog()?.statuses ?? []; track s) {
          <option>{{ s }}</option>
        }</select
      ><select aria-label="Filtrar gênero" [(ngModel)]="genre" (ngModelChange)="reset()">
        <option value="">Todos os gêneros</option>
        @for (g of catalog()?.genres ?? []; track g) {
          <option>{{ g }}</option>
        }</select
      ><select aria-label="Filtrar loja" [(ngModel)]="store" (ngModelChange)="reset()">
        <option value="">Todas as lojas</option>
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
          <option value="name">Nome A–Z</option>
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
        <a class="game-card" [routerLink]="['/jogos', g.id]"
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
            ><span class="badge cover-status" [class]="'badge cover-status ' + color(g.status)">{{
              g.status
            }}</span>
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
    this.api
      .catalog()
      .then((c) => this.catalog.set(c))
      .catch(() => {});
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
  async load() {
    const id = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await this.api.list({
        q: this.q,
        status: this.status,
        primaryGenre: this.genre,
        store: this.store,
        sort: this.sort,
        page: this.page,
        pageSize: 24,
      });
      if (id === this.request) this.data.set(d);
    } catch {
      this.error.set('Não foi possível carregar a biblioteca. Confira se a API está rodando.');
    } finally {
      if (id === this.request) this.loading.set(false);
    }
  }
}
