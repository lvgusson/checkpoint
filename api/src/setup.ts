// Monta o GameService com a persistência certa para o ambiente:
//   DATABASE_URL definida → Postgres (Supabase), com snapshot da fila;
//   senão               → arquivos JSON locais (dev offline e testes).
// Os módulos de cada lado são importados sob demanda: em produção o snapshot do seed
// (~570 KB) nunca é carregado, e sem banco o driver não é carregado.
import { join } from 'node:path';
import { GameService } from './service.ts';

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
}: ServiceOptions): Promise<{ service: GameService; storage: 'postgres' | 'json' }> {
  if (env.DATABASE_URL) {
    const [{ db }, { createAppUserResolver }, pg] = await Promise.all([
      import('./db.ts'),
      import('./app-user.ts'),
      import('./pg-repository.ts'),
    ]);
    const sql = db(env.DATABASE_URL);
    const user = createAppUserResolver(sql, {
      devAppUserId,
      seedOwnerEmail: env.SEED_OWNER_EMAIL,
    });
    return {
      storage: 'postgres',
      service: new GameService(
        new pg.PgGameRepository(sql, user),
        new pg.PgManualAdjustmentRepository(sql, user),
        new pg.PgQueueSnapshotStore(sql, user),
      ),
    };
  }
  const [{ LocalGameRepository }, { LocalManualAdjustmentRepository }, { seedGames }] =
    await Promise.all([
      import('./repository.ts'),
      import('./manual-repository.ts'),
      import('./seed.ts'),
    ]);
  return {
    storage: 'json',
    service: new GameService(
      new LocalGameRepository(seedGames, env.DATA_FILE ?? join(dataDir, 'games.json')),
      new LocalManualAdjustmentRepository(
        env.MANUAL_FILE ?? join(dataDir, 'manual-adjustments.json'),
      ),
    ),
  };
}
