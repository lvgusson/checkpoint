// Postgres: lista de desejos. O jogo desejado é um library_entry com status 'wishlist' sobre o
// catálogo global (game), mais metadados da loja (game_metadata) e preços (game_price).
import postgres from 'postgres';
import type { Game, SteamApp, SteamPrice } from '../../../../../../packages/core/src/models.ts';
import type { Sql } from '../../db.ts';
import type { WishlistDriver } from '../types.ts';
import { desireCode, isoTs } from './shared.ts';

export class PgWishlistDriver implements WishlistDriver {
  private sql: Sql;
  private countryCode: string;
  constructor(sql: Sql, countryCode = 'BR') {
    this.sql = sql;
    this.countryCode = countryCode;
  }
  /**
   * Transação curta: (1) já está na biblioteca? devolve; (2) reaproveita o jogo do catálogo
   * com o mesmo appid ou cria um; (3) cria o library_entry 'wishlist'; (4) metadados da loja.
   * Os campos de obra (gênero, tags, coop...) são gravados depois pelo repositório de jogos,
   * e só quando o jogo do catálogo é novo, para não sobrescrever o que outro usuário editou.
   */
  async create(owner: string, game: Game, app: SteamApp | null) {
    const appId = game.steamAppId;
    try {
      return await this.sql.begin(async (tx) => {
        const [mine] = await tx<{ code: string }[]>`
        SELECT g.code FROM library_entry e JOIN game g ON g.id = e.game_id
         WHERE e.user_id = ${owner}
           AND ${appId ? tx`g.steam_app_id = ${appId}` : tx`g.sort_name = norm_key(${game.name})`}
         LIMIT 1`;
        if (mine) return { id: mine.code, created: false, catalogCreated: false };
        let [target] = appId
          ? await tx<{ id: string; code: string }[]>`
            SELECT id, code FROM game WHERE steam_app_id = ${appId} ORDER BY id LIMIT 1`
          : [];
        const catalogCreated = !target;
        // Only trusted Steam responses may extend the controlled vocabulary.
        if (app && catalogCreated) {
          if (game.primaryGenre)
            await tx`INSERT INTO genre (name) VALUES (${game.primaryGenre}) ON CONFLICT (key) DO NOTHING`;
          for (const name of game.secondaryTags)
            await tx`INSERT INTO tag (name) VALUES (${name}) ON CONFLICT (key) DO NOTHING`;
        }
        if (!target)
          [target] = await tx<{ id: string; code: string }[]>`
          INSERT INTO game (name, steam_app_id, created_by, primary_genre_id, pace, structure, coop, size_label)
          VALUES (${game.name}, ${appId}, ${owner},
                  (SELECT id FROM genre WHERE key = norm_key(${game.primaryGenre || ''})),
                  ${game.pace || ''}, ${game.structure || ''}, ${game.coop || ''}, ${game.size || ''})
          RETURNING id, code`;
        if (catalogCreated && game.secondaryTags?.length) {
          for (let i = 0; i < game.secondaryTags.length; i++) {
            const tagName = game.secondaryTags[i];
            await tx`
            INSERT INTO game_tag (game_id, tag_id, position)
            SELECT ${target.id}, id, ${i} FROM tag WHERE key = norm_key(${tagName})
            ON CONFLICT (game_id, tag_id) DO NOTHING`;
          }
        }
        const [entry] = await tx<{ id: string }[]>`
        INSERT INTO library_entry (user_id, game_id, status, desire, platform, store_id, notes)
        VALUES (${owner}, ${target.id}, 'wishlist',
                coalesce(${desireCode[game.desire]}::desire_level, 'medium'::desire_level),
                ${game.platform},
                (SELECT id FROM store WHERE key = norm_key(${game.store || 'Steam'}::text)),
                ${game.notes ?? null})
        ON CONFLICT (user_id, game_id) DO NOTHING
        RETURNING id`;
        if (!entry) return { id: target.code, created: false, catalogCreated: false };
        if (app && catalogCreated)
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
        return { id: target.code, created: true, catalogCreated };
      });
    } catch (e) {
      if (e instanceof postgres.PostgresError && e.code === '23505') {
        const [mine] = await this.sql<{ code: string }[]>`
          SELECT g.code FROM library_entry e JOIN game g ON g.id = e.game_id
           WHERE e.user_id = ${owner}
             AND ${appId ? this.sql`g.steam_app_id = ${appId}` : this.sql`g.sort_name = norm_key(${game.name})`}
           LIMIT 1`;
        if (mine) return { id: mine.code, created: false, catalogCreated: false };
        const [target] = await this.sql<{ code: string }[]>`
          SELECT code FROM game
           WHERE ${appId ? this.sql`steam_app_id = ${appId}` : this.sql`sort_name = norm_key(${game.name})`}
           ORDER BY id LIMIT 1`;
        if (target) return { id: target.code, created: false, catalogCreated: false };
      }
      throw e;
    }
  }
  async prices(appIds: number[]) {
    if (!appIds.length) return new Map<number, SteamPrice>();
    const sql = this.sql;
    const rows = await sql<(SteamPrice & { appId: number })[]>`
      SELECT steam_app_id AS "appId", btrim(currency) AS currency,
             initial_cents AS "initialCents", final_cents AS "finalCents",
             discount_percent AS "discountPercent",
             ${isoTs(sql, sql`discount_ends_at`)} AS "discountEndsAt",
             is_free AS "isFree", formatted, ${isoTs(sql, sql`fetched_at`)} AS "fetchedAt"
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
