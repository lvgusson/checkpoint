import type {
  MetadataCatalog,
  MetadataCategory,
} from '../../../../../../packages/core/src/metadata.ts';
import { metadataFields, normalizeMetadata } from '../../../../../../packages/core/src/metadata.ts';
import type { ConfigDriver, GamesDriver } from '../types.ts';
import { defaultMetadata } from '../../config-seed.ts';
import { JsonFile } from './file.ts';

export class JsonConfigDriver implements ConfigDriver {
  private catalog = structuredClone(defaultMetadata);
  private file: JsonFile;
  private ready: Promise<void>;
  private games: GamesDriver;
  private owner: string;
  constructor(path: string | null, games: GamesDriver, owner = 'local') {
    this.games = games;
    this.owner = owner;
    this.file = new JsonFile(path);
    this.ready = this.load();
  }
  private async load() {
    const stored = await this.file.read();
    if (stored) this.catalog = stored as MetadataCatalog;
    else {
      for (const game of await this.games.list(this.owner)) {
        for (const [category, field] of Object.entries(metadataFields)) {
          const values = field === 'secondaryTags' ? game.secondaryTags : [game[field]];
          const options = this.catalog[category as MetadataCategory];
          for (const value of values)
            if (
              value.trim() &&
              !options.some((x) => normalizeMetadata(x) === normalizeMetadata(value))
            )
              options.push(value.trim());
        }
      }
    }
  }
  async list() {
    await this.ready;
    return structuredClone(this.catalog);
  }
  async add(category: MetadataCategory, name: string) {
    await this.ready;
    if (
      !this.catalog[category].some((value) => normalizeMetadata(value) === normalizeMetadata(name))
    )
      this.catalog[category].push(name);
    await this.file.write(this.catalog);
  }
  async remove(category: MetadataCategory, name: string): Promise<'removed' | 'missing' | 'used'> {
    await this.ready;
    const actual = this.catalog[category].find(
      (value) => normalizeMetadata(value) === normalizeMetadata(name),
    );
    if (!actual) return 'missing';
    const field = metadataFields[category];
    for (const game of await this.games.list(this.owner)) {
      const values = field === 'secondaryTags' ? game.secondaryTags : [game[field]];
      if (values.some((value) => normalizeMetadata(value) === normalizeMetadata(actual)))
        return 'used';
    }
    this.catalog[category] = this.catalog[category].filter((value) => value !== actual);
    await this.file.write(this.catalog);
    return 'removed';
  }
}
