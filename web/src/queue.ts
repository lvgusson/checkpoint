import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, color } from './api';
import { ScoringSettingsStore } from './scoring-settings';
import { ListPicker, routeListId } from './lists';
import type { QueueEntry, Recommendations } from '../../shared/models';

/** Linha da fila medida no início do arraste (coordenadas do documento). */
interface Snap {
  id: string;
  el: HTMLElement;
  top: number;
  height: number;
}
interface DragState {
  id: string;
  from: number;
  over: number;
  mode: 'pointer' | 'keyboard';
  el: HTMLElement;
  snaps: Snap[];
  height: number;
  placeholder: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  startScroll: number;
  lastX: number;
  lastY: number;
  tilt: number;
  raf: number;
}
interface PendingPress {
  id: string;
  el: HTMLElement;
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  viaHandle: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  armed: boolean;
}

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const DROP_MS = 260;
const LONG_PRESS_MS = 320;

@Component({
  standalone: true,
  imports: [RouterLink, ListPicker],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">MENOS DECISÃO, MAIS DIVERSÃO</span>
        <h1>Ordem de jogos<span class="heading-dot">.</span></h1>
        <p>Uma fila que aprende com você e alterna estilos, ritmos e duração.</p>
      </div>
      <button class="button" (click)="load()" [disabled]="loading()">↻ Recalcular</button>
    </div>
    <app-list-picker base="/ordem" [current]="listId()" />
    @if (error()) {
      <div class="error" role="alert">{{ error() }}</div>
    }
    @if (data(); as d) {
      <div class="stats">
        <div>
          <small>NA SUA FILA</small><strong>{{ d.total }} <span>jogos</span></strong>
        </div>
        <div>
          <small>TEMPO ESTIMADO</small><strong>{{ d.estimatedHours }} <span>horas</span></strong>
        </div>
        <div>
          <small>SEU RITMO</small
          ><strong>{{ d.timeFactor.toFixed(2) }}<span> × tempo de referência</span></strong>
        </div>
      </div>
      @if (d.items[0]; as first) {
        <a
          class="next-game"
          [routerLink]="['/jogos', first.game.id]"
          [queryParams]="{ from: 'ordem' }"
          ><div class="next-copy">
            <span class="eyebrow">01 / SUA PRÓXIMA PARTIDA</span>
            <h2>{{ first.game.name }}</h2>
            <div class="tags">
              <span [class]="'badge ' + color(first.game.primaryGenre)">{{
                first.game.primaryGenre
              }}</span
              ><span [class]="'badge ' + color(first.game.desire)"
                >Vontade {{ first.game.desire.toLowerCase() }}</span
              >
            </div>
            <p>
              {{
                first.game.plannedHours === null
                  ? 'Tempo a confirmar'
                  : first.game.plannedHours + ' horas estimadas'
              }}
              · {{ first.score }} pontos
              @if (first.manualPoints) {
                · ajuste manual {{ signed(first.manualPoints) }}
              }
            </p>
            <span class="button primary">Ver jogo e avaliar ↗</span>
          </div>
          <div class="next-cover">
            @if (first.game.coverUrl) {
              <img
                [src]="first.game.coverUrl"
                alt=""
                (error)="$any($event.target).style.display = 'none'"
              />
            }
            <span>{{ first.game.name.slice(0, 1) }}</span>
          </div></a
        >
      }
      <details class="method">
        <summary>Como sua ordem é calculada <span>＋</span></summary>
        <p>
          <b>50% vontade · 35% afinidade · 15% duração.</b> As notas de 1 a 5 alimentam sua
          afinidade com gêneros, mecânicas e ritmos. Campanhas longas e estilos repetidos recebem
          descontos; jogos curtos e mudanças de ritmo recebem bônus.
        </p>
        <div class="tags">
          <span class="badge violet">Gênero repetido −18</span
          ><span class="badge blue">Subgênero repetido até −8</span
          ><span class="badge rose">Longos seguidos −24</span
          ><span class="badge green">Contraste de ritmo +8</span
          ><span class="badge amber">Jogando +8</span>
        </div>
        <p>
          Subgêneros pesam proporcionalmente à sobreposição de tags. A fila também olha os últimos
          três jogos, incluindo concluídos com data. Predecessores cadastrados vêm antes das
          continuações, com espaço para intercalar outros jogos. Finalizados, abandonados e jogos
          sem fim ficam fora.
        </p>
        <p>
          O tempo aprende com a relação entre suas horas reais e as estimativas dos jogos
          finalizados. Estimativas desconhecidas não são inventadas; o total de horas soma apenas os
          tempos disponíveis.
        </p>
        <p>
          <b>Ajuste manual.</b> Arrastar um jogo vira pontos fixos seus (“Manual +12”), somados ao
          score dele em qualquer contexto. O servidor calcula o menor ajuste que leva o jogo à
          posição escolhida; se um predecessor ou o contexto impedir, ele fica na posição possível
          mais próxima. Remova o ajuste no × do chip.
        </p>
      </details>
      <div class="list-toolbar">
        <span>Seu roteiro de próximas partidas</span
        ><span class="muted">Arraste <b aria-hidden="true">⠿</b> para reordenar</span>
      </div>
      <p id="reorder-help" class="sr-only">
        Para reordenar pelo teclado: foque o puxador, pressione espaço para pegar o jogo, use as
        setas para mover, espaço para soltar ou Esc para cancelar.
      </p>
      <div class="sr-only" aria-live="assertive" aria-atomic="true">
        {{ announcement() }}
      </div>
      @if (notice(); as n) {
        <div class="reorder-notice" [class.warn]="!n.exact" role="status">
          <span>{{ n.text }}</span>
          <button type="button" (click)="notice.set(null)" aria-label="Fechar aviso">×</button>
        </div>
      }
      <div
        class="queue-list"
        [class.has-manual]="hasManual(d.items)"
        [class.is-busy]="busyId() !== null"
        (pointerdown)="onPointerDown($event)"
      >
        @for (item of d.items.slice(0, visible()); track item.game.id; let i = $index) {
          <div
            class="queue-row"
            [attr.data-id]="item.game.id"
            [class.saving]="busyId() === item.game.id"
            [class.just-moved]="flash()?.id === item.game.id"
          >
            <button
              type="button"
              class="drag-handle"
              [attr.aria-label]="'Reordenar ' + item.game.name + ', posição ' + (i + 1)"
              aria-describedby="reorder-help"
              [attr.aria-pressed]="keyboardId() === item.game.id"
              [disabled]="busyId() !== null"
              (keydown)="onHandleKey($event, item.game.id)"
              (blur)="onHandleBlur(item.game.id)"
            >
              <span aria-hidden="true">⠿</span>
            </button>
            <a
              class="queue-link"
              draggable="false"
              [routerLink]="['/jogos', item.game.id]"
              [queryParams]="{ from: 'ordem' }"
              ><span class="rank">{{ (i + 1).toString().padStart(2, '0') }}</span>
              <div class="queue-cover">
                @if (item.game.coverUrl) {
                  <img
                    [src]="item.game.coverUrl"
                    alt=""
                    loading="lazy"
                    draggable="false"
                    (error)="$any($event.target).style.display = 'none'"
                  />
                }
                <span>{{ item.game.name.slice(0, 1) }}</span>
              </div>
              <div class="queue-title">
                <h3>{{ item.game.name }}</h3>
                <div class="tags">
                  <span [class]="'badge ' + color(item.game.primaryGenre)">{{
                    item.game.primaryGenre
                  }}</span>
                  @for (t of item.game.secondaryTags; track t) {
                    <span [class]="'badge ' + color(t)">{{ t }}</span>
                  }
                  <span [class]="'badge ' + color(item.game.status)">{{ item.game.status }}</span
                  ><span [class]="'badge ' + color(item.game.desire)">{{ item.game.desire }}</span>
                </div>
                <p>{{ item.reasons.join(' · ') }}</p>
              </div>
              <div class="queue-time">
                {{ item.game.plannedHours === null ? '—' : item.game.plannedHours + ' h'
                }}<small>estimadas</small>
              </div>
              <div class="score">
                @if (busyId() === item.game.id) {
                  <span class="spinner" aria-hidden="true"></span>
                } @else {
                  {{ item.score }}
                }
                <small>pontos</small>
              </div>
              <span class="row-arrow">↗</span></a
            >
            <div class="queue-manual">
              @if (flash(); as f) {
                @if (f.id === item.game.id && f.delta) {
                  <span class="delta-badge" [class.up]="f.delta > 0" [class.down]="f.delta < 0"
                    >{{ signed(f.delta) }} pts</span
                  >
                }
              }
              @if (busyId() === item.game.id) {
                <span class="saving-pill">Recalculando…</span>
              } @else if (item.manualPoints) {
                <span
                  class="manual-chip"
                  [class.neg]="item.manualPoints < 0"
                  [title]="
                    'Ajuste manual: ' + signed(item.manualPoints) + ' pontos somados ao score'
                  "
                  >Manual {{ signed(item.manualPoints)
                  }}<button
                    type="button"
                    class="chip-remove"
                    [disabled]="busyId() !== null"
                    [attr.aria-label]="'Remover ajuste manual de ' + item.game.name"
                    (click)="resetManual(item.game.id, $event)"
                  >
                    ×
                  </button></span
                >
              }
            </div>
          </div>
        }
      </div>
      @if (visible() < d.items.length) {
        <button class="button load-more" (click)="visible.set(visible() + 30)">
          Mostrar mais 30 jogos
        </button>
      }
      @if (d.total === 0) {
        <div class="empty">
          <h2>Nenhum jogo disponível na fila</h2>
          <p>Confira os status e os predecessores na biblioteca.</p>
        </div>
      }
      @if (d.excluded.length) {
        <details class="method">
          <summary>{{ d.excluded.length }} jogos aguardam correção de predecessores</summary>
          @for (e of d.excluded; track e.gameId) {
            <p>{{ e.gameId }}: {{ e.reason }}</p>
          }
        </details>
      }
    } @else if (loading()) {
      <div class="empty">Calculando seu roteiro…</div>
    }`,
})
export class Queue {
  api = inject(Api);
  private settings = inject(ScoringSettingsStore);
  /** Lista cuja fila está na tela (da URL). */
  readonly listId = routeListId('/ordem');
  color = color;
  data = signal<Recommendations | null>(null);
  visible = signal(30);
  error = signal('');
  loading = signal(false);
  /** Jogo aguardando a resposta do servidor após reordenar/zerar. */
  busyId = signal<string | null>(null);
  /** Jogo pego pelo teclado (aria-pressed no puxador). */
  keyboardId = signal<string | null>(null);
  /** Badge de delta mostrado no último jogo movido. */
  flash = signal<{ id: string; delta: number } | null>(null);
  notice = signal<{ text: string; exact: boolean } | null>(null);
  announcement = signal('');

  private host: HTMLElement = inject(ElementRef).nativeElement;
  private cdr = inject(ChangeDetectorRef);
  private drag: DragState | null = null;
  private pending: PendingPress | null = null;
  private suppressClickUntil = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    effect(() => {
      if (this.listId()) untracked(() => void this.load());
    });
    // Clique após arraste não deve navegar para o detalhe.
    const onClick = (e: Event) => {
      if (Date.now() < this.suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onContext = (e: Event) => {
      if (this.pending || this.drag) e.preventDefault();
    };
    const onNativeDrag = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.queue-list')) e.preventDefault();
    };
    this.host.addEventListener('click', onClick, true);
    this.host.addEventListener('contextmenu', onContext);
    this.host.addEventListener('dragstart', onNativeDrag);
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('click', onClick, true);
      this.host.removeEventListener('contextmenu', onContext);
      this.host.removeEventListener('dragstart', onNativeDrag);
      this.clearPending();
      if (this.drag) this.teardown(this.drag);
      if (this.flashTimer) clearTimeout(this.flashTimer);
    });
  }

  signed(n: number) {
    const r = Math.round(n * 10) / 10;
    return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r);
  }
  hasManual(items: QueueEntry[]) {
    return (
      this.flash() !== null ||
      this.busyId() !== null ||
      items.slice(0, this.visible()).some((i) => i.manualPoints)
    );
  }

  async load() {
    const listId = this.listId();
    if (!listId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const next = await this.api.queue(listId);
      if (listId !== this.listId()) return;
      this.settings.syncVersion(listId, next.configVersion);
      // Mesma lista: anima a diferença; outra lista: troca direto.
      if (this.data()?.listId === listId) this.flipTo(next);
      else {
        this.notice.set(null);
        this.visible.set(30);
        this.data.set(next);
      }
    } catch {
      this.error.set('Não foi possível calcular a ordem. Confira a API.');
    } finally {
      this.loading.set(false);
    }
  }

  // ---------------------------------------------------------------- ponteiro

  onPointerDown(e: PointerEvent) {
    if (this.drag || this.pending || this.busyId() || this.loading()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.chip-remove')) return;
    const row = target.closest<HTMLElement>('.queue-row');
    const id = row?.dataset['id'];
    if (!row || !id) return;
    const viaHandle = !!target.closest('.drag-handle');
    const touchLike = e.pointerType !== 'mouse';
    this.pending = {
      id,
      el: row,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      x: e.clientX,
      y: e.clientY,
      viaHandle,
      timer: null,
      armed: !touchLike || viaHandle,
    };
    if (touchLike && !viaHandle) {
      // Long-press: a linha "afunda" levemente e então é arrancada.
      row.classList.add('pressing');
      this.pending.timer = setTimeout(() => {
        const p = this.pending;
        if (!p) return;
        p.armed = true;
        this.startPointerDrag(p, p.x, p.y);
      }, LONG_PRESS_MS);
    }
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    document.addEventListener('touchmove', this.onTouchMove, {
      passive: false,
    });
  }

  private onPointerMove = (e: PointerEvent) => {
    const p = this.pending;
    if (p && e.pointerId === p.pointerId && !this.drag) {
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (!p.armed) {
        // Moveu antes do long-press: é rolagem, não arraste.
        if (dist > 10) this.clearPending();
        return;
      }
      if (dist > (p.pointerType === 'mouse' ? 5 : 3))
        this.startPointerDrag(p, e.clientX, e.clientY);
      return;
    }
    const d = this.drag;
    if (!d || d.mode !== 'pointer' || e.pointerId !== d.pointerId) return;
    const vx = e.clientX - d.lastX;
    d.tilt = Math.max(-4, Math.min(4, d.tilt * 0.75 + vx * 0.35));
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    this.follow(d);
  };
  private onPointerUp = (e: PointerEvent) => {
    if (this.drag?.mode === 'pointer' && e.pointerId === this.drag.pointerId) {
      this.suppressClickUntil = Date.now() + 400;
      this.drop(this.drag);
    } else if (this.pending?.pointerId === e.pointerId) this.clearPending();
  };
  private onPointerCancel = (e: PointerEvent) => {
    if (this.drag?.mode === 'pointer' && e.pointerId === this.drag.pointerId)
      this.cancel(this.drag);
    else if (this.pending?.pointerId === e.pointerId) this.clearPending();
  };
  private onTouchMove = (e: TouchEvent) => {
    // Impede a rolagem nativa enquanto a linha está "na mão".
    if (this.drag || this.pending?.armed) e.preventDefault();
  };
  private onWindowKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.drag?.mode === 'pointer') {
      e.preventDefault();
      this.suppressClickUntil = Date.now() + 400;
      this.cancel(this.drag);
    }
  };

  private clearPending() {
    const p = this.pending;
    if (p) {
      if (p.timer) clearTimeout(p.timer);
      p.el.classList.remove('pressing');
    }
    this.pending = null;
    if (!this.drag) this.removeWindowListeners();
  }
  private removeWindowListeners() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    document.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('keydown', this.onWindowKey);
  }

  private startPointerDrag(p: PendingPress, x: number, y: number) {
    if (p.timer) clearTimeout(p.timer);
    p.el.classList.remove('pressing');
    this.pending = null;
    const d = this.lift(p.id, 'pointer');
    if (!d) return this.removeWindowListeners();
    d.pointerId = p.pointerId;
    d.startX = p.x;
    d.startY = p.y;
    d.lastX = x;
    d.lastY = y;
    try {
      d.el.setPointerCapture(p.pointerId);
    } catch {
      // Ponteiro já liberado pelo navegador: segue sem captura.
    }
    if (p.pointerType !== 'mouse') navigator.vibrate?.(8);
    window.addEventListener('keydown', this.onWindowKey);
    this.follow(d);
    const tick = () => {
      if (this.drag !== d) return;
      const edge = Math.min(110, innerHeight * 0.18);
      let v = 0;
      if (d.lastY < edge) v = -(((edge - d.lastY) / edge) ** 2) * 24;
      else if (d.lastY > innerHeight - edge)
        v = ((d.lastY - (innerHeight - edge)) / edge) ** 2 * 24;
      if (v) {
        window.scrollBy(0, v);
        this.follow(d);
      }
      d.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
  }

  /** A linha segue o ponteiro; vizinhos abrem espaço conforme ela passa. */
  private follow(d: DragState) {
    const dy = d.lastY - d.startY + (scrollY - d.startScroll);
    const dx = (d.lastX - d.startX) * 0.22;
    d.el.style.translate = `${dx}px ${dy}px`;
    d.el.style.rotate = this.reduced ? '' : `${-1.1 + d.tilt}deg`;
    const center = d.snaps[d.from].top + d.height / 2 + dy;
    let over = d.from;
    for (let i = d.from + 1; i < d.snaps.length; i++) {
      if (center > d.snaps[i].top + d.snaps[i].height / 2) over = i;
      else break;
    }
    if (over === d.from)
      for (let i = d.from - 1; i >= 0; i--) {
        if (center < d.snaps[i].top + d.snaps[i].height / 2) over = i;
        else break;
      }
    if (over !== d.over) this.moveOver(d, over);
  }

  // ----------------------------------------------------------------- teclado

  onHandleKey(e: KeyboardEvent, id: string) {
    const d = this.drag;
    const isPick = e.key === ' ' || e.key === 'Enter';
    if (!d) {
      if (!isPick || this.busyId() || this.loading()) return;
      e.preventDefault();
      const lifted = this.lift(id, 'keyboard');
      if (!lifted) return;
      lifted.el.classList.add('kbd');
      this.keyboardId.set(id);
      this.say(
        `${this.nameOf(id)} pego. Posição ${lifted.from + 1} de ${lifted.snaps.length}. Setas para mover, espaço para soltar, Esc para cancelar.`,
      );
      return;
    }
    if (d.mode !== 'keyboard' || d.id !== id) return;
    const last = d.snaps.length - 1;
    const step: Record<string, number> = {
      ArrowUp: d.over - 1,
      ArrowDown: d.over + 1,
      PageUp: d.over - 5,
      PageDown: d.over + 5,
      Home: 0,
      End: last,
    };
    if (e.key in step) {
      e.preventDefault();
      const over = Math.max(0, Math.min(last, step[e.key]));
      if (over === d.over) return;
      this.moveOver(d, over);
      d.el.style.translate = `0px ${this.slotOffset(d, over)}px`;
      this.keepSlotVisible(d);
    } else if (isPick) {
      e.preventDefault();
      this.drop(d);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      this.cancel(d);
    }
  }
  onHandleBlur(id: string) {
    // Perder o foco no meio do movimento cancela (exceto pela reordenação do DOM).
    const d = this.drag;
    if (d?.mode === 'keyboard' && d.id === id && !d.el.classList.contains('dropping'))
      queueMicrotask(() => {
        if (this.drag === d && !d.el.contains(document.activeElement)) this.cancel(d);
      });
  }
  private keepSlotVisible(d: DragState) {
    const top = d.snaps[d.from].top + this.slotOffset(d, d.over) - scrollY;
    const bottom = top + d.height;
    const margin = 90;
    if (top < margin) window.scrollBy({ top: top - margin, behavior: this.behavior() });
    else if (bottom > innerHeight - margin)
      window.scrollBy({ top: bottom - innerHeight + margin, behavior: this.behavior() });
  }

  // ------------------------------------------------------------ mecânica comum

  private rows() {
    return [...this.host.querySelectorAll<HTMLElement>('.queue-row')];
  }
  private list() {
    return this.host.querySelector<HTMLElement>('.queue-list');
  }

  /** "Arranca" a linha da lista: mede vizinhos, eleva e cria o placeholder. */
  private lift(id: string, mode: DragState['mode']): DragState | null {
    const list = this.list();
    const rows = this.rows();
    const from = rows.findIndex((r) => r.dataset['id'] === id);
    if (!list || from < 0) return null;
    // Termina animações FLIP pendentes antes de medir.
    for (const r of rows) r.getAnimations().forEach((a) => a.finish());
    const snaps = rows.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset['id']!, el, top: r.top + scrollY, height: r.height };
    });
    const el = rows[from];
    const height = snaps[from].height;
    const placeholder = document.createElement('span');
    placeholder.className = 'drop-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.top = el.offsetTop + 'px';
    placeholder.style.height = height + 'px';
    list.appendChild(placeholder);
    list.classList.add('is-dragging');
    document.body.classList.add('queue-dragging');
    el.classList.add('lifted');
    // flash/notice só são limpos ao soltar: mudar o layout agora invalidaria as medidas.
    this.drag = {
      id,
      from,
      over: from,
      mode,
      el,
      snaps,
      height,
      placeholder,
      pointerId: -1,
      startX: 0,
      startY: 0,
      startScroll: scrollY,
      lastX: 0,
      lastY: 0,
      tilt: 0,
      raf: 0,
    };
    return this.drag;
  }

  /** Deslocamento vertical do slot `over` em relação à posição original. */
  private slotOffset(d: DragState, over: number) {
    if (over > d.from)
      return d.snaps[over].top + d.snaps[over].height - d.height - d.snaps[d.from].top;
    if (over < d.from) return d.snaps[over].top - d.snaps[d.from].top;
    return 0;
  }

  private moveOver(d: DragState, over: number) {
    d.over = over;
    d.snaps.forEach((s, i) => {
      if (i === d.from) return;
      const shift = d.from < i && i <= over ? -d.height : over <= i && i < d.from ? d.height : 0;
      s.el.style.translate = shift ? `0px ${shift}px` : '';
    });
    d.placeholder.style.translate = `0px ${this.slotOffset(d, over)}px`;
    this.say(`Posição ${over + 1} de ${d.snaps.length}.`);
  }

  /** Solta: a linha "pousa" no slot e então a ordem otimista é aplicada. */
  private drop(d: DragState) {
    cancelAnimationFrame(d.raf);
    const { id, from, over } = d;
    const land = () => {
      this.teardown(d);
      if (over === from) {
        this.say(`${this.nameOf(id)} voltou à posição ${from + 1}.`);
        return;
      }
      const prev = this.data();
      if (!prev) return;
      this.notice.set(null);
      if (this.flashTimer) clearTimeout(this.flashTimer);
      this.flash.set(null);
      const items = [...prev.items];
      const [moved] = items.splice(from, 1);
      items.splice(over, 0, moved);
      this.data.set({ ...prev, items });
      this.cdr.detectChanges();
      this.focusHandle(id, d.mode);
      this.save(id, over + 1, prev, d.mode);
    };
    if (this.reduced) return land();
    d.el.classList.add('dropping');
    d.el.classList.remove('lifted');
    d.el.style.rotate = '';
    d.el.style.translate = `0px ${this.slotOffset(d, over)}px`;
    this.after(d.el, DROP_MS, land);
  }

  /** Esc/cancelamento: tudo volta ao lugar original. */
  private cancel(d: DragState) {
    cancelAnimationFrame(d.raf);
    this.say(`Movimento cancelado. ${this.nameOf(d.id)} na posição ${d.from + 1}.`);
    if (this.reduced) return this.teardown(d);
    d.el.classList.add('dropping');
    d.el.classList.remove('lifted');
    d.el.style.rotate = '';
    d.el.style.translate = '0px 0px';
    for (const s of d.snaps) if (s.el !== d.el) s.el.style.translate = '';
    d.placeholder.style.opacity = '0';
    this.after(d.el, DROP_MS, () => this.teardown(d));
  }

  private after(el: HTMLElement, ms: number, fn: () => void) {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      el.removeEventListener('transitionend', onEnd);
      fn();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'translate') run();
    };
    el.addEventListener('transitionend', onEnd);
    setTimeout(run, ms + 80);
  }

  /** Remove estilos inline sem animar a volta (o DOM já está no lugar certo). */
  private teardown(d: DragState) {
    cancelAnimationFrame(d.raf);
    const list = this.list();
    list?.classList.add('no-anim');
    for (const s of d.snaps) {
      s.el.style.translate = '';
      s.el.style.rotate = '';
      s.el.classList.remove('lifted', 'dropping', 'kbd');
    }
    d.placeholder.remove();
    list?.classList.remove('is-dragging');
    document.body.classList.remove('queue-dragging');
    void list?.offsetHeight; // aplica sem transição
    list?.classList.remove('no-anim');
    try {
      d.el.releasePointerCapture(d.pointerId);
    } catch {
      // Sem captura ativa (modo teclado ou já liberada).
    }
    if (this.drag === d) this.drag = null;
    this.keyboardId.set(null);
    this.removeWindowListeners();
  }

  // ------------------------------------------------------------- servidor

  private async save(
    id: string,
    toPosition: number,
    prev: Recommendations,
    mode: DragState['mode'],
  ) {
    this.busyId.set(id);
    this.error.set('');
    try {
      const r = await this.api.reorder(prev.listId ?? this.listId()!, id, toPosition);
      this.flipTo(r.recommendations);
      this.showFlash(id, r.pointsDelta);
      const name = this.nameOf(id);
      const manual = `ajuste manual ${this.signed(r.manualPoints)} (${this.signed(r.pointsDelta)} agora)`;
      this.notice.set(
        r.exact
          ? {
              exact: true,
              text: `${name} agora está na posição ${r.effectivePosition} · ${manual}.`,
            }
          : {
              exact: false,
              text: `${name} não pode ficar exatamente na posição ${r.requestedPosition} (predecessor ou contexto da fila); ficou na ${r.effectivePosition} · ${manual}.`,
            },
      );
      this.say(this.notice()!.text);
    } catch {
      this.flipTo(prev);
      this.error.set(
        prev.rules.manual
          ? 'Não foi possível salvar a nova ordem. A fila voltou ao estado anterior.'
          : 'O ajuste manual está desativado em Configurações. A fila voltou ao estado anterior.',
      );
      this.say('Erro ao salvar. A ordem anterior foi restaurada.');
    } finally {
      this.busyId.set(null);
      this.cdr.detectChanges();
      this.focusHandle(id, mode);
    }
  }

  async resetManual(id: string, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (this.busyId() || this.drag) return;
    this.busyId.set(id);
    this.error.set('');
    try {
      const r = await this.api.resetManual(this.data()?.listId ?? this.listId()!, id);
      this.flipTo(r.recommendations);
      this.showFlash(id, r.pointsDelta);
      const pos = r.recommendations.items.findIndex((i) => i.game.id === id) + 1;
      this.notice.set({
        exact: true,
        text: `Ajuste manual de ${this.nameOf(id)} removido (${this.signed(r.pointsDelta)} pts)${pos ? '; agora na posição ' + pos : ''}.`,
      });
      this.say(this.notice()!.text);
    } catch {
      this.error.set('Não foi possível remover o ajuste manual.');
    } finally {
      this.busyId.set(null);
    }
  }

  /** FLIP: mede, troca os dados, mede de novo e anima cada linha do antigo ao novo lugar. */
  private flipTo(next: Recommendations) {
    const before = new Map(
      this.rows().map((r) => [r.dataset['id']!, r.getBoundingClientRect().top]),
    );
    this.data.set(next);
    this.cdr.detectChanges();
    if (this.reduced) return;
    for (const row of this.rows()) {
      const old = before.get(row.dataset['id']!);
      if (old === undefined) {
        row.animate(
          [
            { opacity: 0, transform: 'translateY(10px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 260, easing: EASE },
        );
        continue;
      }
      const dy = old - row.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
        duration: Math.min(620, 340 + Math.abs(dy) * 0.25),
        easing: EASE,
      });
    }
  }

  private showFlash(id: string, delta: number) {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flash.set({ id, delta });
    this.flashTimer = setTimeout(() => this.flash.set(null), 6000);
  }
  private focusHandle(id: string, mode: DragState['mode']) {
    if (mode !== 'keyboard') return;
    this.host
      .querySelector<HTMLElement>(`.queue-row[data-id="${CSS.escape(id)}"] .drag-handle`)
      ?.focus({ preventScroll: true });
  }
  private nameOf(id: string) {
    return this.data()?.items.find((i) => i.game.id === id)?.game.name ?? 'Jogo';
  }
  private say(text: string) {
    this.announcement.set(text);
  }
  private behavior(): ScrollBehavior {
    return this.reduced ? 'auto' : 'smooth';
  }
}
