import { Component, input } from '@angular/core';

/**
 * Ícone do app (espada fincada na fogueira, o mesmo de web/public/favicon.svg).
 * `mono`: silhueta sem fundo em currentColor (ex.: botão "Jogar já" desligado);
 * sem `mono`: cores originais, com o fundo arredondado.
 */
@Component({
  selector: 'app-bonfire',
  standalone: true,
  template: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    @if (!mono()) {
      <rect class="bg" width="64" height="64" rx="14" />
    }
    <path
      class="fire"
      d="M32 24c6 7 17 11 17 22 0 6-7 9-17 9s-17-3-17-9c0-7 4-10 7-16 1 5 3 7 6 8 0-6 1-10 4-14z"
    />
    <path class="blade" d="M27.5 20h9v28l-4.5 6.5-4.5-6.5z" />
    <path class="blade-shade" d="M32 20h4.5v28L32 54.5z" />
    <rect class="guard" x="16" y="16" width="32" height="6.5" rx="3.2" />
    <rect class="grip" x="29" y="9" width="6" height="8" />
    <circle class="guard" cx="32" cy="8" r="4.5" />
    <path
      class="core"
      d="M32 36c3.5 4.5 9 7 9 12.5 0 4.5-4.5 6.5-9 6.5s-9-2-9-6.5c0-5.5 5.5-8 9-12.5z"
    />
    <path class="ash" d="M10 57c5-5 13-7 22-7s17 2 22 7z" />
  </svg>`,
  host: { '[class.mono]': 'mono()' },
  styles: `
    :host {
      display: inline-grid;
      width: var(--bonfire-size, 24px);
      height: var(--bonfire-size, 24px);
      flex-shrink: 0;
    }
    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .bg {
      fill: #1a1030;
    }
    .fire {
      fill: #ff7a3d;
    }
    .blade {
      fill: #e9e5f5;
    }
    .blade-shade {
      fill: #b9b0d6;
    }
    .guard {
      fill: #f2b84b;
    }
    .grip {
      fill: #c98a2b;
    }
    .core {
      fill: #ffc857;
    }
    .ash {
      fill: #5b3f8c;
    }
    :host(.mono) path,
    :host(.mono) rect,
    :host(.mono) circle {
      fill: currentColor;
    }
    :host(.mono) .fire {
      opacity: 0.55;
    }
    :host(.mono) .ash {
      opacity: 0.35;
    }
    :host(.mono) .core {
      opacity: 0.25;
    }
    :host(.mono) .blade-shade {
      opacity: 0.7;
    }
  `,
})
export class Bonfire {
  readonly mono = input(false);
}
