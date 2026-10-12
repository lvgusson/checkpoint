import { Component, inject, signal } from '@angular/core';
import {
  ACCENTS,
  AppearanceStore,
  LOGOS,
  readLogoFile,
  type Accent,
  type LogoChoice,
  type ThemeChoice,
} from './appearance';
import { Logo } from './logo';
import { AuthService } from './auth/auth.service';

/** Tema, cor de destaque, logo e conta. Tudo é aplicado na hora (sem botão salvar). */
@Component({
  standalone: true,
  imports: [Logo],
  template: `<div class="page-heading">
      <div>
        <h1>Aparência<span class="heading-dot">.</span></h1>
        <p>Tema, cor e logo deste navegador. As mudanças valem na hora.</p>
      </div>
    </div>

    <section class="panel">
      <fieldset>
        <legend><h2>Tema</h2></legend>
        <div class="choices three">
          @for (t of themes; track t.id) {
            <label class="choice" [class.selected]="store.value().theme === t.id">
              <input
                type="radio"
                name="theme"
                [value]="t.id"
                [checked]="store.value().theme === t.id"
                (change)="store.update({ theme: t.id })"
              />
              <span class="theme-preview" [attr.data-preview]="t.id" aria-hidden="true"
                ><i></i><i></i
              ></span>
              <span class="choice-label">{{ t.label }}</span>
              <small>{{ t.hint }}</small>
            </label>
          }
        </div>
      </fieldset>
    </section>

    <section class="panel">
      <fieldset>
        <legend><h2>Cor de destaque</h2></legend>
        <div class="choices swatches">
          @for (a of accents; track a.id) {
            <label class="choice swatch" [class.selected]="store.value().accent === a.id">
              <input
                type="radio"
                name="accent"
                [value]="a.id"
                [checked]="store.value().accent === a.id"
                (change)="setAccent(a.id)"
              />
              <span
                class="dot"
                aria-hidden="true"
                [style.background]="store.resolved() === 'dark' ? a.dark : a.light"
              ></span>
              <span class="choice-label">{{ a.label }}</span>
            </label>
          }
        </div>
        <div class="sample" aria-hidden="true">
          <span class="button primary">Botão principal</span>
          <span class="chip">Fixado</span>
          <span class="score">87 <small>pontos</small></span>
        </div>
      </fieldset>
    </section>

    <section class="panel">
      <fieldset>
        <legend><h2>Logo</h2></legend>
        <div class="choices logos">
          @for (l of logos; track l.id) {
            <label class="choice logo-choice" [class.selected]="store.value().logo === l.id">
              <input
                type="radio"
                name="logo"
                [value]="l.id"
                [checked]="store.value().logo === l.id"
                (change)="setLogo(l.id)"
              />
              <app-logo [variant]="l.id" />
              <span class="choice-label">{{ l.label }}</span>
            </label>
          }
          @if (store.value().customLogo) {
            <label class="choice logo-choice" [class.selected]="store.value().logo === 'custom'">
              <input
                type="radio"
                name="logo"
                value="custom"
                [checked]="store.value().logo === 'custom'"
                (change)="setLogo('custom')"
              />
              <app-logo variant="custom" />
              <span class="choice-label">Sua imagem</span>
            </label>
          }
        </div>
        <div class="upload">
          <label class="button">
            Enviar imagem
            <input
              class="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              (change)="upload($event)"
            />
          </label>
          @if (store.value().customLogo) {
            <button type="button" class="button" (click)="removeCustom()">Remover imagem</button>
          }
          <small>PNG, JPG, WebP ou SVG, até 200 KB. Quadrada fica melhor.</small>
        </div>
        @if (logoError()) {
          <p class="form-error" role="alert">{{ logoError() }}</p>
        }
      </fieldset>
    </section>

    <section class="panel account">
      <h2>Conta</h2>
      @if (auth.user(); as user) {
        <p class="muted">{{ user.email }}</p>
        <div class="row">
          <button type="button" class="button" (click)="auth.signOut()">Sair</button>
          <button type="button" class="button" (click)="store.reset()">
            Restaurar aparência padrão
          </button>
        </div>
      } @else {
        <p class="muted">Modo local, sem login.</p>
        <button type="button" class="button" (click)="store.reset()">
          Restaurar aparência padrão
        </button>
      }
    </section>`,
  styles: `
    fieldset {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
    legend {
      padding: 0;
    }
    legend h2,
    .account h2 {
      margin: 0 0 14px;
      font-size: 19px;
    }
    .choices {
      display: grid;
      gap: 10px;
    }
    .choices.three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .choices.swatches {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .choices.logos {
      grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    }
    .choice {
      position: relative;
      display: grid;
      justify-items: center;
      gap: 8px;
      margin: 0 !important;
      padding: 14px 10px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      cursor: pointer;
      text-align: center;
      font-weight: 500 !important;
      transition:
        border-color 0.15s,
        background-color 0.15s;
    }
    .choice input {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: 0;
      opacity: 0;
      pointer-events: none;
    }
    .choice:has(input:focus-visible) {
      outline: 3px solid var(--accent-bright);
      outline-offset: 2px;
    }
    .choice.selected {
      border-color: var(--accent);
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1px var(--accent);
    }
    .choice-label {
      font-size: 14px;
      color: var(--text);
    }
    .choice small {
      font-size: 12px;
      color: var(--muted);
    }
    .theme-preview {
      display: grid;
      grid-template-columns: 1fr 1fr;
      width: 64px;
      height: 40px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .theme-preview i:first-child {
      background: #f6f8f7;
    }
    .theme-preview i:last-child {
      background: #0e1412;
    }
    .theme-preview[data-preview='light'] i:last-child {
      background: #ffffff;
    }
    .theme-preview[data-preview='dark'] i:first-child {
      background: #151d1a;
    }
    .swatch .dot {
      width: 32px;
      height: 32px;
      margin: 0;
      border-radius: 50%;
      box-shadow: inset 0 0 0 2px #ffffff40;
    }
    .logo-choice app-logo {
      --logo-size: 44px;
    }
    .sample {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 14px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    .chip {
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--accent-line);
      background: var(--accent-soft);
      color: var(--accent-ink);
      font-size: 12px;
      font-weight: 700;
    }
    .score {
      font:
        700 20px Manrope,
        sans-serif;
      color: var(--accent);
    }
    .score small {
      font-size: 11px;
      color: var(--muted);
      font-weight: 400;
    }
    .upload,
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
    }
    /* O input de arquivo fica escondido dentro do botão (o .panel global daria width 100%). */
    .upload label.button {
      position: relative;
      margin: 0;
      font-size: 12px;
    }
    .upload label.button:has(input:focus-visible) {
      outline: 3px solid var(--accent-bright);
      outline-offset: 3px;
    }
    .upload input[type='file'] {
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
    }
    .upload small {
      color: var(--muted);
      font-size: 12px;
    }
    .form-error {
      color: var(--danger);
      font-size: 13px;
    }
    @media (max-width: 600px) {
      .choices.three {
        grid-template-columns: 1fr;
      }
      .choices.three .choice {
        grid-template-columns: auto 1fr;
        justify-items: start;
        text-align: left;
        align-items: center;
        column-gap: 14px;
      }
      .choices.three .theme-preview {
        grid-row: span 2;
      }
      .choices.swatches {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class AppearancePage {
  readonly store = inject(AppearanceStore);
  readonly auth = inject(AuthService);
  readonly accents = ACCENTS;
  readonly logos = LOGOS;
  readonly logoError = signal('');
  readonly themes: { id: ThemeChoice; label: string; hint: string }[] = [
    { id: 'system', label: 'Sistema', hint: 'Segue o celular' },
    { id: 'light', label: 'Claro', hint: 'Sempre claro' },
    { id: 'dark', label: 'Escuro', hint: 'Sempre escuro' },
  ];

  setAccent(accent: Accent) {
    this.store.update({ accent });
  }
  setLogo(logo: LogoChoice) {
    this.logoError.set('');
    this.store.update({ logo });
  }
  async upload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.logoError.set('');
    try {
      const customLogo = await readLogoFile(file);
      this.store.update({ customLogo, logo: 'custom' });
    } catch (err) {
      this.logoError.set((err as Error).message);
    }
  }
  removeCustom() {
    this.store.update({ customLogo: null, logo: 'monogram' });
  }
}
