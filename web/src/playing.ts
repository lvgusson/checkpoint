import { Component, inject, input } from '@angular/core';
import type { ScoredGame } from '../../shared/models';
import { Api } from './api';

/** Toggle the persisted playing status without changing the game's priority. */
@Component({
  selector: 'app-playing',
  standalone: true,
  template: `<button
    type="button"
    class="icon-button playing-button"
    [class.on]="game().status === 'Jogando'"
    [attr.aria-pressed]="game().status === 'Jogando'"
    [attr.aria-label]="
      game().status === 'Jogando' ? 'Pausar ' + game().name : 'Começar a jogar ' + game().name
    "
    [title]="
      game().status === 'Jogando'
        ? 'Pausar e devolver à fila'
        : 'Começar a jogar: registrar início hoje'
    "
    (click)="toggle($event)"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 7h10c2 0 3.4 1.5 3.8 3.5l1 6c.4 2.5-2 3.8-3.7 2.2L15.5 16h-7l-2.6 2.7c-1.7 1.6-4.1.3-3.7-2.2l1-6C3.6 8.5 5 7 7 7Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linejoin="round"
      />
      <path
        d="M7 10v5m-2.5-2.5h5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
      <circle cx="16" cy="11" r="1" fill="currentColor" />
      <circle cx="18" cy="14" r="1" fill="currentColor" />
    </svg>
  </button>`,
  styles: `
    .playing-button.on {
      color: var(--accent-ink);
      background: var(--accent-soft);
    }
    .playing-button {
      min-width: 44px;
      min-height: 44px;
    }
    .playing-button svg {
      width: 23px;
      height: 23px;
    }
  `,
})
export class PlayingButton {
  private api = inject(Api);
  readonly game = input.required<ScoredGame>();

  async toggle(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    await this.api.togglePlaying(this.game());
  }
}
