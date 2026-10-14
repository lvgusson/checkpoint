import { Component, computed, inject, input } from '@angular/core';
import { AppearanceStore, type LogoChoice } from './appearance';
import { Bonfire } from './bonfire';

/**
 * Marca do Checkpoint. As variações são formas geométricas simples (pedido explícito de
 * logos próprios) e usam currentColor/var(--accent), então seguem tema e destaque.
 */
@Component({
  selector: 'app-logo',
  standalone: true,
  imports: [Bonfire],
  template: `@switch (choice()) {
    @case ('bonfire') {
      <app-bonfire />
    }
    @case ('custom') {
      <img class="logo-img" [src]="store.value().customLogo" alt="" />
    }
    @case ('flag') {
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="var(--accent)" />
        <path d="M14 30V10" stroke="var(--on-accent)" stroke-width="3" stroke-linecap="round" />
        <path d="M15.5 11h12l-3.2 4.6L27.5 20h-12z" fill="var(--on-accent)" />
      </svg>
    }
    @case ('ring') {
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="var(--accent)" />
        <circle cx="20" cy="20" r="10.5" fill="none" stroke="var(--on-accent)" stroke-width="3" />
        <path
          d="M15.5 20.4l3.2 3.2 6-6.4"
          fill="none"
          stroke="var(--on-accent)"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    }
    @case ('pixel') {
      <svg viewBox="0 0 40 40" aria-hidden="true" shape-rendering="crispEdges">
        <rect width="40" height="40" rx="11" fill="var(--accent)" />
        <g fill="var(--on-accent)">
          <rect x="14" y="10" width="12" height="4" />
          <rect x="10" y="14" width="4" height="12" />
          <rect x="14" y="26" width="12" height="4" />
          <rect x="26" y="14" width="4" height="4" />
          <rect x="26" y="22" width="4" height="4" />
        </g>
      </svg>
    }
    @default {
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="var(--accent)" />
        <path
          d="M25.5 14.2a8.5 8.5 0 1 0 0 11.6"
          fill="none"
          stroke="var(--on-accent)"
          stroke-width="3.6"
          stroke-linecap="round"
        />
        <circle
          cx="29"
          cy="11"
          r="3"
          fill="var(--accent-bright)"
          stroke="var(--on-accent)"
          stroke-width="1.5"
        />
      </svg>
    }
  }`,
  styles: `
    :host {
      display: inline-grid;
      flex-shrink: 0;
      width: var(--logo-size, 38px);
      height: var(--logo-size, 38px);
    }
    app-bonfire {
      --bonfire-size: 100%;
    }
    svg,
    .logo-img {
      width: 100%;
      height: 100%;
      border-radius: 11px;
    }
    .logo-img {
      object-fit: cover;
    }
  `,
})
export class Logo {
  readonly store = inject(AppearanceStore);
  /** Pré-visualização de uma variação específica (tela de aparência). */
  readonly variant = input<LogoChoice | null>(null);
  readonly choice = computed(() => this.variant() ?? this.store.value().logo);
}
