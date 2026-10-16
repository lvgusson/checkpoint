import type { Game } from '../../../../../packages/core/src/models.ts';
import type { AppUserResolver, GameRepository } from '../ports.ts';
import {
  metadataFields,
  normalizeMetadata,
  type MetadataCatalog,
} from '../../../../../packages/core/src/metadata.ts';
import { can, Permission } from '../../../../../packages/core/src/authorization.ts';
import { getContext } from '../../shared/context.ts';
import type { GamesDriver, GameBrowseQuery, GameBrowseResult } from '../drivers/types.ts';
import { defaultMetadata } from '../config-seed.ts';
import type { ConfigRepository } from '../ports.ts';
import { toAppError } from './errors.ts';

export class GameRepositoryImpl implements GameRepository {
  private driver: GamesDriver;
  private user: AppUserResolver;
  private config?: ConfigRepository;
  constructor(driver: GamesDriver, user: AppUserResolver, config?: ConfigRepository) {
    this.driver = driver;
    this.config = config;
    this.user = user;
  }
  async list() {
    return this.driver.list(await this.user());
  }
  async searchByName(query: string, excludeId?: string) {
    return this.driver.searchByName(await this.user(), query, excludeId);
  }
  async get(id: string) {
    return this.driver.get(await this.user(), id);
  }
  async browse(query: GameBrowseQuery): Promise<GameBrowseResult> {
    return this.driver.browse(await this.user(), query);
  }
  /** The catalog kept by the store, or the built-in one extended with the values games use. */
  async metadataCatalog(): Promise<MetadataCatalog> {
    const stored = this.config ? await this.config.list() : await this.driver.catalog();
    if (stored) return stored;
    const catalog = structuredClone(defaultMetadata);
    const games = await this.list();
    for (const [category, field] of Object.entries(metadataFields)) {
      const options = catalog[category as keyof MetadataCatalog];
      const known = new Set(options.map(normalizeMetadata));
      for (const game of games) {
        const values = field === 'secondaryTags' ? game.secondaryTags : [game[field]];
        for (const value of values) {
          const key = normalizeMetadata(value);
          if (key && !known.has(key)) {
            options.push(value.trim());
            known.add(key);
          }
        }
      }
    }
    return catalog;
  }
  async save(game: Game, { creator = false } = {}) {
    const owner = await this.user();
    // `game` and `game_tag` are shared by every library: admins or users updating their games may write them.
    const writeCatalog =
      creator ||
      can(getContext()?.role, Permission.CatalogUpdate) ||
      can(getContext()?.role, Permission.GamesUpdate);
    await this.driver.save(owner, game, { writeCatalog }).catch(toAppError);
  }
}
