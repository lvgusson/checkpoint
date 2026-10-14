import {
  ApplicationRef,
  Component,
  ElementRef,
  EnvironmentInjector,
  Injectable,
  afterNextRender,
  computed,
  createComponent,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { ScoredGame } from '../../../packages/core/src/models';
import { Api } from './api';

type FinishGame = Pick<ScoredGame, 'id' | 'name' | 'actualHours' | 'rating' | 'notes'>;

/** Return the local calendar date as YYYY-MM-DD. */
export function localToday(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Ratings from 1 to 5 in half-point steps. */
const STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const CLOSE_DRAG_PX = 90;

/** Shared completion dialog with rating, hours, notes, and local finish date. Mobile uses a bottom sheet; native dialog contains focus and handles Escape. */
@Component({
  selector: 'app-finish-sheet',
  standalone: true,
  template: `<dialog
    #dlg
    class="finish-sheet"
    aria-labelledby="finish-title"
    aria-describedby="finish-date"
    (cancel)="$event.preventDefault(); close(false)"
  >
    <form class="finish-body" (submit)="$event.preventDefault(); save()" novalidate>
      <div
        class="finish-grabber"
        aria-hidden="true"
        (pointerdown)="dragStart($event)"
        (pointermove)="dragMove($event)"
        (pointerup)="dragEnd()"
        (pointercancel)="dragEnd()"
      ></div>
      <header class="finish-head">
        <span class="eyebrow">FINALIZAR JOGO</span>
        <h2 id="finish-title">{{ game().name }}</h2>
        <p class="muted small" id="finish-date">
          Finalizado em <time [attr.datetime]="today">{{ todayLabel }}</time>
        </p>
      </header>

      <fieldset class="finish-field">
        <legend>
          Nota <span class="finish-value">{{ rating() === null ? '—' : rating() + ' / 5' }}</span>
        </legend>
        <div class="finish-stars">
          @for (n of stars; track n) {
            <span class="finish-star" [style.--fill]="fill(n)">
              ★
              @if (n === 1) {
                <label class="whole"
                  ><input
                    type="radio"
                    name="finish-rating"
                    [value]="1"
                    [checked]="rating() === 1"
                    (change)="rating.set(1)"
                    [attr.aria-label]="'1 estrela'"
                /></label>
              } @else {
                <label class="half left"
                  ><input
                    type="radio"
                    name="finish-rating"
                    [value]="n - 0.5"
                    [checked]="rating() === n - 0.5"
                    (change)="rating.set(n - 0.5)"
                    [attr.aria-label]="n - 0.5 + ' estrelas'" /></label
                ><label class="half right"
                  ><input
                    type="radio"
                    name="finish-rating"
                    [value]="n"
                    [checked]="rating() === n"
                    (change)="rating.set(n)"
                    [attr.aria-label]="n + ' estrelas'"
                /></label>
              }
            </span>
          }
        </div>
      </fieldset>

      <label class="finish-field" for="finish-hours">
        <span>Tempo de jogo (horas)</span>
        <input
          id="finish-hours"
          name="actualHours"
          autocomplete="off"
          type="number"
          inputmode="decimal"
          min="0"
          max="100000"
          step="0.5"
          placeholder="Ex.: 32…"
          [value]="hours()"
          (input)="hours.set($any($event.target).value)"
          [attr.aria-invalid]="hoursInvalid()"
        />
        @if (hoursInvalid()) {
          <small class="field-error">Informe um número de horas igual ou maior que zero.</small>
        }
      </label>

      <label class="finish-field" for="finish-notes">
        <span>Avaliação</span>
        <textarea
          id="finish-notes"
          name="notes"
          autocomplete="off"
          rows="4"
          maxlength="10000"
          placeholder="O que achou do jogo…"
          [value]="notes()"
          (input)="notes.set($any($event.target).value)"
        ></textarea>
      </label>

      @if (error()) {
        <div class="error" role="alert">{{ error() }}</div>
      }
      <div class="finish-actions">
        <button type="button" class="button" (click)="close(false)" [disabled]="saving()">
          Cancelar
        </button>
        <button type="submit" class="button primary" [disabled]="!canSave()">
          {{ saving() ? 'Salvando…' : 'Finalizar' }}
        </button>
      </div>
    </form>
  </dialog>`,
  styles: `
    .finish-sheet {
      border: 0;
      padding: 0;
      margin: auto;
      width: min(480px, calc(100vw - 32px));
      max-height: calc(100dvh - 48px);
      border-radius: 18px;
      background: var(--surface);
      color: var(--text);
      box-shadow: 0 24px 64px var(--shadow-strong);
      overflow: auto;
      overscroll-behavior: contain;
    }
    .finish-sheet[open] {
      animation: finish-in 180ms ease-out;
    }
    .finish-sheet::backdrop {
      background: var(--scrim);
    }
    .finish-body {
      display: grid;
      gap: 18px;
      padding: 8px 20px 20px;
    }
    .finish-grabber {
      display: none;
    }
    .finish-head h2 {
      margin: 4px 0 2px;
      font-size: 1.3rem;
      overflow-wrap: anywhere;
    }
    .finish-head p {
      margin: 0;
    }
    .finish-field {
      display: grid;
      gap: 6px;
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
    .finish-field legend,
    .finish-field > span {
      font-weight: 600;
      font-size: 0.9rem;
      padding: 0;
      margin-bottom: 6px;
    }
    .finish-value {
      font-weight: 500;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      margin-left: 6px;
    }
    .finish-field input,
    .finish-field textarea {
      font: inherit;
      font-size: 16px;
      width: 100%;
      box-sizing: border-box;
      min-height: 44px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
    }
    .finish-field textarea {
      resize: vertical;
    }
    .finish-stars {
      display: flex;
      gap: 4px;
    }
    .finish-star {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: 48px;
      height: 48px;
      font-size: 40px;
      line-height: 1;
      background: linear-gradient(90deg, var(--star) var(--fill, 0%), var(--faint) var(--fill, 0%));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      user-select: none;
      touch-action: manipulation;
    }
    .finish-star:has(input:focus-visible) {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: 8px;
    }
    .finish-star label {
      position: absolute;
      top: 0;
      bottom: 0;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .finish-star .whole {
      left: 0;
      right: 0;
    }
    .finish-star .left {
      left: 0;
      width: 50%;
    }
    .finish-star .right {
      right: 0;
      width: 50%;
    }
    .finish-star input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      margin: 0;
    }
    .finish-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .finish-actions .button {
      min-height: 48px;
      touch-action: manipulation;
    }
    @keyframes finish-in {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }
    @media (max-width: 640px) {
      .finish-sheet {
        width: 100%;
        max-width: 100%;
        margin: auto 0 0;
        border-radius: 20px 20px 0 0;
        max-height: calc(100dvh - 24px);
      }
      .finish-sheet[open] {
        animation: finish-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .finish-body {
        padding: 0 16px calc(16px + env(safe-area-inset-bottom));
      }
      .finish-grabber {
        display: block;
        position: sticky;
        top: 0;
        height: 28px;
        margin: 0 -16px;
        touch-action: none;
        cursor: grab;
        background: var(--surface);
      }
      .finish-grabber::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 10px;
        width: 40px;
        height: 5px;
        margin-left: -20px;
        border-radius: 3px;
        background: var(--faint);
      }
      @keyframes finish-up {
        from {
          transform: translateY(100%);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .finish-sheet[open] {
        animation: none;
      }
    }
  `,
})
export class FinishSheet {
  private api = inject(Api);
  readonly game = input.required<FinishGame>();
  readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  /** Called once on close; true means saved. Assigned by FinishDialog. */
  done: (saved: boolean) => void = () => {};

  readonly stars = [1, 2, 3, 4, 5];
  readonly today = localToday();
  readonly todayLabel = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  readonly rating = signal<number | null>(null);
  readonly hours = signal('');
  readonly notes = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  private parsedHours = computed(() => {
    const v = this.hours().trim().replace(',', '.');
    return v === '' ? null : Number(v);
  });
  readonly hoursInvalid = computed(() => {
    const h = this.parsedHours();
    return h !== null && (!Number.isFinite(h) || h < 0 || h > 100000);
  });
  readonly canSave = computed(
    () => !this.saving() && STEPS.includes(this.rating() ?? 0) && !this.hoursInvalid(),
  );
  private closed = false;
  private drag: { id: number; y: number; dy: number } | null = null;
  private prevOverflow = '';

  constructor() {
    afterNextRender(() => {
      const g = this.game();
      this.rating.set(STEPS.includes(g.rating ?? 0) ? g.rating : null);
      this.hours.set(g.actualHours === null ? '' : String(g.actualHours));
      this.notes.set(g.notes ?? '');
      this.prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      const el = this.dlg().nativeElement;
      // Native dialog handles Escape and focus navigation; dismiss backdrop clicks.
      el.addEventListener('click', (e) => this.onBackdrop(e));
      el.showModal();
    });
  }

  /** Compute the star fill percentage from the rating. */
  fill(n: number) {
    const r = this.rating() ?? 0;
    return r >= n ? '100%' : r >= n - 0.5 ? '50%' : '0%';
  }

  onBackdrop(e: MouseEvent) {
    // A click on the dialog element outside content selects the backdrop.
    if (e.target === this.dlg().nativeElement && !this.saving()) this.close(false);
  }

  dragStart(e: PointerEvent) {
    this.drag = { id: e.pointerId, y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  dragMove(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    d.dy = Math.max(0, e.clientY - d.y);
    const el = this.dlg().nativeElement;
    el.style.transition = 'none';
    el.style.transform = `translateY(${d.dy}px)`;
  }
  dragEnd() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const el = this.dlg().nativeElement;
    el.style.transition = 'transform 160ms ease-out';
    if (d.dy > CLOSE_DRAG_PX && !this.saving()) {
      el.style.transform = 'translateY(100%)';
      setTimeout(() => this.close(false), 160);
    } else el.style.transform = '';
  }

  async save() {
    if (!this.canSave()) return;
    const g = this.game();
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.save(g.id, {
        rating: this.rating(),
        actualHours: this.parsedHours(),
        notes: this.notes().trim(),
        status: 'Finalizado',
        finishedAt: this.today,
      });
      this.close(true);
    } catch (e) {
      const msg = (e as { error?: { error?: { message?: string } } }).error?.error?.message;
      this.error.set(
        msg
          ? 'Não foi possível salvar: ' + msg + '. Corrija e tente de novo.'
          : 'Não foi possível salvar. Verifique a conexão e tente de novo.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  close(saved: boolean) {
    if (this.closed) return;
    this.closed = true;
    const el = this.dlg().nativeElement;
    if (el.open) el.close();
    document.documentElement.style.overflow = this.prevOverflow;
    this.done(saved);
  }
}

/** Open the shared completion dialog. */
@Injectable({ providedIn: 'root' })
export class FinishDialog {
  private appRef = inject(ApplicationRef);
  private injector = inject(EnvironmentInjector);

  /** Resolve true after saving or false after dismissal. */
  open(game: FinishGame): Promise<boolean> {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const ref = createComponent(FinishSheet, {
        environmentInjector: this.injector,
        hostElement: host,
      });
      ref.setInput('game', game);
      ref.instance.done = (saved) => {
        this.appRef.detachView(ref.hostView);
        ref.destroy();
        host.remove();
        resolve(saved);
      };
      this.appRef.attachView(ref.hostView);
      ref.changeDetectorRef.detectChanges();
    });
  }
}
