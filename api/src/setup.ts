// Monta o GameService com a persistência certa para o ambiente:
//   DATABASE_URL definida → Postgres (Supabase);
//   senão               → arquivos JSON locais (dev offline e testes).
// Os módulos de cada lado são importados sob demanda: em produção o snapshot do seed
// (~570 KB) nunca é carregado, e sem banco o driver não é carregado.
import { join } from 'node:path';
import { GameService } from './service.ts';
import { WishlistService } from './wishlist.ts';
import { steamClientFromEnv, steamProfileFromEnv } from './steam.ts';

type Env = Record<string, string | undefined>;

export interface ServiceOptions {
  env?: Env;
  /** Diretório dos JSON locais (ignorado com DATABASE_URL). */
  dataDir: string;
  /** app_user usado quando a autenticação está desligada (somente dev). */
  devAppUserId?: string;
}

export async function createService({
  env = process.env,
  dataDir,
  devAppUserId,
}: ServiceOptions): Promise<{
  service: GameService;
  wishlist: WishlistService;
  storage: 'postgres' | 'json';
}> {
  const steam = steamClientFromEnv(env);
  const wishlistOptions = { defaultProfile: steamProfileFromEnv(env) };
  if (env.DATABASE_URL) {
    const [{ db }, { createAppUserResolver }, pg, { PgWishlistStore }] = await Promise.all([
      import('./db.ts'),
      import('./app-user.ts'),
      import('./pg-repository.ts'),
      import('./wishlist-repository.ts'),
    ]);
    const sql = db(env.DATABASE_URL);
    const user = createAppUserResolver(sql, {
      devAppUserId,
      seedOwnerEmail: env.SEED_OWNER_EMAIL,
    });
    const games = new pg.PgGameRepository(sql, user);
    const service = new GameService(
      games,
      new pg.PgManualAdjustmentRepository(sql, user),
      new pg.PgQueueInputsReader(sql, user),
      new pg.PgScoringConfigRepository(sql, user),
    );
    return {
      storage: 'postgres',
      service,
      wishlist: new WishlistService(
        service,
        new PgWishlistStore(sql, user, games, env.STEAM_COUNTRY || 'BR'),
        steam,
        wishlistOptions,
      ),
    };
  }
  const [
    { LocalGameRepository },
    { LocalManualAdjustmentRepository },
    { LocalScoringConfigRepository },
    { LocalWishlistStore },
    { seedGames },
  ] = await Promise.all([
    import('./repository.ts'),
    import('./manual-repository.ts'),
    import('./settings-repository.ts'),
    import('./wishlist-repository.ts'),
    import('./seed.ts'),
  ]);
  const games = new LocalGameRepository(seedGames, env.DATA_FILE ?? join(dataDir, 'games.json'));
  const service = new GameService(
    games,
    new LocalManualAdjustmentRepository(
      env.MANUAL_FILE ?? join(dataDir, 'manual-adjustments.json'),
    ),
    null,
    new LocalScoringConfigRepository(env.SETTINGS_FILE ?? join(dataDir, 'scoring-settings.json')),
  );
  return {
    storage: 'json',
    service,
    wishlist: new WishlistService(
      service,
      new LocalWishlistStore(games, env.WISHLIST_FILE ?? join(dataDir, 'wishlist.json')),
      steam,
      wishlistOptions,
    ),
  };
}
