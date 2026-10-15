// Persistência da lista de desejos: cadastro de jogos novos, descrição da loja e preços.
// O jogo desejado é um Game comum com status 'Desejado'; edição, listagem e pontuação
// continuam no GameRepository.
import type { CreateResult, WishlistStore } from '../ports.ts';
import type { Game, SteamApp, SteamPrice } from '../../../../../packages/core/src/models.ts';
import type { WishlistDriver } from '../drivers/types.ts';
import type { AppUserResolver } from '../ports.ts';
import type { GameRepository } from '../ports.ts';

export class WishlistStoreImpl implements WishlistStore {
  private driver: WishlistDriver;
  private user: AppUserResolver;
  private games: GameRepository;
  constructor(driver: WishlistDriver, user: AppUserResolver, games: GameRepository) {
    this.driver = driver;
    this.user = user;
    this.games = games;
  }
  async create(game: Game, app: SteamApp | null): Promise<CreateResult> {
    const { id, created, catalogCreated } = await this.driver.create(await this.user(), game, app);
    // Campos de obra só quando a linha do catálogo é nova: não sobrescreve o que outro editou.
    if (catalogCreated) await this.games.save({ ...game, id }, { creator: true });
    return { id, created };
  }
  prices(appIds: number[]) {
    return this.driver.prices(appIds);
  }
  savePrices(prices: Map<number, SteamPrice>) {
    return this.driver.savePrices(prices);
  }
  descriptions(gameIds: string[]) {
    return this.driver.descriptions(gameIds);
  }
}
