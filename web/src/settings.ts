import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from './api';
import { ScoringSettingsStore } from './scoring-settings';
import type {
  ScoreWeights,
  ScoringConfig,
  ScoringFactor,
  ScoringRuleId,
  ScoringSection,
  ScoringSettings,
} from '../../shared/models';

const SECTIONS: { id: ScoringSection; title: string; hint: string }[] = [
  {
    id: 'base',
    title: 'Score base',
    hint: 'Pontuação própria de cada jogo, antes de olhar a ordem.',
  },
  {
    id: 'context',
    title: 'Ajustes contextuais',
    hint: 'Somados ao comparar o candidato com os jogos anteriores da fila (ou os últimos finalizados).',
  },
  {
    id: 'filter',
    title: 'Filtros e elegibilidade',
    hint: 'Quem entra na fila. Desligar um filtro inclui esses jogos.',
  },
  { id: 'manual', title: 'Ajuste manual', hint: 'Pontos criados ao arrastar jogos na fila.' },
  {
    id: 'params',
    title: 'Parâmetros',
    hint: 'Limites usados pelas regras acima. Valem enquanto alguma regra que os usa estiver ativa.',
  },
];
/** Ajustes que somam (os demais subtraem); os de tags são multiplicados pela sobreposição. */
const BONUS = new Set<string>(['inProgress', 'contrastingPace', 'shortAfterLong']);
const OVERLAP = new Set<string>(['repeatTag', 'repeatTagTwoBack']);

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">COMO A FILA É CALCULADA</span>
        <h1>Configurações<span class="heading-dot">.</span></h1>
        <p>Ajuste o peso de cada fator e desligue as regras que não fazem sentido para você.</p>
      </div>
    </div>
    @if (error()) {
      <div class="error" role="alert">
        {{ error() }}
        @if (!settings()) {
          <button (click)="load()">Tentar novamente</button>
        }
      </div>
    }
    @if (success()) {
      <div class="reorder-notice" role="status">
        <span>{{ success() }} <a routerLink="/ordem">Ver a fila ↗</a></span>
        <button type="button" (click)="success.set('')" aria-label="Fechar aviso">×</button>
      </div>
    }
    @if (draft(); as d) {
      <section class="panel formula-panel" aria-labelledby="formula-title">
        <span class="eyebrow">FÓRMULA</span>
        <h2 id="formula-title">Como cada jogo é pontuado</h2>
        <div class="formula">
          <p class="eq">
            <var>score</var> = <var>base</var> + <span class="op">Σ</span> ajustes ativos
            <span [class.off]="!d.rules.manual">+ <var>M</var></span>
          </p>
          <p class="eq">
            <var>base</var> =
            <span class="term" [class.off]="!d.rules.desire"
              ><b>{{ num(d.weights.desire) }}</b
              >·<var>D</var></span
            >
            +
            <span class="term" [class.off]="!d.rules.affinity"
              ><b>{{ num(d.weights.affinity) }}</b
              >·<var>A</var></span
            >
            +
            <span class="term" [class.off]="!d.rules.duration"
              ><b>{{ num(d.weights.duration) }}</b
              >·<var>T</var></span
            >
          </p>
          <p class="eq" [class.off]="!d.rules.affinity">
            <var>A</var> = (A<sub>gênero</sub> + A<sub>ritmo</sub> + A<sub>mecânica</sub>) ÷ 3,
            &nbsp; A<sub>x</sub> =
            <span class="frac"
              ><span
                ><b>{{ num(d.weights.priorStrength) }}</b
                >·<b>{{ num(d.weights.neutralAffinity) }}</b> + Σ 25·(nota − 1)</span
              ><span
                ><b>{{ num(d.weights.priorStrength) }}</b> + <var>n</var><sub>x</sub></span
              ></span
            >
          </p>
          <p class="eq" [class.off]="!d.rules.duration">
            <var>T</var> = limite<sub>0–100</sub>(100 +
            <b>{{ num(d.weights.freeDurationHours) }}</b> − <var>H</var>) &nbsp;<small
              >(sem tempo conhecido: T = 50)</small
            >
          </p>
          <p class="eq">
            <var>H</var> = horas estimadas × <var>f</var>, &nbsp;
            @if (d.rules.timeFactor) {
              <var>f</var> = limite<sub>0,5–2</sub>(<span class="frac"
                ><span>2 + <var>m</var>·mediana(real ÷ estimado)</span
                ><span>2 + <var>m</var></span></span
              >)
            } @else {
              <var>f</var> = 1 <small>(seu ritmo desligado)</small>
            }
          </p>
          <p class="eq adjustments">
            <span class="op">Σ</span> ajustes =
            @for (f of rows('context'); track f.id) {
              <span class="chip" [class.off]="!d.rules[f.rule!]" [class.bonus]="isBonus(f)"
                >{{ isBonus(f) ? '+' : '−' }} {{ num(d.weights[f.weight!]) }}
                @if (isOverlap(f)) {
                  · sobreposição
                }
                · [{{ f.label.toLowerCase() }}]</span
              >
            }
          </p>
        </div>
        <ul class="legend">
          <li>
            <var>D</var> vontade de jogar: Muito Alta 100, Alta 75, Média 50, Baixa 25, Muito Baixa
            0.
          </li>
          <li>
            <var>A</var> afinidade bayesiana: média das suas notas (1–5 viram 0–100) nos <var>n</var
            ><sub>x</sub> jogos avaliados com o mesmo gênero, ritmo ou mecânica, puxada para a
            afinidade neutra com força <var>k</var> = {{ num(d.weights.priorStrength) }}.
          </li>
          <li>
            <var>T</var> duração: quanto menor a estimativa <var>H</var>, maior. <var>f</var> é o
            seu ritmo, a mediana de horas reais ÷ estimadas dos <var>m</var> jogos finalizados,
            suavizada e limitada a 0,5×–2×.
          </li>
          <li>
            <var>M</var> pontos do ajuste manual (arrastar na fila). [condição] vale 1 quando é
            verdadeira e 0 quando não é. A fila é montada um jogo por vez: sempre entra o maior
            score entre os disponíveis.
          </li>
          <li>{{ queueRule(d) }}</li>
        </ul>
      </section>

      @for (s of sections; track s.id) {
        <section class="panel settings-section" [attr.aria-labelledby]="'sec-' + s.id">
          <h2 [id]="'sec-' + s.id">{{ s.title }}</h2>
          <p class="muted">{{ s.hint }}</p>
          <table class="factors">
            <thead>
              <tr>
                <th scope="col">Fator</th>
                <th scope="col" class="desc">Descrição</th>
                <th scope="col">Peso</th>
                <th scope="col">Ativo</th>
              </tr>
            </thead>
            <tbody>
              @for (f of rows(s.id); track f.id) {
                <tr [class.off]="f.rule && !d.rules[f.rule]">
                  <th scope="row">{{ f.label }}</th>
                  <td class="desc">{{ f.description }}</td>
                  <td class="weight">
                    @if (f.weight; as key) {
                      <label class="number" [class.invalid]="!valid(f, d.weights[key])">
                        <input
                          type="number"
                          [value]="d.weights[key]"
                          [min]="f.min"
                          [max]="f.max"
                          [step]="f.step"
                          [disabled]="busy()"
                          [attr.aria-label]="'Peso: ' + f.label"
                          [attr.aria-invalid]="!valid(f, d.weights[key])"
                          (input)="setWeight(key, $event)"
                        /><span>{{ f.unit }}</span>
                      </label>
                      @if (!valid(f, d.weights[key])) {
                        <small class="hint">{{ num(f.min) }} a {{ num(f.max) }}</small>
                      }
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
                  <td class="toggle">
                    @if (f.rule; as rule) {
                      <label class="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          [checked]="d.rules[rule]"
                          [disabled]="busy()"
                          [attr.aria-label]="'Regra ativa: ' + f.label"
                          (change)="toggle(rule)"
                        /><span aria-hidden="true"></span>
                      </label>
                    } @else {
                      <span class="muted small">sempre</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      <div class="save-bar settings-actions">
        <span>
          @if (saving()) {
            Salvando…
          } @else if (invalid()) {
            Corrija os valores destacados.
          } @else if (dirty()) {
            Alterações não salvas.
          } @else {
            Versão {{ settings()?.version }} salva{{
              settings()?.updatedAt ? ' em ' + date(settings()!.updatedAt!) : ' (padrão)'
            }}.
          }
        </span>
        <div class="actions">
          <button type="button" class="button" (click)="restoreDefaults()" [disabled]="busy()">
            Restaurar padrão</button
          ><button type="button" class="button" (click)="discard()" [disabled]="!dirty() || busy()">
            Descartar</button
          ><button
            type="button"
            class="button primary"
            (click)="save()"
            [disabled]="!dirty() || invalid() || busy()"
          >
            Salvar
          </button>
        </div>
      </div>
    } @else if (loading()) {
      <div class="empty">Carregando configurações…</div>
    }`,
  styles: `
    .formula-panel h2 {
      margin-bottom: 16px;
    }
    .formula {
      background: #f4f8f5;
      border: 1px solid #dfeae2;
      border-radius: 9px;
      padding: 8px 18px;
      font-family: 'Cambria Math', 'STIX Two Math', Georgia, serif;
      font-size: 15px;
      color: #1f3a2f;
      overflow-wrap: anywhere;
    }
    .formula .eq {
      font-size: 15px;
      line-height: 2.4;
      margin: 6px 0;
    }
    .formula var {
      font-style: italic;
      font-weight: 600;
    }
    .formula b {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: var(--green);
    }
    .formula small {
      font-family: 'DM Sans', system-ui, sans-serif;
      color: var(--muted);
      font-size: 11px;
    }
    .op {
      font-size: 19px;
    }
    .frac {
      display: inline-flex;
      flex-direction: column;
      vertical-align: middle;
      text-align: center;
      line-height: 1.5;
      margin: 0 3px;
    }
    .frac > span:first-child {
      border-bottom: 1px solid currentColor;
      padding: 0 4px;
    }
    .off {
      opacity: 0.4;
      text-decoration: line-through;
    }
    .chip {
      display: inline-block;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      padding: 2px 8px;
      margin: 2px 2px;
      border-radius: 999px;
      background: #fbefea;
      color: #8d4b33;
    }
    .chip.bonus {
      background: #def1e4;
      color: #266443;
    }
    .legend {
      margin: 16px 0 0;
      padding-left: 18px;
      font-size: 12px;
      line-height: 1.7;
      color: #53695e;
    }
    .legend var {
      font-family: 'Cambria Math', Georgia, serif;
      font-weight: 700;
    }
    .settings-section .muted {
      margin-top: 0;
    }
    .factors {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .factors th,
    .factors td {
      text-align: left;
      padding: 11px 10px;
      border-top: 1px solid var(--border);
      vertical-align: middle;
    }
    .factors thead th {
      border-top: 0;
      font-size: 9px;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--muted);
    }
    .factors tbody th {
      font-weight: 600;
      width: 26%;
    }
    .factors .desc {
      color: #66796d;
      line-height: 1.5;
    }
    .factors .weight {
      width: 150px;
    }
    .factors .toggle {
      width: 64px;
      text-align: center;
    }
    .factors tr.off th,
    .factors tr.off .desc,
    .factors tr.off .weight {
      opacity: 0.5;
    }
    .number {
      display: inline-flex !important;
      align-items: center;
      gap: 6px;
      margin: 0 !important;
      font-weight: 400 !important;
      color: var(--muted);
    }
    .panel .number input {
      width: 96px;
      margin: 0;
      padding: 8px 9px;
      text-align: right;
    }
    .number.invalid input {
      border-color: #d98b7c;
      background: #fff6f4;
    }
    .hint {
      display: block;
      color: #a1473c;
      font-size: 10px;
      margin-top: 4px;
    }
    .switch {
      position: relative;
      display: inline-block !important;
      width: 38px;
      height: 22px;
      margin: 0 !important;
    }
    .switch input {
      position: absolute;
      inset: 0;
      opacity: 0;
      margin: 0;
      cursor: pointer;
    }
    .switch span {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: #cfd9d3;
      transition: background 0.15s;
      pointer-events: none;
    }
    .switch span::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px #0003;
      transition: translate 0.15s;
    }
    .switch input:checked + span {
      background: var(--green);
    }
    .switch input:checked + span::after {
      translate: 16px 0;
    }
    .switch input:focus-visible + span {
      outline: 3px solid #62ba94;
      outline-offset: 2px;
    }
    .switch input:disabled + span {
      opacity: 0.5;
    }
    .settings-actions {
      position: sticky;
      bottom: 0;
      z-index: 3;
      background: #f8faf9;
      border-top: 1px solid var(--border);
      padding: 14px 0;
      flex-wrap: wrap;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .reorder-notice a {
      color: var(--green);
      text-decoration: underline;
      margin-left: 6px;
    }
    @media (prefers-reduced-motion: reduce) {
      .switch span,
      .switch span::after {
        transition: none;
      }
    }
    @media (max-width: 700px) {
      .factors thead {
        display: none;
      }
      .factors tr {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 4px 10px;
        padding: 12px 0;
        border-top: 1px solid var(--border);
      }
      .factors th,
      .factors td {
        border: 0;
        padding: 0;
        width: auto !important;
      }
      .factors .desc {
        grid-column: 1 / -1;
        grid-row: 2;
        font-size: 11px;
      }
      .panel .number input {
        width: 76px;
      }
      .formula {
        padding: 6px 12px;
      }
      .formula .eq {
        font-size: 14px;
        line-height: 2.2;
      }
    }
  `,
})
export class Settings {
  private store = inject(ScoringSettingsStore);
  private api = inject(Api);
  readonly sections = SECTIONS;
  readonly settings = signal<ScoringSettings | null>(null);
  readonly draft = signal<ScoringConfig | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly busy = computed(() => this.loading() || this.saving());
  readonly dirty = computed(() => {
    const s = this.settings(),
      d = this.draft();
    return !!s && !!d && JSON.stringify(s.config) !== JSON.stringify(d);
  });
  readonly invalid = computed(() => {
    const d = this.draft();
    return (
      !!d &&
      (this.settings()?.factors ?? []).some((f) => f.weight && !this.valid(f, d.weights[f.weight]))
    );
  });

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.apply(await this.store.get());
    } catch {
      this.error.set('Não foi possível carregar as configurações. Confira se a API está no ar.');
    } finally {
      this.loading.set(false);
    }
  }
  rows(section: ScoringSection): ScoringFactor[] {
    return (this.settings()?.factors ?? []).filter((f) => f.section === section);
  }
  valid(f: ScoringFactor, v: number) {
    return Number.isFinite(v) && v >= f.min && v <= f.max;
  }
  isBonus(f: ScoringFactor) {
    return BONUS.has(f.id);
  }
  isOverlap(f: ScoringFactor) {
    return OVERLAP.has(f.id);
  }
  queueRule({ rules: r }: ScoringConfig) {
    const statuses = ['Não iniciado', 'Jogando', ...(r.excludeAbandoned ? [] : ['Abandonado'])];
    const extra = [
      r.excludeEndless && 'exceto os sem fim definido',
      r.excludeCompetitive && 'exceto competitivos/online',
      r.prerequisites && 'respeitando a ordem da série',
    ].filter(Boolean);
    return `Entram na fila: ${statuses.join(', ')}${extra.length ? ', ' + extra.join(', ') : ''}.`;
  }
  num(n: number) {
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '?';
  }
  date(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  setWeight(key: keyof ScoreWeights, e: Event) {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    this.draft.update((d) => d && { ...d, weights: { ...d.weights, [key]: value } });
    this.success.set('');
  }
  toggle(rule: ScoringRuleId) {
    this.draft.update((d) => d && { ...d, rules: { ...d.rules, [rule]: !d.rules[rule] } });
    this.success.set('');
  }
  discard() {
    const s = this.settings();
    if (s) this.draft.set(structuredClone(s.config));
  }
  async save() {
    const d = this.draft();
    if (!d || !this.dirty() || this.invalid()) return;
    await this.persist(() => this.store.save(d), 'Configuração salva. A fila foi recalculada.');
  }
  async restoreDefaults() {
    if (!confirm('Voltar todos os pesos e regras para o padrão?')) return;
    await this.persist(() => this.store.reset(), 'Padrão restaurado. A fila foi recalculada.');
  }

  private apply(s: ScoringSettings) {
    this.settings.set(s);
    this.draft.set(structuredClone(s.config));
  }
  private async persist(action: () => Promise<ScoringSettings>, message: string) {
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      this.apply(await action());
      // Recalcula a fila já com a nova config (o servidor regrava o snapshot).
      await this.api.queue().catch(() => undefined);
      this.success.set(message);
    } catch (e) {
      const msg = (e as { error?: { error?: { message?: string } } })?.error?.error?.message;
      this.error.set(msg ? 'Não foi possível salvar: ' + msg : 'Não foi possível salvar.');
    } finally {
      this.saving.set(false);
    }
  }
}
