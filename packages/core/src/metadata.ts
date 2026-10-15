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
const normalizeCache = new Map<string, string>();
export const normalizeMetadata = (value: string): string => {
  let cached = normalizeCache.get(value);
  if (cached === undefined) {
    cached = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    if (normalizeCache.size > 10000) normalizeCache.clear();
    normalizeCache.set(value, cached);
  }
  return cached;
};
