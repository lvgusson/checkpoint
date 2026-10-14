// Persistência da lista de desejos: cadastro de jogos novos, descrição da loja e preços.
// O jogo desejado é um Game comum com status 'Desejado' (library_entry.status = 'wishlist');
// edição, listagem e pontuação continuam no GameRepository.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Game, SteamApp, SteamPrice } from '../../../packages/core/src/models.ts';
import type { GameRepository } from './repository.ts';
import type { Sql } from './db.ts';
import type { AppUserResolver } from './app-user.ts';

export interface CreateResult {
  id: string;
  /** false = o usuário já tinha o jogo (mesmo appid ou mesmo nome), nada foi criado. */
  created: boolean;
}

export interface WishlistStore {
  /** Cadastra o jogo na biblioteca do usuário (idempotente por appid ou nome). */
  create(game: Game, app: SteamApp | null): Promise<CreateResult>;
  /** Último preço conhecido por appid. */
  prices(appIds: number[]): Promise<Map<number, SteamPrice>>;
  savePrices(prices: Map<number, SteamPrice>): Promise<void>;
  /** Descrição curta da loja por id do jogo. */
  descriptions(gameIds: string[]): Promise<Map<string, string>>;
}

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Mesmo jogo já cadastrado: mesmo appid da Steam ou, sem appid, mesmo nome. */
export const sameGame = (
  a: Pick<Game, 'steamAppId' | 'name'>,
  b: Pick<Game, 'steamAppId' | 'name'>,
) => (a.steamAppId ? a.steamAppId === b.steamAppId : key(a.name) === key(b.name));

interface LocalFile {
  descriptions: Record<string, string>;
  prices: Record<string, SteamPrice>;
}

/** JSON local (dev/testes). Sem `path`, só em memória. */
export class LocalWishlistStore implements WishlistStore {
  private games: GameRepository;
  private path: string | null;
  private data: LocalFile = { descriptions: {}, prices: {} };
  private ready: Promise<void>;
  private writing = Promise.resolve();
  constructor(games: GameRepository, path: string | null = null) {
    this.games = games;
    this.path = path;
    this.ready = this.load();
  }
  private async load() {
    if (!this.path) return;
    try {
      this.data = { ...this.data, ...JSON.parse(await readFile(this.path, 'utf8')) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  private async persist() {
    const path = this.path;
    if (!path) return;
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path + '.tmp', snapshot);
        await rename(path + '.tmp', path);
      });
    await this.writing;
  }
  async create(game: Game, app: SteamApp | null): Promise<CreateResult> {
    await this.ready;
    const existing = (await this.games.list()).find((g) => sameGame(game, g));
    if (existing) return { id: existing.id, created: false };
    const id = game.steamAppId ? 'S' + game.steamAppId : 'W' + randomUUID().slice(0, 8);
    await this.games.save({ ...game, id, updatedAt: new Date().toISOString() });
    if (app?.shortDescription) {
      this.data.descriptions[id] = app.shortDescription;
      await this.persist();
    }
    return { id, created: true };
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
    await this.persist();
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

const isoTs = (col: string) =>
  `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Postgres: game (catálogo global) + library_entry (status wishlist) + game_metadata + game_price. */
export class PgWishlistStore implements WishlistStore {
  private sql: Sql;
  private user: AppUserResolver;
  private games: GameRepository;
  private countryCode: string;
  constructor(sql: Sql, user: AppUserResolver, games: GameRepository, countryCode = 'BR') {
    this.sql = sql;
    this.user = user;
    this.games = games;
    this.countryCode = countryCode;
  }
  /**
   * Transação curta: (1) já está na biblioteca? devolve; (2) reaproveita o jogo do catálogo
   * com o mesmo appid ou cria um; (3) cria o library_entry 'wishlist'; (4) metadados da loja.
   * Os campos de obra (gênero, tags, coop...) são gravados depois pelo GameRepository.save,
   * e só quando o jogo do catálogo é novo, para não sobrescrever o que outro usuário editou.
   */
  async create(game: Game, app: SteamApp | null): Promise<CreateResult> {
    const u = await this.user();
    const appId = game.steamAppId;
    const result = await this.sql.begin(async (tx) => {
      const [mine] = await tx<{ code: string }[]>`
        SELECT g.code FROM library_entry e JOIN game g ON g.id = e.game_id
         WHERE e.user_id = ${u}
           AND ${appId ? tx`g.steam_app_id = ${appId}` : tx`g.sort_name = norm_key(${game.name})`}
         LIMIT 1`;
      if (mine) return { id: mine.code, created: false, newCatalog: false };
      let [target] = appId
        ? await tx<{ id: string; code: string }[]>`
            SELECT id, code FROM game WHERE steam_app_id = ${appId} ORDER BY id LIMIT 1`
        : [];
      const newCatalog = !target;
      // Only trusted Steam responses may extend the controlled vocabulary.
      if (app && newCatalog) {
        if (game.primaryGenre)
          await tx`INSERT INTO genre (name) VALUES (${game.primaryGenre}) ON CONFLICT (key) DO NOTHING`;
        for (const name of game.secondaryTags)
          await tx`INSERT INTO tag (name) VALUES (${name}) ON CONFLICT (key) DO NOTHING`;
      }
      if (!target)
        [target] = await tx<{ id: string; code: string }[]>`
          INSERT INTO game (name, steam_app_id, created_by)
          VALUES (${game.name}, ${appId}, ${u}) RETURNING id, code`;
      await tx`
        INSERT INTO library_entry (user_id, game_id, status, desire, platform)
        VALUES (${u}, ${target.id}, 'wishlist',
                (SELECT code FROM ref_desire WHERE label_pt = ${game.desire}), ${game.platform})`;
      if (app && newCatalog)
        await tx`
          INSERT INTO game_metadata (game_id, matched_title, steam_app_id, cover_url, header_url,
                                     hero_url, short_description, description_lang, release_date,
                                     developers, publishers, source_genres, confidence, notes,
                                     fetched_at)
          VALUES (${target.id}, ${app.name}, ${app.appId}, ${app.capsuleUrl}, ${app.headerUrl},
                  ${app.heroUrl}, ${app.shortDescription || null}, 'pt-BR', ${app.releaseDate}::date,
                  ${app.developers}::text[], ${app.publishers}::text[], ${app.tags}::text[], 'high',
                  'Steam Store (IStoreBrowseService/GetItems)', now())
          ON CONFLICT (game_id) DO NOTHING`;
      return { id: target.code, created: true, newCatalog };
    });
    if (result.newCatalog) await this.games.save({ ...game, id: result.id });
    return { id: result.id, created: result.created };
  }
  async prices(appIds: number[]) {
    if (!appIds.length) return new Map<number, SteamPrice>();
    const rows = await this.sql<(SteamPrice & { appId: number })[]>`
      SELECT steam_app_id AS "appId", btrim(currency) AS currency,
             initial_cents AS "initialCents", final_cents AS "finalCents",
             discount_percent AS "discountPercent",
             ${this.sql.unsafe(isoTs('discount_ends_at'))} AS "discountEndsAt",
             is_free AS "isFree", formatted, ${this.sql.unsafe(isoTs('fetched_at'))} AS "fetchedAt"
        FROM game_price
       WHERE country_code = ${this.countryCode} AND steam_app_id = ANY(${appIds}::int[])`;
    return new Map(rows.map(({ appId, ...price }) => [appId, price]));
  }
  /** Upsert em lote num único statement. */
  async savePrices(prices: Map<number, SteamPrice>) {
    if (!prices.size) return;
    const rows = [...prices].map(([appId, p]) => ({ appId, ...p }));
    await this.sql`
      INSERT INTO game_price AS p (steam_app_id, country_code, currency, initial_cents, final_cents,
                                   discount_percent, discount_ends_at, is_free, formatted, fetched_at)
      SELECT r."appId", ${this.countryCode}, r.currency, r."initialCents", r."finalCents",
             r."discountPercent", r."discountEndsAt", r."isFree", r.formatted, r."fetchedAt"
        FROM jsonb_to_recordset(${this.sql.json(rows as never)}::jsonb) AS r(
               "appId" int, currency text, "initialCents" int, "finalCents" int,
               "discountPercent" smallint, "discountEndsAt" timestamptz, "isFree" boolean,
               formatted text, "fetchedAt" timestamptz)
      ON CONFLICT (steam_app_id, country_code) DO UPDATE
         SET currency = EXCLUDED.currency, initial_cents = EXCLUDED.initial_cents,
             final_cents = EXCLUDED.final_cents, discount_percent = EXCLUDED.discount_percent,
             discount_ends_at = EXCLUDED.discount_ends_at, is_free = EXCLUDED.is_free,
             formatted = EXCLUDED.formatted, fetched_at = EXCLUDED.fetched_at`;
  }
  async descriptions(gameIds: string[]) {
    if (!gameIds.length) return new Map<string, string>();
    const rows = await this.sql<{ id: string; description: string }[]>`
      SELECT code AS id, short_description AS description FROM game
       WHERE code = ANY(${gameIds}::text[]) AND short_description IS NOT NULL`;
    return new Map(rows.map((r) => [r.id, r.description]));
  }
}
