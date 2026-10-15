// Composition root of the data layer: picks a driver per entity and wraps it in its repository.
//
// Each entity reads its own variable, `pg` or `json`:
//   GAMES_STORE  LISTS_STORE  PINS_STORE  SCORING_STORE  APP_USERS_STORE  RELEASES_STORE
// The default is `pg` when DATABASE_URL is set and `json` otherwise, so mixed setups are just
// a matter of setting one variable. The wishlist is stored together with the games it adds, so it
// follows GAMES_STORE. The one-query queue read is used only when games, lists, pins and scoring
// are all `pg`. Releases exist only in `pg` (json means "no release registry").
// To add a database: write its drivers under `drivers/<name>/`, then add a case here.
import { join } from 'node:path';
import { remoteEmailVerifier } from '../auth/auth.ts';
import { db } from '../data/db.ts';
import type { ReleaseStore } from '../data/ports.ts';
import { PgReleaseDriver } from '../data/drivers/pg/releases.ts';
import { createAppUserResolver } from '../services/auth-user.ts';
import { GameRepositoryImpl } from '../data/repositories/games.ts';
import { type GameRepository } from '../data/ports.ts';
import { ListRepositoryImpl } from '../data/repositories/lists.ts';
import { type ListRepository } from '../data/ports.ts';
import { ManualAdjustmentRepositoryImpl } from '../data/repositories/manual.ts';
import { type ManualAdjustmentRepository } from '../data/ports.ts';
import { QueueInputsReaderImpl } from '../data/repositories/queue.ts';
import { type QueueInputsReader } from '../data/ports.ts';
import { ReleaseRepository } from '../data/repositories/releases.ts';
import { ScoringConfigRepositoryImpl } from '../data/repositories/scoring.ts';
import { type ScoringConfigRepository } from '../data/ports.ts';
import { WishlistStoreImpl } from '../data/repositories/wishlist.ts';
import { type WishlistStore } from '../data/ports.ts';
import { ConfigRepositoryImpl } from '../data/repositories/config.ts';
import { type ConfigRepository } from '../data/ports.ts';
import { assertPrivateStores } from '../shared/request-guard.ts';

type Env = Record<string, string | undefined>;
type Kind = 'pg' | 'json';
const ENTITIES = [
  'GAMES_STORE',
  'LISTS_STORE',
  'PINS_STORE',
  'SCORING_STORE',
  'APP_USERS_STORE',
  'RELEASES_STORE',
] as const;

interface DataOptions {
  env?: Env;
  /** Diretório dos JSON locais. */
  dataDir: string;
  /** app_user usado quando a autenticação está desligada (somente dev). */
  devAppUserId?: string;
  /** Código do país dos preços da lista de desejos no Postgres. */
  countryCode?: string;
}

export interface Data {
  games: GameRepository;
  lists: ListRepository;
  manual: ManualAdjustmentRepository;
  scoring: ScoringConfigRepository;
  wishlist: WishlistStore;
  config: ConfigRepository;
  queue: QueueInputsReader | null;
  releases: ReleaseStore | null;
  storage: 'postgres' | 'json' | 'mixed';
}

function kinds(env: Env): Record<(typeof ENTITIES)[number], Kind> {
  const fallback: Kind = env.DATABASE_URL ? 'pg' : 'json';
  const out = {} as Record<(typeof ENTITIES)[number], Kind>;
  for (const name of ENTITIES) {
    const value = env[name] || fallback;
    if (value !== 'pg' && value !== 'json') throw new Error(`${name} deve ser pg ou json`);
    if (value === 'pg' && !env.DATABASE_URL) throw new Error(`${name}=pg exige DATABASE_URL`);
    out[name] = value;
  }
  return out;
}

export async function createData({
  env = process.env,
  dataDir,
  devAppUserId,
  countryCode = env.STEAM_COUNTRY || 'BR',
}: DataOptions): Promise<Data> {
  const kind = kinds(env);
  assertPrivateStores(kind, Boolean(env.SUPABASE_URL));
  const used = new Set(Object.values(kind));
  const sql = used.has('pg') ? db(env.DATABASE_URL) : null;
  const pg = used.has('pg') ? await import('../data/drivers/pg/index.ts') : null;
  const json = used.has('json') ? await import('../data/drivers/json/index.ts') : null;
  // `sql`, `pg` and `json` are non-null exactly when some entity asked for that kind.
  const file = (envName: string, fallback: string) => env[envName] ?? join(dataDir, fallback);

  const appUserDriver =
    kind.APP_USERS_STORE === 'pg' ? new pg!.PgAppUserDriver(sql!) : new json!.JsonAppUserDriver();
  const user = createAppUserResolver(appUserDriver, {
    devAppUserId: kind.APP_USERS_STORE === 'json' ? (devAppUserId ?? 'local') : devAppUserId,
    seedOwnerEmail: env.SEED_OWNER_EMAIL,
    isEmailVerified: remoteEmailVerifier(env),
  });

  let gamesDriver;
  let wishlistDriver;
  if (kind.GAMES_STORE === 'pg') {
    gamesDriver = new pg!.PgGamesDriver(sql!);
    wishlistDriver = new pg!.PgWishlistDriver(sql!, countryCode);
  } else {
    const { seedGames } = await import('../data/seed.ts');
    gamesDriver = new json!.JsonGamesDriver(seedGames, file('DATA_FILE', 'games.json'));
    wishlistDriver = new json!.JsonWishlistDriver(
      gamesDriver,
      file('WISHLIST_FILE', 'wishlist.json'),
    );
  }

  const configDriver =
    kind.GAMES_STORE === 'pg'
      ? new pg!.PgConfigDriver(sql!)
      : new json!.JsonConfigDriver(
          file('CONFIG_FILE', 'config.json'),
          gamesDriver,
          kind.APP_USERS_STORE === 'json' ? (devAppUserId ?? 'local') : 'local',
        );
  const config = new ConfigRepositoryImpl(configDriver);
  const games = new GameRepositoryImpl(gamesDriver, user, config);

  const listsDriver =
    kind.LISTS_STORE === 'pg'
      ? new pg!.PgListsDriver(sql!)
      : new json!.JsonListsDriver(file('LISTS_FILE', 'lists.json'));
  const pinsDriver =
    kind.PINS_STORE === 'pg'
      ? new pg!.PgPinsDriver(sql!)
      : new json!.JsonPinsDriver(file('MANUAL_FILE', 'manual-adjustments.json'));
  const scoringDriver =
    kind.SCORING_STORE === 'pg'
      ? new pg!.PgScoringDriver(sql!)
      : new json!.JsonScoringDriver(file('SETTINGS_FILE', 'scoring-settings.json'));

  const allPg = [kind.GAMES_STORE, kind.LISTS_STORE, kind.PINS_STORE, kind.SCORING_STORE].every(
    (k) => k === 'pg',
  );
  return {
    games,
    lists: new ListRepositoryImpl(listsDriver, user),
    manual: new ManualAdjustmentRepositoryImpl(pinsDriver, user),
    scoring: new ScoringConfigRepositoryImpl(scoringDriver, user),
    wishlist: new WishlistStoreImpl(wishlistDriver, user, games),
    config,
    queue: allPg ? new QueueInputsReaderImpl(new pg!.PgQueueInputsDriver(sql!), user) : null,
    releases: kind.RELEASES_STORE === 'pg' ? releaseStoreFromEnv(env) : null,
    storage: used.size > 1 ? 'mixed' : used.has('pg') ? 'postgres' : 'json',
  };
}

/** Release registry for the HTTP server and scripts: null without a Postgres release store. */
export function releaseStoreFromEnv(env: Env = process.env): ReleaseStore | null {
  const kind = env.RELEASES_STORE || (env.DATABASE_URL ? 'pg' : 'json');
  return kind === 'pg' && env.DATABASE_URL
    ? new ReleaseRepository(new PgReleaseDriver(db(env.DATABASE_URL)))
    : null;
}
