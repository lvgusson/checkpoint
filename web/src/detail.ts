import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api } from './api';
import { FinishDialog } from './finish-dialog';
import { MetadataSelect } from './metadata-select';
import { PrerequisiteSearch } from './prerequisite-search';
import { metadataPresentation } from './metadata-presentation';
import type { Catalog, ScoredGame } from '../../shared/models';
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, MetadataSelect, PrerequisiteSearch],
  styleUrl: './detail.css',
  template: `<a class="back-link" [routerLink]="back"
      >← {{ back === '/ordem' ? 'Voltar para a ordem de jogos' : 'Voltar para a biblioteca' }}</a
    >
    @if (error()) {
      <div class="error" role="alert">{{ error() }}</div>
    }
    @if (game(); as g) {
      <div class="detail-hero">
        <div class="detail-cover">
          @if (g.coverUrl) {
            <img [src]="g.coverUrl" alt="" (error)="$any($event.target).style.display = 'none'" />
          }
          <span>{{ g.name.slice(0, 1) }}</span>
        </div>
        <div>
          <span class="eyebrow">{{ g.store }} · {{ g.platform }}</span>
          <h1>{{ g.name }}</h1>
          <div class="tags">
            <span
              class="badge metadata-badge"
              [style.--metadata-color]="presentation('status', g.status).color"
              ><svg aria-hidden="true" viewBox="0 0 24 24">
                <path [attr.d]="presentation('status', g.status).icon" /></svg
              >{{ g.status }}</span
            ><span
              class="badge metadata-badge"
              [style.--metadata-color]="presentation('genre', g.primaryGenre).color"
              ><svg aria-hidden="true" viewBox="0 0 24 24">
                <path [attr.d]="presentation('genre', g.primaryGenre).icon" /></svg
              >{{ g.primaryGenre }}</span
            >
            @for (t of g.secondaryTags; track t) {
              <span
                class="badge metadata-badge"
                [style.--metadata-color]="presentation('tag', t).color"
                ><svg aria-hidden="true" viewBox="0 0 24 24">
                  <path [attr.d]="presentation('tag', t).icon" /></svg
                >{{ t }}</span
              >
            }
          </div>
          <p class="muted">{{ g.pace }} · {{ g.structure }} · {{ g.coop }}</p>
          @if (g.status !== 'Finalizado' && g.status !== 'Desejado') {
            <button type="button" class="button primary finish-open" (click)="finish(g)">
              ✓ Finalizar jogo
            </button>
          }
        </div>
      </div>
      <form (ngSubmit)="save()">
        <div class="detail-layout">
          <div>
            <section class="panel">
              <span class="eyebrow">SUA EXPERIÊNCIA</span>
              <h2>Como foi a partida?</h2>
              <p class="muted">Sua avaliação ajuda a escolher os próximos jogos.</p>
              <div class="field-label" id="rating-label">
                Nota pessoal
                <span>{{ form.rating ?? 'Sem nota' }} / 5</span>
              </div>
              <div class="stars" role="group" aria-labelledby="rating-label">
                @for (n of [1, 2, 3, 4, 5]; track n) {
                  <button
                    type="button"
                    [class.selected]="(form.rating ?? 0) >= n"
                    [attr.aria-label]="'Nota ' + n + ' de 5'"
                    [attr.aria-pressed]="form.rating === n"
                    (click)="form.rating = n"
                  >
                    ★
                  </button>
                }
                <button class="clear-rating" type="button" (click)="form.rating = null">
                  Limpar
                </button>
              </div>
              <label class="checkbox"
                ><input type="checkbox" name="autoFinish" [(ngModel)]="autoFinish" /> Ao dar uma
                nova nota, marcar como finalizado</label
              >
              <div class="form-grid">
                <metadata-select
                  label="Status"
                  kind="status"
                  [options]="catalog()?.statuses ?? []"
                  [value]="form.status"
                  (valueChange)="setStatus($event)"
                />
                <metadata-select
                  label="Vontade de jogar"
                  kind="desire"
                  [options]="catalog()?.desires ?? []"
                  [value]="form.desire"
                  (valueChange)="setDesire($event)"
                />
                <label
                  >Horas para finalizar<input
                    type="number"
                    name="actual"
                    min="0"
                    max="100000"
                    step="0.1"
                    [(ngModel)]="form.actualHours"
                    placeholder="Seu tempo real" /></label
                ><label
                  >Data de conclusão<input
                    type="date"
                    name="finish"
                    [(ngModel)]="form.finishedAt" /></label
                ><label
                  >Data de início<input type="date" name="start" [(ngModel)]="form.startedAt"
                /></label>
              </div>
              <label
                >O que você achou?<textarea
                  name="notes"
                  [(ngModel)]="form.notes"
                  rows="5"
                  placeholder="O que vale lembrar sobre este jogo?"
                ></textarea>
              </label>
            </section>
            <section class="panel metadata">
              <span class="eyebrow">CLASSIFICAÇÃO</span>
              <h2>Metadados do jogo</h2>
              <div class="form-grid">
                <label>Nome<input name="name" [(ngModel)]="form.name" required /></label>
                <metadata-select
                  label="Gênero principal"
                  kind="genre"
                  [options]="catalog()?.genres ?? []"
                  [(value)]="form.primaryGenre"
                />
                <metadata-select
                  label="Tags secundárias"
                  kind="tag"
                  [options]="catalog()?.tags ?? []"
                  [multiple]="true"
                  [(values)]="form.secondaryTags"
                />
                <metadata-select
                  label="Ritmo"
                  kind="pace"
                  [options]="catalog()?.paces ?? []"
                  [(value)]="form.pace"
                />
                <metadata-select
                  label="Mecânica"
                  kind="mechanic"
                  [options]="catalog()?.mechanics ?? []"
                  [(value)]="form.mechanic"
                />
                <metadata-select
                  label="Estrutura"
                  kind="structure"
                  [options]="catalog()?.structures ?? []"
                  [(value)]="form.structure"
                />
                <metadata-select
                  label="Loja"
                  kind="store"
                  [options]="catalog()?.stores ?? []"
                  [(value)]="form.store"
                />
                <metadata-select
                  label="Plataforma"
                  kind="platform"
                  [options]="catalog()?.platforms ?? []"
                  [(value)]="form.platform"
                />
                <label
                  >Campanha principal (h)<input
                    type="number"
                    name="main"
                    min="0"
                    step="0.1"
                    [(ngModel)]="form.mainHours" /></label
                ><label
                  >Campanha + extras (h)<input
                    type="number"
                    name="extra"
                    min="0"
                    step="0.1"
                    [(ngModel)]="form.extraHours" /></label
                ><label
                  >100% (h)<input
                    type="number"
                    name="complete"
                    min="0"
                    step="0.1"
                    [(ngModel)]="form.completionistHours"
                /></label>
                <prerequisite-search [excludeId]="g.id" [(value)]="form.prerequisiteId" />
              </div>
            </section>
            <div class="save-bar">
              <span role="status">{{
                saved()
                  ? 'Salvo. A ordem já foi recalculada.'
                  : 'Salvar recalcula a ordem de todas as listas.'
              }}</span
              ><button class="button primary" type="submit" [disabled]="saving()">
                {{ saving() ? 'Salvando…' : 'Salvar avaliação' }}
              </button>
            </div>
          </div>
          <aside class="detail-side">
            <section class="panel">
              <span class="eyebrow">PRIORIDADE PESSOAL</span>
              <div class="big-score">{{ g.baseScore }}<small>pontos de base</small></div>
              <dl>
                <div>
                  <dt>Afinidade com seu gosto</dt>
                  <dd>{{ g.affinity }} / 100</dd>
                </div>
                <div>
                  <dt>Tempo no seu ritmo</dt>
                  <dd>
                    {{ g.plannedHours === null ? 'A confirmar' : g.plannedHours + ' h' }}
                  </dd>
                </div>
                <div>
                  <dt>Horas na Steam</dt>
                  <dd>
                    {{ g.steamHours === null ? '—' : g.steamHours + ' h' }}
                  </dd>
                </div>
                <div>
                  <dt>Steam App ID</dt>
                  <dd>{{ g.steamAppId ?? '—' }}</dd>
                </div>
              </dl>
              <p class="muted small">
                A posição final inclui o contexto dos jogos anteriores; ela pode variar em relação à
                pontuação de base.
              </p>
              <a class="button full" routerLink="/ordem">Ver ordem de jogos →</a>
            </section>
            <section class="panel">
              <h3>Referências da planilha</h3>
              <p class="muted small">
                {{ g.timeVerification || 'Estimativa sem verificação' }} ·
                {{ g.size }}
              </p>
              @if (g.timeSource.startsWith('https://') || g.timeSource.startsWith('http://')) {
                <a [href]="g.timeSource" target="_blank" rel="noopener">Fonte dos tempos ↗</a>
              }
              <p class="small">{{ g.reviewNotes }}</p>
              <details>
                <summary>Todos os dados importados</summary>
                <pre>{{ raw() }}</pre>
              </details>
            </section>
          </aside>
        </div>
      </form>
    } @else {
      <div class="empty">Carregando jogo…</div>
    }`,
})
export class Detail {
  api = inject(Api);
  route = inject(ActivatedRoute);
  private finishDialog = inject(FinishDialog);
  presentation = metadataPresentation;
  game = signal<ScoredGame | null>(null);
  catalog = signal<Catalog | null>(null);
  error = signal('');
  saving = signal(false);
  saved = signal(false);
  form = {} as ScoredGame;
  autoFinish = true;
  back = this.route.snapshot.queryParamMap.get('from') === 'ordem' ? '/ordem' : '/jogos';
  constructor() {
    this.load();
  }
  raw() {
    return JSON.stringify(this.game(), null, 2);
  }
  async load() {
    try {
      await Promise.all([
        this.api.game(this.route.snapshot.paramMap.get('id')!, (g) => this.show(g)),
        this.api.catalog((c) => this.catalog.set(c)),
      ]);
    } catch {
      if (!this.game()) this.error.set('Não foi possível carregar o jogo.');
    }
  }
  /** Refresh cached data only while the form remains untouched. */
  private show(g: ScoredGame) {
    const old = this.game();
    const untouched = !old || JSON.stringify(this.form) === JSON.stringify(old);
    this.game.set(g);
    if (untouched) {
      this.form = structuredClone(g);
    }
  }
  setStatus(value: string) {
    if (this.catalog()?.statuses.includes(value as ScoredGame['status']))
      this.form.status = value as ScoredGame['status'];
  }
  setDesire(value: string) {
    if (this.catalog()?.desires.includes(value as ScoredGame['desire']))
      this.form.desire = value as ScoredGame['desire'];
  }
  /** Open the shared completion dialog and reload the saved game. */
  async finish(g: ScoredGame) {
    if (!(await this.finishDialog.open(g))) return;
    this.saved.set(true);
    this.game.set(null);
    await this.load();
  }
  async save() {
    this.saving.set(true);
    this.error.set('');
    this.saved.set(false);
    try {
      const old = this.game()!;
      if (this.form.secondaryTags.length > 3) throw new Error('Use até três tags secundárias.');
      const fields = [
        'name',
        'primaryGenre',
        'status',
        'desire',
        'actualHours',
        'finishedAt',
        'startedAt',
        'rating',
        'notes',
        'secondaryTags',
        'pace',
        'mechanic',
        'structure',
        'store',
        'platform',
        'mainHours',
        'extraHours',
        'completionistHours',
        'prerequisiteId',
      ] as const;
      const patch: Record<string, unknown> = {};
      for (const k of fields) {
        let v = this.form[k];
        if (['finishedAt', 'startedAt', 'prerequisiteId'].includes(k) && v === '') v = null;
        if (JSON.stringify(v) !== JSON.stringify(old[k])) patch[k] = v;
      }
      if (Object.hasOwn(patch, 'rating')) patch['autoFinish'] = this.autoFinish;
      const g = await this.api.save(old.id, patch);
      this.game.set(g);
      this.form = structuredClone(g);
      this.saved.set(true);
    } catch (e: unknown) {
      const err = e as {
        error?: { error?: { message?: string } };
        message?: string;
      };
      this.error.set(err.error?.error?.message ?? err.message ?? 'Não foi possível salvar.');
    } finally {
      this.saving.set(false);
    }
  }
}
