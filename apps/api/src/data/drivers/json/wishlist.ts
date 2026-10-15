// JSON local: lista de desejos. O jogo é gravado no driver de jogos (mesmo arquivo de jogos);
// descrições e preços ficam no próprio arquivo. Um só usuário: `owner` é ignorado.
import { randomUUID } from 'node:crypto';
import type { Game, SteamApp, SteamPrice } from '../../../../../../packages/core/src/models.ts';
import { normalizeMetadata } from '../../../../../../packages/core/src/metadata.ts';
import type { GamesDriver, WishlistDriver } from '../types.ts';
import { JsonFile } from './file.ts';

interface WishlistFile {
  descriptions: Record<string, string>;
  prices: Record<string, SteamPrice>;
}

/** Mesmo jogo já cadastrado: mesmo appid da Steam ou, sem appid, mesmo nome. */
const sameGame = (a: Pick<Game, 'steamAppId' | 'name'>, b: Pick<Game, 'steamAppId' | 'name'>) =>
  a.steamAppId
    ? a.steamAppId === b.steamAppId
    : normalizeMetadata(a.name) === normalizeMetadata(b.name);

export class JsonWishlistDriver implements WishlistDriver {
  private games: GamesDriver;
  private file: JsonFile;
  private data: WishlistFile = { descriptions: {}, prices: {} };
  private ready: Promise<void>;
  constructor(games: GamesDriver, path: string | null) {
    this.games = games;
    this.file = new JsonFile(path);
    this.ready = this.load();
  }
  private async load() {
    const data = await this.file.read();
    if (data) this.data = { ...this.data, ...(data as Partial<WishlistFile>) };
  }
  private queue: Promise<unknown> = Promise.resolve();
  async create(owner: string, game: Game, app: SteamApp | null) {
    const run = async () => {
      await this.ready;
      const existing = (await this.games.list(owner)).find((g) => sameGame(game, g));
      if (existing) return { id: existing.id, created: false, catalogCreated: false };
      const id = game.steamAppId ? 'S' + game.steamAppId : 'W' + randomUUID().slice(0, 8);
      await this.games.save(
        owner,
        { ...game, id, updatedAt: new Date().toISOString() },
        { writeCatalog: true },
      );
      if (app?.shortDescription) {
        this.data.descriptions[id] = app.shortDescription;
        await this.file.write(this.data);
      }
      // O jogo inteiro já foi gravado acima: não há campos de obra pendentes.
      return { id, created: true, catalogCreated: false };
    };
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  async prices(appIds: number[]) {
    await this.ready;
    return new Map(
      appIds.filter((a) => this.data.prices[a]).map((a) => [a, this.data.prices[a]] as const),
    );
  }
  async savePrices(prices: Map<number, SteamPrice>) {
    await this.ready;
    for (const [appId, price] of prices) this.data.prices[appId] = price;
    await this.file.write(this.data);
  }
  async descriptions(gameIds: string[]) {
    await this.ready;
    return new Map(
      gameIds
        .filter((id) => this.data.descriptions[id])
        .map((id) => [id, this.data.descriptions[id]] as const),
    );
  }
}
