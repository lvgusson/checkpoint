import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { LocalGameRepository } from '../src/repository.ts';
import { LocalManualAdjustmentRepository } from '../src/manual-repository.ts';
import { LocalScoringConfigRepository } from '../src/settings-repository.ts';
import { LocalListRepository, LOCAL_DEFAULT_LIST_ID } from '../src/list-repository.ts';
import { GameService } from '../src/service.ts';
import { makeServer } from '../src/server.ts';
import { defaultConfig } from '../src/scoring.ts';
import { seedGames } from '../src/seed.ts';
import type {
  GameList,
  ManualState,
  Recommendations,
  ScoringSettings,
} from '../../shared/models.ts';

const makeService = (dir: string) =>
  new GameService(
    new LocalGameRepository(seedGames, join(dir, 'games.json')),
    new LocalManualAdjustmentRepository(join(dir, 'manual.json')),
    null,
    new LocalScoringConfigRepository(join(dir, 'settings.json')),
    new LocalListRepository(join(dir, 'lists.json')),
  );
const ids = (q: Recommendations) => q.items.map((i) => i.game.id);

test('cada lista tem regras e ajustes próprios; não apaga a última', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lists-'));
  try {
    const service = makeService(dir);
    const [main] = await service.allLists();
    assert.equal(main.name, 'Principal');
    const short = await service.createList({ name: 'Curtos' });
    await assert.rejects(service.createList({ name: ' CURTOS ' }), /Já existe/);
    await assert.rejects(service.createList({ name: '' }), /1 a 60/);

    // Regras diferentes => filas diferentes; a lista padrão não muda.
    const before = await service.recommendations(main.id);
    const config = structuredClone(defaultConfig);
    config.rules.excludeCompetitive = true;
    config.weights.desire = 0;
    await service.saveScoringSettings(config, short.id);
    const a = await service.recommendations(main.id);
    const b = await service.recommendations(short.id);
    assert.equal(a.listId, main.id);
    assert.equal(b.listId, short.id);
    assert.deepEqual(ids(a), ids(before));
    assert.notDeepEqual(ids(b), ids(a));
    assert(b.total < a.total);
    assert.equal((await service.scoringSettings(main.id)).version, 0);
    assert.equal((await service.scoringSettings(short.id)).version, 1);

    // Ajuste manual numa lista não afeta a outra.
    const last = a.items.at(-1)!.game.id;
    const moved = await service.reorder(last, 1, main.id);
    assert.equal(moved.recommendations.listId, main.id);
    assert.equal((await service.recommendations(main.id)).items[0].game.id, last);
    assert.equal((await service.manualState(main.id)).adjustments.length, 1);
    assert.equal((await service.manualState(short.id)).adjustments.length, 0);
    assert.deepEqual(ids(await service.recommendations(short.id)), ids(b));

    // Sem listId = lista padrão (a mais antiga).
    assert.equal((await service.recommendations()).listId, main.id);

    // Persistência em arquivo: outra instância lê as mesmas listas e ajustes.
    const again = makeService(dir);
    assert.deepEqual(
      (await again.allLists()).map((l) => l.name),
      ['Principal', 'Curtos'],
    );
    assert.equal((await again.recommendations(main.id)).items[0].game.id, last);

    // Renomear, apagar, e a última lista fica.
    assert.equal((await service.renameList(short.id, { name: 'Rápidos' })).name, 'Rápidos');
    await assert.rejects(service.renameList(randomUUID(), { name: 'x' }), /Lista não encontrada/);
    await assert.rejects(service.recommendations(randomUUID()), /Lista não encontrada/);
    await assert.rejects(service.recommendations('nao-e-uuid'), /Lista não encontrada/);
    await service.deleteList(short.id);
    await assert.rejects(service.deleteList(short.id), /Lista não encontrada/);
    await assert.rejects(service.deleteList(main.id), /única lista/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('arquivos antigos (sem lista) caem na lista padrão', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lists-old-'));
  try {
    const gameId = seedGames.find((g) => g.status === 'Não iniciado')!.id;
    await writeFile(
      join(dir, 'manual.json'),
      JSON.stringify({
        adjustments: [{ gameId, manualPoints: 42, manualPosition: 1, updatedAt: '2026-01-01' }],
        moves: [],
      }),
    );
    const service = makeService(dir);
    const [main] = await service.allLists();
    assert.equal(main.id, LOCAL_DEFAULT_LIST_ID);
    assert.equal((await service.manualState()).adjustments[0].manualPoints, 42);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('API HTTP: CRUD de listas e rotas por lista', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lists-api-'));
  const server = makeServer(makeService(dir), null).listen(0);
  try {
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    const call = (path: string, method = 'GET', body?: unknown) =>
      fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const json = async <T>(r: Promise<Response> | Response) => (await (await r).json()) as T;

    const [main] = await json<GameList[]>(call('/lists'));
    let r = await call('/lists', 'POST', { name: 'Fim de semana' });
    assert.equal(r.status, 201);
    const weekend = await json<GameList>(r);
    assert.equal((await call('/lists', 'POST', { name: 'fim de semana' })).status, 409);
    assert.equal((await call('/lists', 'POST', { name: 'x'.repeat(61) })).status, 400);

    const settings = await json<ScoringSettings>(call(`/lists/${weekend.id}/settings/scoring`));
    assert.equal(settings.listId, weekend.id);
    r = await call(`/lists/${weekend.id}/settings/scoring`, 'PUT', {
      weights: settings.config.weights,
      rules: { ...settings.config.rules, manual: false },
    });
    assert.equal(r.status, 200);
    assert.equal((await json<ScoringSettings>(r)).version, 1);
    // A lista padrão (rota sem prefixo) não mudou.
    assert.equal((await json<ScoringSettings>(call('/settings/scoring'))).version, 0);
    assert.equal((await json<ScoringSettings>(call('/settings/scoring'))).listId, main.id);

    const q = await json<Recommendations>(call(`/lists/${weekend.id}/recommendations`));
    assert.equal(q.listId, weekend.id);
    const gameId = q.items.at(-1)!.game.id;
    // Ajuste manual desligado só nesta lista.
    r = await call(`/lists/${weekend.id}/queue/reorder`, 'POST', { gameId, toPosition: 1 });
    assert.equal(r.status, 409);
    r = await call(`/lists/${main.id}/queue/reorder`, 'POST', { gameId, toPosition: 1 });
    assert.equal(r.status, 200);
    const state = await json<ManualState>(call(`/lists/${main.id}/queue/adjustments`));
    assert.equal(state.adjustments[0].gameId, gameId);
    assert.equal(
      (await json<ManualState>(call(`/lists/${weekend.id}/queue/adjustments`))).adjustments.length,
      0,
    );
    r = await call(`/lists/${main.id}/queue/adjustments/${gameId}`, 'DELETE');
    assert.equal(r.status, 200);
    r = await call(`/lists/${weekend.id}/settings/scoring/reset`, 'POST');
    assert.equal((await json<ScoringSettings>(r)).version, 2);

    assert.equal((await call(`/lists/${randomUUID()}/recommendations`)).status, 404);
    assert.equal((await call('/lists/abc/recommendations')).status, 404);
    r = await call(`/lists/${weekend.id}`, 'PATCH', { name: 'Sábado' });
    assert.equal((await json<GameList>(r)).name, 'Sábado');
    assert.equal((await call(`/lists/${weekend.id}`, 'DELETE')).status, 204);
    assert.equal((await call(`/lists/${weekend.id}`, 'DELETE')).status, 404);
    assert.equal((await call(`/lists/${main.id}`, 'DELETE')).status, 409);
    assert.equal((await json<GameList[]>(call('/lists'))).length, 1);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
