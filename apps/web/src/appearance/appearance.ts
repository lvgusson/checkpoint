// Appearance (theme, accent, logo) per user in localStorage. Port of the Angular appearance.ts.
// index.react.html applies LAST_KEY before first paint; this module keeps both keys in sync.
export type ThemeChoice = 'system' | 'light' | 'dark';
type Accent = 'green' | 'blue' | 'violet' | 'orange' | 'rose';
export type LogoChoice = 'bonfire' | 'monogram' | 'flag' | 'ring' | 'pixel' | 'custom';

export interface Appearance {
  theme: ThemeChoice;
  accent: Accent;
  logo: LogoChoice;
  /** data URL (PNG/JPEG/WebP/SVG) when logo = 'custom'. */
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
  { id: 'bonfire', label: 'Fogueira (ícone do app)' },
  { id: 'monogram', label: 'Monograma' },
  { id: 'flag', label: 'Bandeira' },
  { id: 'ring', label: 'Save point' },
  { id: 'pixel', label: 'Pixel' },
];

/** Browser bar background (meta theme-color) per theme. */
export const BAR = { light: '#f6f8f7', dark: '#0e1412' } as const;
export const LAST_KEY = 'checkpoint:appearance:last';
export const PREFIX = 'checkpoint:appearance:';
/** Custom logo cap (the data URL lives in localStorage, ~5 MB per origin). */
const MAX_LOGO_BYTES = 200 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export const DEFAULTS: Appearance = {
  theme: 'system',
  accent: 'green',
  logo: 'bonfire',
  customLogo: null,
};

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
      : (LOGOS.find((l) => l.id === v?.logo)?.id ?? 'bonfire');
  return {
    theme: theme ?? DEFAULTS.theme,
    accent: accent ?? DEFAULTS.accent,
    logo,
    customLogo: custom,
  };
}

export function read(key: string): Appearance | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function write(key: string, value: Appearance) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the choice only lasts this session.
  }
}

/** Validates the logo file and resolves its data URL (rejects with an Error carrying the message). */
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
