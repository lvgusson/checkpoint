export interface MetadataCatalog {
  genres: string[];
  tags: string[];
  paces: string[];
  mechanics: string[];
  stores: string[];
  structures: string[];
  platforms: string[];
}
export type MetadataCategory = keyof MetadataCatalog;
export const metadataFields = {
  genres: 'primaryGenre',
  tags: 'secondaryTags',
  paces: 'pace',
  mechanics: 'mechanic',
  stores: 'store',
  structures: 'structure',
  platforms: 'platform',
} as const;
export const normalizeMetadata = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
