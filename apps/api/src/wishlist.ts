// Lista de desejos: busca na Steam, cadastro (por appid ou manual), preços e importação
// da lista de desejos da Steam. Os jogos são Games comuns com status 'Desejado'.
import type {
  Desire,
  Game,
  ScoredGame,
  SteamApp,
  SteamPrice,
  WishlistImportResult,
  WishlistItem,
} from '../../../packages/core/src/models.ts';
import { AppError, desires, type GameService } from './service.ts';
import { SteamError, type SteamClient } from './steam.ts';
import { emptyGame, gameFromSteamApp } from './steam-mapping.ts';
import { metadataFields, normalizeMetadata } from '../../../packages/core/src/metadata.ts';
import type { WishlistStore } from './wishlist-repository.ts';

export interface WishlistOptions {
  /** Perfil padrão para importar (STEAM_PROFILE). */
  defaultProfile?: string;
  /** Idade máxima do preço antes de buscar de novo ao listar (padrão 6 h). */
  priceTtlMs?: number;
}

const unavailable = (): SteamPrice => ({
  currency: null,
  initialCents: null,
  finalCents: null,
  discountPercent: 0,
  discountEndsAt: null,
  isFree: false,
  formatted: null,
  fetchedAt: new Date().toISOString(),
});

const appIdOf = (v: unknown) => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 2 ** 31 - 1)
    throw new AppError('appId inválido');
  return n;
};

/** Campos aceitos no cadastro manual (os mesmos que a tela de detalhe edita). */
const MANUAL_STRINGS = [
  'primaryGenre',
  'store',
  'platform',
  'pace',
  'structure',
  'notes',
  'size',
  'coop',
  'mechanic',
] as const;
const MANUAL_HOURS = ['mainHours', 'extraHours', 'completionistHours'] as const;

function manualGame(body: Record<string, unknown>): Game {
  const name = body.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 300)
    throw new AppError('Informe o nome do jogo');
  const game = emptyGame(name);
  for (const [k, v] of Object.entries(body)) {
    if (k === 'name') continue;
    if ((MANUAL_STRINGS as readonly string[]).includes(k)) {
      if (typeof v !== 'string' || v.length > 10000) throw new AppError('Texto inválido: ' + k);
      Object.assign(game, { [k]: v.trim() });
    } else if ((MANUAL_HOURS as readonly string[]).includes(k)) {
      if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100000))
        throw new AppError('Horas inválidas');
      Object.assign(game, { [k]: v });
    } else if (k === 'desire') {
      if (!desires.includes(v as string)) throw new AppError('Vontade inválida');
      game.desire = v as Desire;
    } else if (k === 'secondaryTags') {
      if (
        !Array.isArray(v) ||
        v.length > 3 ||
        v.some((t) => typeof t !== 'string' || !t.trim() || t.length > 80)
      )
        throw new AppError('Use até três tags secundárias');
      game.secondaryTags = v.map((t: string) => t.trim());
    } else if (k === 'steamAppId') {
      game.steamAppId = v === null ? null : appIdOf(v);
    } else throw new AppError('Campo não aceito: ' + k);
  }
  return game;
}

/** Erros da Steam viram respostas HTTP (4xx repassados; o resto, 502). */
async function steamCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SteamError)
      throw new AppError(e.message, e.status >= 400 && e.status < 500 ? e.status : 502);
    throw e;
  }
}

export class WishlistService {
  private games: GameService;
  private store: WishlistStore;
  private steam: SteamClient;
  private defaultProfile: string;
  private priceTtlMs: number;
  constructor(
    games: GameService,
    store: WishlistStore,
    steam: SteamClient,
    { defaultProfile = '', priceTtlMs = 6 * 3600_000 }: WishlistOptions = {},
  ) {
    this.games = games;
    this.store = store;
    this.steam = steam;
    this.defaultProfile = defaultProfile;
    this.priceTtlMs = priceTtlMs;
  }

  search(q: unknown) {
    if (typeof q !== 'string' || !q.trim() || q.length > 100)
      throw new AppError('Informe o nome (1 a 100 caracteres)');
    return steamCall(() => this.steam.search(q));
  }

  async app(id: unknown): Promise<SteamApp> {
    const appId = appIdOf(id);
    const app = await steamCall(() => this.steam.app(appId));
    if (!app) throw new AppError('App não encontrado na Steam', 404);
    return app;
  }

  /** Jogos desejados com preço (busca preços vencidos; se a Steam falhar, usa os antigos). */
  async list(): Promise<WishlistItem[]> {
    const wished = (await this.games.all()).filter((g) => g.status === 'Desejado');
    const appIds = wished.flatMap((g) => (g.steamAppId ? [g.steamAppId] : []));
    const [prices, descriptions] = await Promise.all([
      this.store.prices(appIds),
      this.store.descriptions(wished.map((g) => g.id)),
    ]);
    const stale = appIds.filter((a) => {
      const p = prices.get(a);
      return !p || Date.now() - Date.parse(p.fetchedAt) > this.priceTtlMs;
    });
    if (stale.length)
      try {
        for (const [a, p] of await this.fetchPrices(stale)) prices.set(a, p);
      } catch (e) {
        console.warn('Preços da Steam não atualizados:', (e as Error).message);
      }
    return wished
      .map((game) => this.item(game, prices, descriptions))
      .sort((a, b) => a.game.name.localeCompare(b.game.name, 'pt-BR'));
  }

  private item(
    game: ScoredGame,
    prices: Map<number, SteamPrice>,
    descriptions: Map<string, string>,
  ): WishlistItem {
    return {
      game,
      price: game.steamAppId ? (prices.get(game.steamAppId) ?? null) : null,
      description: descriptions.get(game.id) ?? null,
    };
  }

  /** Busca e grava preços (apps sem preço à venda ficam registrados como indisponíveis). */
  private async fetchPrices(appIds: number[]): Promise<Map<number, SteamPrice>> {
    const fetched = await this.steam.prices(appIds);
    const out = new Map(appIds.map((a) => [a, fetched.get(a) ?? unavailable()] as const));
    await this.store.savePrices(out);
    return out;
  }

  /** Força a atualização de todos os preços da lista. */
  async refreshPrices(): Promise<WishlistItem[]> {
    const wished = (await this.games.all()).filter((g) => g.status === 'Desejado');
    const appIds = wished.flatMap((g) => (g.steamAppId ? [g.steamAppId] : []));
    if (appIds.length) await steamCall(() => this.fetchPrices(appIds));
    return this.list();
  }

  /** Cadastra um jogo desejado: `{ appId, desire? }` (dados da Steam) ou campos manuais. */
  async add(body: Record<string, unknown>): Promise<{ item: WishlistItem; created: boolean }> {
    let game: Game;
    let app: SteamApp | null = null;
    if (body.appId !== undefined) {
      const { appId, desire, ...rest } = body;
      if (Object.keys(rest).length) throw new AppError('Com appId, envie só appId e desire');
      if (desire !== undefined && !desires.includes(desire as string))
        throw new AppError('Vontade inválida');
      app = await this.app(appId);
      game = gameFromSteamApp(app, (desire as Desire | undefined) ?? 'Média');
    } else {
      game = manualGame(body);
      const catalog = await this.games.catalog();
      for (const [category, field] of Object.entries(metadataFields)) {
        const options = catalog[category as keyof typeof metadataFields];
        const canonical = (value: string) => {
          if (!value) return '';
          const match = options.find(
            (option) => normalizeMetadata(option) === normalizeMetadata(value),
          );
          if (!match) throw new AppError('Valor fora do catálogo: ' + field);
          return match;
        };
        if (field === 'secondaryTags') {
          game.secondaryTags = game.secondaryTags.map(canonical);
          if (new Set(game.secondaryTags).size !== game.secondaryTags.length)
            throw new AppError('Tags secundárias repetidas');
        } else game[field] = canonical(game[field]);
      }
    }
    const { id, created } = await this.store.create(game, app);
    if (app?.price) await this.store.savePrices(new Map([[app.appId, app.price]]));
    const scored = (await this.games.all()).find((g) => g.id === id);
    if (!scored) throw new AppError('Jogo não encontrado após o cadastro', 500);
    const [prices, descriptions] = await Promise.all([
      this.store.prices(scored.steamAppId ? [scored.steamAppId] : []),
      this.store.descriptions([id]),
    ]);
    return { item: this.item(scored, prices, descriptions), created };
  }

  /**
   * Importa a lista de desejos da Steam (idempotente: appids já presentes no app, em
   * qualquer status, são ignorados). O perfil precisa ter a lista de desejos pública.
   */
  async importSteam(body: Record<string, unknown> = {}): Promise<WishlistImportResult> {
    const profile = body.profile ?? this.defaultProfile;
    if (typeof profile !== 'string' || !profile.trim())
      throw new AppError('Informe o perfil da Steam (SteamID64 ou URL) ou configure STEAM_PROFILE');
    const steamId = await steamCall(() => this.steam.resolveSteamId(profile));
    const appIds = await steamCall(() => this.steam.wishlist(steamId));
    if (!appIds.length)
      throw new AppError(
        'A lista de desejos da Steam está vazia ou privada (Steam > Privacidade > Detalhes dos jogos: Público)',
        404,
      );
    const library = await this.games.repository.list();
    const known = new Set(library.flatMap((g) => (g.steamAppId ? [g.steamAppId] : [])));
    const fresh = appIds.filter((a) => !known.has(a));
    const apps = await steamCall(() => this.steam.apps(fresh));
    const byId = new Map(apps.map((a) => [a.appId, a]));
    const result: WishlistImportResult = {
      total: appIds.length,
      created: 0,
      existing: appIds.length - fresh.length,
      failed: [],
    };
    const prices = new Map<number, SteamPrice>();
    for (const appId of fresh) {
      const app = byId.get(appId);
      if (!app) {
        result.failed.push({ appId, reason: 'Não encontrado na loja (removido ou oculto)' });
        continue;
      }
      try {
        const { created } = await this.store.create(gameFromSteamApp(app), app);
        if (created) result.created++;
        else result.existing++;
        prices.set(appId, app.price ?? unavailable());
      } catch (e) {
        result.failed.push({ appId, reason: e instanceof Error ? e.message : 'Erro' });
      }
    }
    await this.store.savePrices(prices);
    return result;
  }
}
