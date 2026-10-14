import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScoringSettingsStore } from './scoring-settings';
import { ListPicker, routeListId } from './lists';
import type {
  Desire,
  FilterOption,
  QueueFilters,
  ScoreWeights,
  ScoringConfig,
  ScoringFactor,
  ScoringRuleId,
  ScoringSection,
  ScoringSettings,
} from '../../../packages/core/src/models';

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
  { id: 'manual', title: 'Ajuste manual', hint: 'Posições fixadas ao arrastar jogos na fila.' },
  {
    id: 'params',
    title: 'Parâmetros',
    hint: 'Limites usados pelas regras acima. Valem enquanto alguma regra que os usa estiver ativa.',
  },
];
type ListFilter = 'excludedGenres' | 'excludedTags' | 'stores' | 'paces';
/** Ajustes que somam (os demais subtraem); os de tags são multiplicados pela sobreposição. */
const BONUS = new Set<string>(['contrastingPace', 'shortAfterLong']);
const OVERLAP = new Set<string>(['repeatTag', 'repeatTagTwoBack']);

@Component({
  standalone: true,
  imports: [RouterLink, ListPicker],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">COMO A FILA É CALCULADA</span>
        <h1>Configurações<span class="heading-dot">.</span></h1>
        <p>
          Cada lista tem os próprios pesos e regras. Ajuste o peso de cada fator e desligue as
          regras que não fazem sentido para esta lista.
        </p>
      </div>
    </div>
    <app-list-picker base="/configuracoes" [current]="listId()" />
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
        <span>{{ success() }} <a [routerLink]="['/ordem', listId()]">Ver a fila ↗</a></span>
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
            <var>D</var> - vontade de jogar: Imediata e Muito Alta 100, Alta 75, Média 50, Baixa 25,
            Muito Baixa 0. Jogos com vontade Imediata vão para o topo da fila, entre si pelo score.
          </li>
          <li>
            <var>A</var> - afinidade bayesiana: média das suas notas (1–5 viram 0–100) nos
            <var>n</var><sub>x</sub> jogos avaliados com o mesmo gênero, ritmo ou mecânica, puxada
            para a afinidade neutra com força <var>k</var> = {{ num(d.weights.priorStrength) }}.
          </li>
          <li>
            <var>T</var> - duração: quanto menor a estimativa <var>H</var>, maior. <var>f</var> é o
            seu ritmo, a mediana de horas reais ÷ estimadas dos <var>m</var> jogos finalizados,
            suavizada e limitada a 0,5×–2×.
          </li>
          <li>
            [condição] vale 1 quando é verdadeira e 0 quando não é. A fila é montada um jogo por
            vez: sempre entra o maior score entre os disponíveis. Depois, os jogos que você arrastou
            entram exatamente na posição fixada, empurrando os demais.
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

      @if (settings()?.filterOptions; as o) {
        <section class="panel settings-section" aria-labelledby="sec-content-filters">
          <h2 id="sec-content-filters">Filtros de conteúdo</h2>
          <p class="muted">
            Recorte a fila para montar listas temáticas. Os números mostram quantos dos
            {{ o.total }} candidatos cada escolha tira da fila.
            @if (activeFilters(d)) {
              <button type="button" class="link" (click)="clearFilters()" [disabled]="busy()">
                Limpar filtros
              </button>
            }
          </p>

          <fieldset class="filter-group">
            <legend>Excluir gêneros</legend>
            <div class="chips">
              @for (g of o.genres; track g.value) {
                <button
                  type="button"
                  class="pick exclude"
                  [attr.aria-pressed]="has(d.filters.excludedGenres, g.value)"
                  [disabled]="busy()"
                  (click)="toggleIn('excludedGenres', g.value)"
                >
                  {{ g.value }} <small>{{ g.count }}</small>
                </button>
              }
            </div>
          </fieldset>

          <fieldset class="filter-group">
            <legend>Duração (horas previstas)</legend>
            <div class="hours">
              <label class="number" [class.invalid]="!hoursValid(d)">
                mín.
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  placeholder="—"
                  [value]="d.filters.minHours ?? ''"
                  [disabled]="busy()"
                  aria-label="Horas mínimas"
                  (input)="setHours('minHours', $event)"
                /><span>h</span>
              </label>
              <label class="number" [class.invalid]="!hoursValid(d)">
                máx.
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  placeholder="—"
                  [value]="d.filters.maxHours ?? ''"
                  [disabled]="busy()"
                  aria-label="Horas máximas"
                  (input)="setHours('maxHours', $event)"
                /><span>h</span>
              </label>
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="d.filters.excludeUnknownHours"
                  [disabled]="busy()"
                  (change)="setFlag('excludeUnknownHours')"
                />
                Tirar jogos sem tempo estimado
              </label>
              <span class="removed">−{{ hoursRemoved(d, o.hours) }} jogos</span>
            </div>
            @if (!hoursValid(d)) {
              <small class="hint">Use horas de 0 a 10.000, com o mínimo até o máximo.</small>
            }
            <p class="muted small">
              Horas previstas = estimativa (história + extras, ou só história) × seu ritmo; é o
              mesmo número que a fila mostra e soma. Sem limite = campo vazio.
            </p>
          </fieldset>

          <fieldset class="filter-group">
            <legend>Só estas lojas <small>(nenhuma marcada = todas)</small></legend>
            <div class="chips">
              @for (s of o.stores; track s.value) {
                <button
                  type="button"
                  class="pick"
                  [attr.aria-pressed]="has(d.filters.stores, s.value)"
                  [disabled]="busy()"
                  (click)="toggleIn('stores', s.value)"
                >
                  {{ s.value }} <small>{{ s.count }}</small>
                </button>
              }
            </div>
          </fieldset>

          <fieldset class="filter-group">
            <legend>Só estes ritmos <small>(nenhum marcado = todos)</small></legend>
            <div class="chips">
              @for (p of o.paces; track p.value) {
                <button
                  type="button"
                  class="pick"
                  [attr.aria-pressed]="has(d.filters.paces, p.value)"
                  [disabled]="busy()"
                  (click)="toggleIn('paces', p.value)"
                >
                  {{ p.value }} <small>{{ p.count }}</small>
                </button>
              }
            </div>
          </fieldset>

          <fieldset class="filter-group inline">
            <legend>Vontade e companhia</legend>
            <label class="select">
              Vontade mínima
              <select [disabled]="busy()" (change)="setMinDesire($event)">
                <option value="" [selected]="d.filters.minDesire === null">Qualquer</option>
                @for (x of o.desires; track x.value) {
                  <option [value]="x.value" [selected]="d.filters.minDesire === x.value">
                    {{ x.value }} ou mais
                  </option>
                }
              </select>
              <span class="removed">−{{ desireRemoved(d, o.desires) }} jogos</span>
            </label>
            <label class="check">
              <input
                type="checkbox"
                [checked]="d.filters.coopOnly"
                [disabled]="busy()"
                (change)="setFlag('coopOnly')"
              />
              Só jogos com coop (local ou online) <small>{{ o.coop }} jogos</small>
            </label>
          </fieldset>

          <details class="filter-group" [open]="d.filters.excludedTags.length > 0">
            <summary>Excluir subgêneros/tags ({{ d.filters.excludedTags.length }})</summary>
            <div class="chips">
              @for (t of o.tags; track t.value) {
                <button
                  type="button"
                  class="pick exclude"
                  [attr.aria-pressed]="has(d.filters.excludedTags, t.value)"
                  [disabled]="busy()"
                  (click)="toggleIn('excludedTags', t.value)"
                >
                  {{ t.value }} <small>{{ t.count }}</small>
                </button>
              }
            </div>
          </details>
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
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 8px 18px;
      font-family: 'Cambria Math', 'STIX Two Math', Georgia, serif;
      font-size: 15px;
      color: var(--text);
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
      color: var(--accent);
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
      background: var(--warn-bg);
      color: var(--warn);
    }
    .chip.bonus {
      background: var(--accent-soft);
      color: var(--accent-ink);
    }
    .legend {
      margin: 16px 0 0;
      padding-left: 18px;
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-2);
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
      color: var(--muted);
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
      border-color: var(--danger-line);
      background: var(--danger-bg);
    }
    .hint {
      display: block;
      color: var(--danger);
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
      background: var(--faint);
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
      background: var(--surface);
      box-shadow: 0 1px 2px var(--shadow-mid);
      transition: translate 0.15s;
    }
    .switch input:checked + span {
      background: var(--accent);
    }
    .switch input:checked + span::after {
      translate: 16px 0;
    }
    .switch input:focus-visible + span {
      outline: 3px solid var(--accent-bright);
      outline-offset: 2px;
    }
    .switch input:disabled + span {
      opacity: 0.5;
    }
    .filter-group {
      border: 0;
      border-top: 1px solid var(--border);
      margin: 0;
      padding: 14px 0 12px;
      min-width: 0;
    }
    .filter-group legend,
    .filter-group summary {
      font-size: 12px;
      font-weight: 600;
      padding: 0;
      margin-bottom: 10px;
    }
    .filter-group summary {
      cursor: pointer;
    }
    .filter-group legend small,
    .check small {
      font-weight: 400;
      color: var(--muted);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .pick {
      font: inherit;
      font-size: 12px;
      padding: 5px 11px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: inherit;
      cursor: pointer;
    }
    .pick small {
      color: var(--muted);
      margin-left: 2px;
    }
    .pick[aria-pressed='true'] {
      background: var(--accent-soft);
      border-color: var(--accent-line);
      color: var(--accent-ink);
    }
    .pick.exclude[aria-pressed='true'] {
      background: var(--warn-bg);
      border-color: var(--warn-line);
      color: var(--warn);
      text-decoration: line-through;
    }
    .pick:focus-visible {
      outline: 3px solid var(--accent-bright);
      outline-offset: 2px;
    }
    .pick:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .hours,
    .inline {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 18px;
    }
    .inline legend {
      width: 100%;
    }
    .check,
    .select {
      display: inline-flex !important;
      align-items: center;
      gap: 8px;
      margin: 0 !important;
      font-size: 12px;
      font-weight: 400 !important;
    }
    .check input {
      width: auto;
      margin: 0;
    }
    .select select {
      width: auto;
      margin: 0;
      padding: 7px 9px;
    }
    .removed {
      font-size: 11px;
      color: var(--warn);
    }
    .muted.small {
      font-size: 11px;
      margin: 8px 0 0;
    }
    .link {
      font: inherit;
      background: none;
      border: 0;
      padding: 0;
      margin-left: 6px;
      color: var(--accent);
      text-decoration: underline;
      cursor: pointer;
    }
    .settings-actions {
      position: sticky;
      bottom: 0;
      z-index: 3;
      background: var(--bg);
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
      color: var(--accent);
      text-decoration: underline;
      margin-left: 6px;
    }
    @media (prefers-reduced-motion: reduce) {
      .switch span,
      .switch span::after {
        transition: none;
      }
    }
    /* Toque: área de 44px no switch (o label inteiro alterna) e nos chips/campos. */
    .switch::before {
      content: '';
      position: absolute;
      inset: -11px -6px;
    }
    @media (max-width: 800px) {
      .settings-actions {
        bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
      }
      .pick {
        min-height: 44px;
        padding: 8px 14px;
        font-size: 14px;
      }
      .panel .number input,
      .select select {
        min-height: 44px;
      }
      .check {
        min-height: 44px;
        font-size: 14px;
      }
      .check input {
        width: 22px;
        height: 22px;
      }
      .filter-group legend,
      .filter-group summary {
        font-size: 14px;
      }
      .factors {
        font-size: 14px;
      }
      .legend {
        font-size: 13px;
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
        font-size: 13px;
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
      ((this.settings()?.factors ?? []).some(
        (f) => f.weight && !this.valid(f, d.weights[f.weight]),
      ) ||
        !this.hoursValid(d))
    );
  });

  /** Lista cujas regras estão sendo editadas (da URL). */
  readonly listId = routeListId('/configuracoes');

  constructor() {
    effect(() => {
      if (this.listId()) untracked(() => void this.load());
    });
  }

  async load() {
    const listId = this.listId();
    if (!listId) return;
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const s = await this.store.get(listId);
      if (listId === this.listId()) this.apply(s);
    } catch {
      this.error.set('Não foi possível carregar as configurações. Confira se a API está no ar.');
    } finally {
      this.loading.set(false);
    }
  }
  rows(section: ScoringSection): ScoringFactor[] {
    return (this.settings()?.factors ?? []).filter(
      (f) => f.section === section && f.id !== 'inProgress',
    );
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
    const statuses = ['Não iniciado', ...(r.excludeAbandoned ? [] : ['Abandonado'])];
    const extra = [
      r.excludeEndless && 'exceto os sem fim definido',
      r.excludeCompetitive && 'exceto competitivos/online',
      r.prerequisites && 'respeitando a ordem da série',
    ].filter(Boolean);
    return `Entram na fila: ${statuses.join(', ')}${extra.length ? ', ' + extra.join(', ') : ''}. Jogos em andamento aparecem em Jogando agora.`;
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
  has(list: string[], value: string) {
    const v = value.toLocaleLowerCase('pt-BR');
    return list.some((x) => x.toLocaleLowerCase('pt-BR') === v);
  }
  toggleIn(key: ListFilter, value: string) {
    this.updateFilters((f) => ({
      [key]: this.has(f[key], value)
        ? f[key].filter((x) => x.toLocaleLowerCase('pt-BR') !== value.toLocaleLowerCase('pt-BR'))
        : [...f[key], value],
    }));
  }
  setHours(key: 'minHours' | 'maxHours', e: Event) {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    this.updateFilters(() => ({ [key]: Number.isFinite(v) ? v : null }));
  }
  setFlag(key: 'excludeUnknownHours' | 'coopOnly') {
    this.updateFilters((f) => ({ [key]: !f[key] }));
  }
  setMinDesire(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    this.updateFilters(() => ({ minDesire: (v || null) as Desire | null }));
  }
  clearFilters() {
    const defaults = this.settings()?.defaults.filters;
    if (defaults) this.updateFilters(() => structuredClone(defaults));
  }
  activeFilters({ filters }: ScoringConfig) {
    const defaults = this.settings()?.defaults.filters;
    return !!defaults && JSON.stringify(filters) !== JSON.stringify(defaults);
  }
  hoursValid({ filters: { minHours: min, maxHours: max } }: ScoringConfig) {
    const ok = (n: number | null) => n === null || (n >= 0 && n <= 10000);
    return ok(min) && ok(max) && (min === null || max === null || min <= max);
  }
  /** Quantos candidatos os limites de horas tiram (sem tempo passa, exceto se pedido). */
  hoursRemoved({ filters: f }: ScoringConfig, hours: (number | null)[]) {
    return hours.filter((h) =>
      h === null
        ? f.excludeUnknownHours
        : (f.minHours !== null && h < f.minHours) || (f.maxHours !== null && h > f.maxHours),
    ).length;
  }
  desireRemoved({ filters: f }: ScoringConfig, desires: FilterOption[]) {
    const min = desires.findIndex((x) => x.value === f.minDesire);
    return min < 0 ? 0 : desires.slice(min + 1).reduce((s, x) => s + x.count, 0);
  }
  private updateFilters(patch: (f: QueueFilters) => Partial<QueueFilters>) {
    this.draft.update((d) => d && { ...d, filters: { ...d.filters, ...patch(d.filters) } });
    this.success.set('');
  }
  discard() {
    const s = this.settings();
    if (s) this.draft.set(structuredClone(s.config));
  }
  async save() {
    const d = this.draft();
    if (!d || !this.dirty() || this.invalid()) return;
    const listId = this.listId()!;
    await this.persist(
      () => this.store.save(listId, d),
      'Configuração salva. A fila desta lista foi recalculada.',
    );
  }
  async restoreDefaults() {
    if (!confirm('Voltar todos os pesos, regras e filtros desta lista para o padrão?')) return;
    const listId = this.listId()!;
    await this.persist(
      () => this.store.reset(listId),
      'Padrão restaurado. A fila desta lista foi recalculada.',
    );
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
      this.success.set(message);
    } catch (e) {
      const msg = (e as { error?: { error?: { message?: string } } })?.error?.error?.message;
      this.error.set(msg ? 'Não foi possível salvar: ' + msg : 'Não foi possível salvar.');
    } finally {
      this.saving.set(false);
    }
  }
}
