export type MetadataKind =
  'genre' | 'tag' | 'pace' | 'mechanic' | 'structure' | 'store' | 'platform' | 'status' | 'desire';

const icons = {
  sword: 'M4 3 15 14l3-3 3 3-3 3 3 3-2 2-3-3-3 3-3-3 3-3L2 5V2h3z',
  compass: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4 6-3 5-5 3 3-5 5-3Z',
  puzzle: 'M3 3h6a3 3 0 1 1 6 0h6v6a3 3 0 1 0 0 6v6h-6a3 3 0 1 0-6 0H3v-6a3 3 0 1 1 0-6V3Z',
  target:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  book: 'M3 3h7l2 2 2-2h7v16h-7l-2 2-2-2H3V3Zm2 2v12h5l1 1V6l-2-1H5Zm8 1v12l1-1h5V5h-5l-1 1Z',
  bolt: 'M13 2 4 14h7l-1 8 10-13h-7l1-7Z',
  leaf: 'M21 3C9 2 2 6 3 13c1 7 12 10 16-2l2-8ZM6 18l10-10-8 12-2-2Z',
  layers:
    'm12 2 11 6-11 6L1 8l11-6ZM2 12l10 5 10-5v3l-10 5-10-5v-3Zm0 5 10 5 10-5v3l-10 4-10-4v-3Z',
  monitor: 'M2 3h20v14h-9v3h5v2H6v-2h5v-3H2V3Zm2 2v10h16V5H4Z',
  store:
    'M3 2h18l2 7-2 3v10H3V12L1 9l2-7Zm2 2L3 9l2 1 3-1 4 1 4-1 3 1 2-1-2-5H5Zm0 8v8h5v-6h5v6h4v-8l-3-1-4 1-4-1-3 1Z',
  heart: 'M12 21 3 12C-3 5 6-2 12 5c6-7 15 0 9 7l-9 9Z',
  check: 'm3 12 6 6L22 5l-2-2L9 14l-4-4-2 2Z',
  play: 'M5 2v20l17-10L5 2Z',
  pause: 'M5 3h5v18H5V3Zm9 0h5v18h-5V3Z',
  flag: 'M4 2h2v20H4V2Zm3 1h14l-4 5 4 5H7V3Z',
  steam:
    'M16 2a6 6 0 0 0-6 6l-5 5-4-2v6l5 3a4 4 0 0 0 5-3l5-3a6 6 0 1 0 0-12Zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM6 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
};
const palette = [
  '#8b5cf6',
  '#2563eb',
  '#0891b2',
  '#059669',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#db2777',
];
const normal = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const defaults: Record<MetadataKind, keyof typeof icons> = {
  genre: 'sword',
  tag: 'layers',
  pace: 'bolt',
  mechanic: 'target',
  structure: 'book',
  store: 'store',
  platform: 'monitor',
  status: 'flag',
  desire: 'heart',
};

/** One presentation source for metadata in the queue, details, and option menus. */
export function metadataPresentation(
  kind: MetadataKind,
  value: string,
): { color: string; icon: string } {
  const key = normal(value);
  let icon = defaults[kind];
  let color =
    palette[
      [...key].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) %
        palette.length
    ];
  if (/explora|aventura|mundo aberto/.test(key)) icon = 'compass';
  if (/puzzle|estrateg|tatic|gestao|planejamento/.test(key)) icon = 'puzzle';
  if (/narrativ|escolhas|campanha/.test(key)) icon = 'book';
  if (/tiro|fps|tps|shooter|precisao/.test(key)) icon = 'target';
  if (kind === 'pace') {
    icon = key === 'calmo' ? 'leaf' : key === 'moderado' ? 'compass' : 'bolt';
    color = key === 'calmo' ? '#059669' : key === 'moderado' ? '#ca8a04' : '#dc2626';
  }
  if (kind === 'store' && key === 'steam') {
    icon = 'steam';
    color = '#2563eb';
  }
  if (kind === 'status') {
    icon =
      key === 'jogando'
        ? 'play'
        : key === 'finalizado'
          ? 'check'
          : key === 'abandonado'
            ? 'pause'
            : key === 'desejado'
              ? 'heart'
              : 'flag';
    color =
      key === 'jogando'
        ? '#059669'
        : key === 'finalizado'
          ? '#2563eb'
          : key === 'abandonado'
            ? '#dc2626'
            : '#8b5cf6';
  }
  if (kind === 'desire')
    color =
      key === 'imediata'
        ? '#dc2626'
        : key.includes('alta')
          ? '#ea580c'
          : key === 'media'
            ? '#ca8a04'
            : '#64748b';
  return { color, icon: icons[icon] };
}
