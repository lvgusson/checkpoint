import { writeFile } from 'node:fs/promises';
import { seedGames } from '../api/src/seed.ts';
const fields = {
  genres: 'primaryGenre',
  tags: 'secondaryTags',
  paces: 'pace',
  mechanics: 'mechanic',
  stores: 'store',
  structures: 'structure',
  platforms: 'platform',
};
const catalog = Object.fromEntries(
  Object.entries(fields).map(([key, field]) => [
    key,
    [...new Set(seedGames.flatMap((game) => game[field]))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ]),
);
catalog.structures = [
  'Campanha',
  'Campanha + repetição',
  'Campanha + sandbox',
  'Coletânea',
  'Sem fim definido',
];
catalog.platforms = [
  'PC',
  'PlayStation 5',
  'PlayStation 4',
  'Xbox Series X|S',
  'Xbox One',
  'Nintendo Switch',
  'Nintendo Switch 2',
  'Android',
  'iOS',
];
catalog.stores.push('Xbox', 'PlayStation', 'Nintendo', 'Microsoft', 'itch.io');
await writeFile(
  'shared/metadata.ts',
  `/** Controlled metadata values used when a database catalog is unavailable. */\nexport const metadataCatalog = ${JSON.stringify(catalog, null, 2)};\nexport type MetadataCatalog = typeof metadataCatalog;\nexport const metadataFields = ${JSON.stringify(fields, null, 2)} as const;\nexport const normalizeMetadata = (value: string): string => value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toLowerCase();\n`,
);
