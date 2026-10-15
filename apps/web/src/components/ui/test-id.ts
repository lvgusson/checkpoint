/** Format a stored domain key for a test ID suffix. */
export const testIdKey = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Encode a catalog's natural key without punctuation collisions. */
export const testIdValue = (key: string) =>
  Array.from(key, (character) => character.codePointAt(0)!.toString(16)).join('-') || 'empty';
