// Helper para inicializar e encerrar o servidor da API em porta efêmera e modo JSON local.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { makeServer } from '../../src/main/server.ts';
import { createService } from '../../src/main/setup.ts';
import type { Authenticator, AuthUser } from '../../src/auth/auth.ts';
import { Role } from '../../../../packages/core/src/authorization.ts';
import { AppError } from '../../src/shared/errors.ts';
import type { GameService } from '../../src/services/games.ts';
import type { WishlistService } from '../../src/services/wishlist.ts';
import type { ConfigService } from '../../src/services/config.ts';
import type { TrackService } from '../../src/services/track.ts';
import { SEED_APP_USER_ID } from '../../src/services/auth-user.ts';
import { closeDb, db } from '../../src/data/db.ts';

export interface TestServerContext {
  baseUrl: string;
  port: number;
  dataDir: string;
  service: GameService;
  wishlist: WishlistService;
  config?: ConfigService;
  track?: TrackService | null;
  close: () => Promise<void>;
}

export interface MockUser {
  id: string;
  email?: string;
  role?: Role;
}

/** Cria um Authenticator mock para testes de autenticação e IDOR. */
export function createMockAuthenticator(users: Record<string, MockUser> = {}): Authenticator {
  return {
    async authenticate(authorization: string | undefined): Promise<AuthUser> {
      const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
      if (!match) {
        throw new AppError('Autenticação necessária', 401);
      }
      const token = match[1];
      const user = users[token];
      if (!user) {
        throw new AppError('Token inválido', 401);
      }
      return {
        id: user.id,
        email: user.email,
        role: user.role ?? Role.User,
        accessToken: token,
        claims: { sub: user.id },
      };
    },
  };
}

export interface StartServerOptions {
  auth?: Authenticator | null;
  initialUsers?: Record<string, MockUser>;
  postgres?: boolean;
}

/** Inicializa uma instância do servidor em 127.0.0.1 com porta efêmera e diretório temporário. */
export async function startTestServer(
  options: StartServerOptions = {},
): Promise<TestServerContext> {
  const databaseUrl =
    options.initialUsers || options.postgres ? process.env.SECURITY_TEST_DATABASE_URL : undefined;
  if ((options.initialUsers || options.postgres) && !databaseUrl)
    throw new Error('PostgreSQL tests require SECURITY_TEST_DATABASE_URL');
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !url.pathname.startsWith('/checkpoint_security_')
    )
      throw new Error('Security tests require a local checkpoint_security_ database');
  }
  const dataDir = await mkdtemp(join(tmpdir(), 'checkpoint-sec-'));
  // Do not inherit storage paths, driver overrides, credentials, or Steam configuration.
  const testEnv: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
  };

  if (databaseUrl && options.initialUsers) {
    const sql = db(databaseUrl);
    const userIds = Object.values(options.initialUsers).map((u) => u.id);
    if (userIds.length > 0) {
      await sql`DELETE FROM library_entry WHERE user_id = ANY(${userIds}::uuid[])`;
      await sql`DELETE FROM game_list WHERE user_id = ANY(${userIds}::uuid[])`;
      await sql`DELETE FROM app_user WHERE id = ANY(${userIds}::uuid[])`;
      await sql`DELETE FROM library_entry WHERE game_id IN (SELECT id FROM game WHERE name LIKE 'Private game %')`;
      await sql`DELETE FROM game WHERE name LIKE 'Private game %'`;
    }
    for (const user of Object.values(options.initialUsers)) {
      await sql`INSERT INTO auth.users (id, email) VALUES (${user.id}, ${user.email ?? null})
                ON CONFLICT (id) DO NOTHING`;
      await sql`INSERT INTO app_user (id, auth_user_id, email) VALUES (${user.id}, ${user.id}, ${user.email ?? null})
                ON CONFLICT (id) DO NOTHING`;
    }
  }

  const { service, wishlist, config, track } = await createService({
    dataDir,
    env: testEnv,
    devAppUserId: databaseUrl && !options.initialUsers ? SEED_APP_USER_ID : undefined,
  }).catch(async (error) => {
    await rm(dataDir, { recursive: true, force: true });
    throw error;
  });

  const auth =
    options.auth !== undefined
      ? options.auth
      : options.initialUsers
        ? createMockAuthenticator(options.initialUsers)
        : null;

  const app = makeServer(service, auth, wishlist, null, config, track);

  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const close = async () => {
    app.server.closeAllConnections();
    await app.close();
    if (databaseUrl) await closeDb();
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  };

  return {
    baseUrl,
    port,
    dataDir,
    service,
    wishlist,
    config,
    track,
    close,
  };
}

/** Helper para requisições HTTP com timeout e cabeçalhos padrão. */
export async function testFetch(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  const signal = init.signal ?? AbortSignal.timeout(5000);
  return fetch(url, {
    ...init,
    signal,
  });
}
