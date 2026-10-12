// Memory-adapter release behavior; PostgreSQL controls require separate integration validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bumpVersion,
  compareSemver,
  createRelease,
  ensureRelease,
  MemoryReleaseStore,
  parseReleaseInput,
  resolveVersion,
  type Release,
} from '../src/releases.ts';
import { LocalGameRepository } from '../src/repository.ts';
import { GameService } from '../src/service.ts';
import { makeServer } from '../src/server.ts';
import { seedGames } from '../src/seed.ts';

const SHA1 = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);
const input = (patch: Record<string, unknown> = {}) =>
  parseReleaseInput({ description: 'Corrige o arraste', gitSha: SHA1, ...patch });

test('SemVer: primeira versão, patch/minor/major e comparação', () => {
  assert.equal(bumpVersion(null), '0.0.1');
  assert.equal(bumpVersion('0.0.1'), '0.0.2');
  assert.equal(bumpVersion('0.0.9'), '0.0.10');
  assert.equal(bumpVersion('0.3.7', 'minor'), '0.4.0');
  assert.equal(bumpVersion('0.3.7', 'major'), '1.0.0');
  assert.equal(bumpVersion(null, 'major'), '1.0.0');
  assert(compareSemver('0.0.10', '0.0.9') > 0);
  assert(compareSemver('1.0.0', '0.99.99') > 0);
  assert.equal(resolveVersion('0.0.5', { bump: 'patch', version: '1.0.0' }), '1.0.0');
  assert.throws(() => resolveVersion('1.0.0', { bump: 'patch', version: '0.9.0' }), /maior/);
  assert.throws(() => resolveVersion('1.0.0', { bump: 'patch', version: '1.0.0' }), /maior/);
});

test('validation do POST', () => {
  const ok = input({ kind: 'fix', name: ' Listas ', gitSha: SHA1.toUpperCase() });
  assert.equal(ok.kind, 'fix');
  assert.equal(ok.name, 'Listas');
  assert.equal(ok.gitSha, SHA1);
  assert.equal(ok.environment, 'production');
  assert.equal(input().kind, 'chore');
  for (const bad of [
    { description: 'ab' },
    { description: 'x'.repeat(501) },
    { kind: 'rollback' },
    { kind: 'hotfix' },
    { bump: 'mega' },
    { version: '1.0' },
    { version: 'v1.0.0' },
    { version: '1.0.0', bump: 'major' },
    { gitSha: 'main' },
    { gitSha: SHA1.slice(0, 7) },
    { gitSha: SHA1.slice(0, 39) },
    { gitSha: SHA1 + 'a' },
    { gitSha: undefined },
    { environment: 'staging' },
    { name: 'x'.repeat(81) },
    { id: 3 },
  ])
    assert.throws(() => input(bad), /./, JSON.stringify(bad));
});

test('createRelease: numeração por environment, idempotência por commit e corrida', async () => {
  const store = new MemoryReleaseStore();
  const a = await createRelease(store, input());
  assert.equal(a.release.version, '0.0.1');
  assert(a.created);
  const again = await createRelease(store, input({ description: 'Outra descrição' }));
  assert.equal(again.created, false);
  assert.equal(again.release.id, a.release.id);
  assert.equal((await createRelease(store, input({ gitSha: SHA1.toUpperCase() }))).created, false);
  const b = await createRelease(store, input({ gitSha: SHA2, bump: 'minor' }));
  assert.equal(b.release.version, '0.1.0');
  const prev = await createRelease(store, input({ gitSha: SHA2, environment: 'preview' }));
  assert.equal(prev.release.version, '0.0.1'); // Independent preview numbering.
  const launch = await createRelease(
    store,
    input({ gitSha: 'c'.repeat(40), kind: 'release', version: '1.0.0' }),
  );
  assert.equal(launch.release.version, '1.0.0');
  await assert.rejects(
    createRelease(store, input({ gitSha: 'd'.repeat(40), version: '0.5.0' })),
    /maior/,
  );
  // Rollback creates a new event for the target commit.
  const rb = await createRelease(store, {
    ...input({ description: 'Rollback para v0.0.1' }),
    kind: 'rollback',
    rollbackTo: a.release.id,
  });
  assert(rb.created);
  assert.equal(rb.release.version, '1.0.1');
  assert.equal((await store.latest('production'))!.id, rb.release.id);

  // Recalculate after another registration wins.
  const racing = new MemoryReleaseStore();
  const realLatest = racing.latest.bind(racing);
  let stale = true;
  racing.latest = async (env) => {
    if (stale) {
      stale = false;
      await createRelease(racing, input({ gitSha: 'e'.repeat(40) })); // Occupy 0.0.1.
      return null; // Simulate a stale read.
    }
    return realLatest(env);
  };
  const won = await createRelease(racing, input());
  assert.equal(won.release.version, '0.0.2');
});

test('ensureRelease (build): reaproveita a versão do push ou cria uma automática', async () => {
  const store = new MemoryReleaseStore();
  const pushed = await createRelease(store, input({ kind: 'feature', name: 'Listas' }));
  const deploy = {
    vercelDeploymentId: 'dpl_1',
    vercelUrl: 'x.vercel.app',
    dbMigrationVersion: '1',
  };
  const base = { gitSha: SHA1, gitRef: 'main', environment: 'production' as const };
  const linked = await ensureRelease(store, { ...base, commitMessage: 'feat: x' }, deploy);
  assert.equal(linked.created, false);
  assert.equal(linked.release.id, pushed.release.id);
  assert.equal((await store.latest('production'))!.deploy?.vercelDeploymentId, 'dpl_1');
  await ensureRelease(
    store,
    { ...base, commitMessage: null },
    { ...deploy, vercelDeploymentId: 'dpl_1_retry' },
  );
  assert.equal((await store.latest('production'))!.deploy?.vercelDeploymentId, 'dpl_1_retry');
  const auto = await ensureRelease(
    store,
    { ...base, gitSha: SHA2, commitMessage: 'fix(web): ajusta o topo\n\ncorpo' },
    { ...deploy, vercelDeploymentId: 'dpl_2' },
  );
  assert(auto.created);
  assert.equal(auto.release.version, '0.0.2');
  assert.equal(auto.release.description, 'fix(web): ajusta o topo');
  assert.equal(auto.release.createdBy, 'vercel-build');
  const noMsg = await ensureRelease(
    store,
    { ...base, gitSha: 'f'.repeat(40), commitMessage: null },
    { ...deploy, vercelDeploymentId: 'dpl_3' },
  );
  assert.equal(noMsg.release.description, 'Deploy fffffff');
});

test('rollback builds reuse the newest matching registration without suppressing rollback events', async () => {
  const store = new MemoryReleaseStore();
  const original = await createRelease(store, input());
  await createRelease(store, input({ gitSha: SHA2 }));
  const rollbackInput = {
    ...input(),
    kind: 'rollback' as const,
    rollbackTo: original.release.id,
  };
  const rollback = await createRelease(store, rollbackInput);
  const base = {
    gitSha: SHA1.toUpperCase(),
    gitRef: 'main',
    environment: 'production' as const,
    commitMessage: 'Rollback',
  };
  const deploy = { vercelDeploymentId: 'dpl_rollback', vercelUrl: null, dbMigrationVersion: null };
  const built = await ensureRelease(store, base, deploy);
  assert.equal(built.created, false);
  assert.equal(built.release.id, rollback.release.id);
  assert.equal((await store.latest('production'))?.deploy?.vercelDeploymentId, 'dpl_rollback');
  const repeated = await createRelease(store, rollbackInput);
  assert.equal(repeated.created, true);
  assert.equal(repeated.release.version, '0.0.4');
  assert.equal(
    (await ensureRelease(store, base, { ...deploy, vercelDeploymentId: 'dpl_rollback_2' })).release
      .id,
    repeated.release.id,
  );
  assert.equal((await store.list('production', 100, null)).length, 4);
});

test('concurrent registrations of one commit create one record', async () => {
  const store = new MemoryReleaseStore();
  const results = await Promise.all(Array.from({ length: 3 }, () => createRelease(store, input())));
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(new Set(results.map((result) => result.release.id)).size, 1);
  assert.equal((await store.list('production', 100, null)).length, 1);
});

test('HTTP: GET público, POST com token, 405 para PATCH/PUT/DELETE', async () => {
  const store = new MemoryReleaseStore();
  const dir = await mkdtemp(join(tmpdir(), 'releases-'));
  const service = new GameService(new LocalGameRepository(seedGames, join(dir, 'games.json')));
  const server = makeServer(service, null, null, store).listen(0);
  const prevToken = process.env.RELEASE_API_TOKEN;
  process.env.RELEASE_API_TOKEN = 'segredo-de-teste';
  try {
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/releases`;
    const call = (path: string, method = 'GET', body?: unknown, token?: string) =>
      fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    assert.equal((await call('/latest')).status, 404);
    const body = { description: 'Primeira versão', gitSha: SHA1, kind: 'feature' };
    assert.equal(
      (await call('', 'POST', { ...body, gitSha: SHA1.slice(0, 7) }, 'segredo-de-teste')).status,
      400,
    );
    assert.equal((await call('', 'POST', body)).status, 401);
    assert.equal((await call('', 'POST', body, 'errado')).status, 401);
    assert.equal(
      (await call('', 'POST', { ...body, description: 'x' }, 'segredo-de-teste')).status,
      400,
    );
    const created = await call('', 'POST', body, 'segredo-de-teste');
    assert.equal(created.status, 201);
    const r = (await created.json()) as Release & { created: boolean };
    assert.equal(r.version, '0.0.1');
    assert.equal(r.createdBy, 'api');
    const same = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-release-token': 'segredo-de-teste' },
      body: JSON.stringify(body),
    });
    assert.equal(same.status, 200);
    assert.equal(((await same.json()) as { created: boolean }).created, false);
    await call('', 'POST', { ...body, gitSha: SHA2, description: 'Segunda' }, 'segredo-de-teste');
    const page = (await (await call('?limit=1')).json()) as {
      items: Release[];
      nextBefore: number;
    };
    assert.equal(page.items[0].version, '0.0.2');
    const rest = (await (await call(`?before=${page.nextBefore}`)).json()) as { items: Release[] };
    assert.deepEqual(
      rest.items.map((x) => x.version),
      ['0.0.1'],
    );
    assert.equal(((await (await call('/latest')).json()) as Release).version, '0.0.2');
    assert.equal((await call('?environment=staging')).status, 400);
    for (const [path, method] of [
      ['', 'PATCH'],
      ['', 'PUT'],
      ['', 'DELETE'],
      ['/latest', 'POST'],
      ['/latest', 'DELETE'],
    ]) {
      const res = await call(path, method, {}, 'segredo-de-teste');
      assert.equal(res.status, 405, `${method} ${path}`);
      assert.match(res.headers.get('allow') ?? '', /GET/);
    }
    assert.equal((await call('/1')).status, 404); // No release-by-ID route exists.
    delete process.env.RELEASE_API_TOKEN;
    assert.equal((await call('', 'POST', body, 'segredo-de-teste')).status, 503);
  } finally {
    if (prevToken === undefined) delete process.env.RELEASE_API_TOKEN;
    else process.env.RELEASE_API_TOKEN = prevToken;
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
