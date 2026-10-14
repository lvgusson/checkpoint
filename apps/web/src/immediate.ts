import { Component, inject, input, output, signal } from '@angular/core';
import type { Desire } from '../../../packages/core/src/models';
import { Api, previousDesire, rememberDesire } from './api';
import { Bonfire } from './bonfire';

/** Toggle immediate desire using the app icon; emit optimistic changes and restore the original desire after failure. */
@Component({
  selector: 'app-immediate',
  standalone: true,
  imports: [Bonfire],
  template: `<button
    type="button"
    class="immediate-btn"
    [class.on]="on()"
    [attr.aria-pressed]="on()"
    [attr.aria-label]="
      on()
        ? 'Tirar ' + game().name + ' da vontade imediata'
        : 'Jogar ' + game().name + ' já: vontade imediata, vai para o topo da fila'
    "
    [title]="on() ? 'Voltar à vontade anterior' : 'Vontade imediata: vai para o topo da fila'"
    [disabled]="busy()"
    (click)="toggle($event)"
  >
    <app-bonfire [mono]="!on()" />
  </button>`,
})
export class ImmediateButton {
  private api = inject(Api);
  readonly game = input.required<{ id: string; name: string; desire: Desire }>();
  readonly changed = output<Desire>();
  readonly failed = output<string>();
  /** Gravado no servidor (a fila já pode ser relida). */
  readonly saved = output<void>();
  readonly busy = signal(false);
  on = () => this.game().desire === 'Imediata';

  async toggle(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (this.busy()) return;
    const g = this.game();
    const next: Desire = g.desire === 'Imediata' ? previousDesire(g.id) : 'Imediata';
    if (next === 'Imediata') rememberDesire(g.id, g.desire);
    this.busy.set(true);
    this.changed.emit(next);
    try {
      await this.api.setDesire(g.id, next);
      this.saved.emit();
    } catch {
      this.changed.emit(g.desire);
      this.failed.emit(`Não foi possível mudar a vontade de ${g.name}.`);
    } finally {
      this.busy.set(false);
    }
  }
}
