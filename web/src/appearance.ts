// Aparência (tema, cor de destaque e logo), por usuário, no localStorage.
//
// O index.html tem um script inline que lê LAST_KEY e aplica data-theme/data-accent em <html>
// antes do 1º paint (sem "flash" do tema errado). Este serviço mantém as duas chaves:
// a do usuário (checkpoint:appearance:<uid>) e a "última usada" (LAST_KEY), lida antes de
// sabermos quem está logado. Ficar no navegador basta: é preferência visual, e um app de
// celular é quase sempre um dispositivo só. Sincronizar entre aparelhos exigiria uma
// tabela de preferências; fica para quando houver demanda.
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth/auth.service';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Accent = 'green' | 'blue' | 'violet' | 'orange' | 'rose';
export type LogoChoice = 'monogram' | 'flag' | 'ring' | 'pixel' | 'custom';

export interface Appearance {
  theme: ThemeChoice;
  accent: Accent;
  logo: LogoChoice;
  /** data URL (PNG/JPEG/WebP/SVG) quando logo = 'custom'. */
  customLogo: string | null;
}

export const ACCENTS: { id: Accent; label: string; light: string; dark: string }[] = [
  { id: 'green', label: 'Verde', light: '#116747', dark: '#4cc08a' },
  { id: 'blue', label: 'Azul', light: '#1f5fae', dark: '#79aef0' },
  { id: 'violet', label: 'Violeta', light: '#6b40b0', dark: '#b69bf0' },
  { id: 'orange', label: 'Laranja', light: '#a84a15', dark: '#f0a06a' },
  { id: 'rose', label: 'Rosa', light: '#a92d57', dark: '#f08fb0' },
];
export const LOGOS: { id: Exclude<LogoChoice, 'custom'>; label: string }[] = [
  { id: 'monogram', label: 'Monograma' },
  { id: 'flag', label: 'Bandeira' },
  { id: 'ring', label: 'Save point' },
  { id: 'pixel', label: 'Pixel' },
];
/** Fundo da barra do navegador (meta theme-color) por tema. */
const BAR = { light: '#f6f8f7', dark: '#0e1412' } as const;

export const LAST_KEY = 'checkpoint:appearance:last';
const PREFIX = 'checkpoint:appearance:';
/** Teto do logo enviado (o data URL fica no localStorage, que tem ~5 MB por origem). */
export const MAX_LOGO_BYTES = 200 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export const DEFAULTS: Appearance = {
  theme: 'system',
  accent: 'green',
  logo: 'monogram',
  customLogo: null,
};

function read(key: string): Appearance | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: Appearance) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sem espaço ou bloqueado: vale só nesta sessão.
  }
}
export function sanitize(v: Partial<Appearance> | null | undefined): Appearance {
  const theme = (['system', 'light', 'dark'] as const).find((t) => t === v?.theme);
  const accent = ACCENTS.find((a) => a.id === v?.accent)?.id;
  const custom =
    typeof v?.customLogo === 'string' &&
    /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v.customLogo)
      ? v.customLogo
      : null;
  const logo =
    v?.logo === 'custom' && custom
      ? 'custom'
      : (LOGOS.find((l) => l.id === v?.logo)?.id ?? 'monogram');
  return {
    theme: theme ?? DEFAULTS.theme,
    accent: accent ?? DEFAULTS.accent,
    logo,
    customLogo: custom,
  };
}

/** Valida o arquivo do logo e devolve o data URL (ou lança Error com a mensagem). */
export function readLogoFile(file: File): Promise<string> {
  if (!LOGO_TYPES.includes(file.type))
    return Promise.reject(new Error('Use uma imagem PNG, JPG, WebP ou SVG.'));
  if (file.size > MAX_LOGO_BYTES)
    return Promise.reject(new Error('A imagem passa de 200 KB. Reduza e tente de novo.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

@Injectable({ providedIn: 'root' })
export class AppearanceStore {
  private auth = inject(AuthService);
  readonly value = signal<Appearance>(read(LAST_KEY) ?? DEFAULTS);
  private systemDark = signal(
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  );
  /** Tema efetivo (resolve "sistema"). */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const t = this.value().theme;
    return t === 'system' ? (this.systemDark() ? 'dark' : 'light') : t;
  });
  private owner: string | null = null;

  constructor() {
    if (typeof matchMedia === 'function')
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) =>
        this.systemDark.set(e.matches),
      );
    // Troca de usuário: carrega a aparência dele (ou mantém a atual como ponto de partida).
    effect(() => {
      const uid = this.auth.user()?.id ?? 'local';
      if (uid === this.owner) return;
      this.owner = uid;
      const mine = read(PREFIX + uid);
      if (mine) this.value.set(mine);
    });
    effect(() => {
      const v = this.value();
      const theme = this.resolved();
      const html = document.documentElement;
      html.dataset['theme'] = theme;
      html.dataset['accent'] = v.accent;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
      write(LAST_KEY, v);
      if (this.owner) write(PREFIX + this.owner, v);
    });
  }

  update(patch: Partial<Appearance>) {
    this.value.update((v) => sanitize({ ...v, ...patch }));
  }
  reset() {
    this.value.set(DEFAULTS);
  }
}
