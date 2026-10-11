import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createAuthenticator, type Authenticator } from '../src/auth.ts';
import { getContext, runWithContext, setContext, requireUserId } from '../src/context.ts';
import { AppError } from '../src/service.ts';

const ISSUER = 'https://exemplo.supabase.co/auth/v1';
const USER_ID = '7c0f7b4e-9a1d-4a39-8f43-111111111111';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
  const auth = createAuthenticator({ key: createLocalJWKSet({ keys: [jwk] }), issuer: ISSUER });
  const sign = (exp: string | number = '1h', { iss = ISSUER, aud = 'authenticated' } = {}) =>
    new SignJWT({ email: 'gamer@exemplo.com', role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject(USER_ID)
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey);
  return { auth, sign };
}

const rejects401 = (p: Promise<unknown>, message?: RegExp) =>
  assert.rejects(p, (e: unknown) => {
    assert(e instanceof AppError);
    assert.equal(e.code, 401);
    if (message) assert.match(e.message, message);
    return true;
  });

test('auth: token válido devolve o usuário', async () => {
  const { auth, sign } = await setup();
  const token = await sign();
  const user = await auth.authenticate('Bearer ' + token);
  assert.equal(user.id, USER_ID);
  assert.equal(user.email, 'gamer@exemplo.com');
  assert.equal(user.accessToken, token);
});

test('auth: header ausente ou malformado → 401', async () => {
  const { auth } = await setup();
  await rejects401(auth.authenticate(undefined), /necessária/);
  await rejects401(auth.authenticate('Basic abc'), /necessária/);
  await rejects401(auth.authenticate('Bearer nao-e-um-jwt'), /inválido/);
});

test('auth: token expirado → 401 "Sessão expirada"', async () => {
  const { auth, sign } = await setup();
  const token = await sign(Math.floor(Date.now() / 1000) - 60);
  await rejects401(auth.authenticate('Bearer ' + token), /expirada/);
});

test('auth: assinatura de outra chave, issuer ou audience errados → 401', async () => {
  const { auth, sign } = await setup();
  const other = await setup();
  await rejects401(auth.authenticate('Bearer ' + (await other.sign())), /inválido/);
  await rejects401(auth.authenticate('Bearer ' + (await sign('1h', { aud: 'anon' }))));
  await rejects401(auth.authenticate('Bearer ' + (await sign('1h', { iss: 'https://outro' }))));
});

test('auth: token HS256 sem fallback → 401; com fallback delega', async () => {
  const { auth } = await setup();
  const hs = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER_ID)
    .sign(new TextEncoder().encode('segredo-de-teste-com-32-caracteres!!'));
  await rejects401(auth.authenticate('Bearer ' + hs));
  const withFallback = createAuthenticator({
    key: createLocalJWKSet({ keys: [] }),
    fallback: async (token) => ({ id: 'remoto', accessToken: token, claims: {} }),
  });
  assert.equal((await withFallback.authenticate('Bearer ' + hs)).id, 'remoto');
});

test('contexto: isolado por execução, com setContext e requireUserId', async () => {
  assert.equal(getContext(), undefined);
  assert.throws(() => requireUserId());
  const seen = await Promise.all(
    ['a', 'b'].map((id) =>
      runWithContext({ requestId: 'req-' + id }, async () => {
        await new Promise((r) => setTimeout(r, id === 'a' ? 15 : 1));
        setContext({ userId: 'user-' + id });
        await Promise.resolve();
        return [getContext()?.requestId, requireUserId()];
      }),
    ),
  );
  assert.deepEqual(seen, [
    ['req-a', 'user-a'],
    ['req-b', 'user-b'],
  ]);
  assert.equal(getContext(), undefined);
  runWithContext({}, () => assert.match(getContext()!.requestId, /^[0-9a-f-]{36}$/));
});

test('servidor: /api exige Bearer, health/config são públicos e o contexto chega ao serviço', async () => {
  const { auth, sign } = await setup();
  const { LocalGameRepository } = await import('../src/repository.ts');
  const { GameService } = await import('../src/service.ts');
  const { seedGames } = await import('../src/seed.ts');
  const { makeServer } = await import('../src/server.ts');
  const dir = await mkdtemp(join(tmpdir(), 'auth-'));
  const service = new GameService(new LocalGameRepository(seedGames, join(dir, 'games.json')));
  let userInService: string | undefined;
  const original = service.catalog.bind(service);
  service.catalog = async () => {
    userInService = getContext()?.userId;
    return original();
  };
  const server = makeServer(service, auth as Authenticator);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  try {
    assert.equal((await fetch(base + '/api/v1/health')).status, 200);
    assert.equal((await fetch(base + '/api/v1/config')).status, 200);
    const anon = await fetch(base + '/api/v1/catalog');
    assert.equal(anon.status, 401);
    assert.deepEqual(await anon.json(), { error: { message: 'Autenticação necessária' } });
    const expired = await fetch(base + '/api/v1/catalog', {
      headers: { Authorization: 'Bearer ' + (await sign(Math.floor(Date.now() / 1000) - 5)) },
    });
    assert.equal(expired.status, 401);
    const ok = await fetch(base + '/api/v1/catalog', {
      headers: { Authorization: 'Bearer ' + (await sign()) },
    });
    assert.equal(ok.status, 200);
    assert.equal(userInService, USER_ID);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
