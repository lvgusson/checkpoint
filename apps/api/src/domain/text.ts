/** Lower-case text without diacritics, for accent-insensitive "contains" matching. */
export const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
