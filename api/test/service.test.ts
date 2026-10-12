import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalGameRepository } from '../src/repository.ts';
import { GameService } from '../src/service.ts';
import { seedGames } from '../src/seed.ts';
import { makeServer } from '../src/server.ts';
import type { GamePage, QueueEntry, Recommendations, ScoredGame } from '../../shared/models.ts';
import { defaultConfig } from '../src/scoring.ts';

test('status patch uses the combined input reader instead of separate library and settings reads', async () => {
  let stored = {
    ...seedGames[0],
    status: 'Não iniciado' as const,
    startedAt: null,
  } as (typeof seedGames)[number];
  const service = new GameService(
    {
      get: async () => structuredClone(stored),
      save: async (game) => {
        stored = structuredClone(game);
      },
      list: async () => {
        throw new Error('Unexpected separate library read');
      },
    },
    undefined,
    {
      load: async () => ({
        list: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Default',
          createdAt: '2026-10-12T00:00:00Z',
        },
        games: [stored],
        pins: [],
        settings: { config: defaultConfig, version: 0, updatedAt: null },
      }),
    },
  );
  const saved = await service.patch(stored.id, { status: 'Jogando' });
  assert.equal(saved.status, 'Jogando');
  assert.equal(saved.desire, seedGames[0].desire);
  assert(Number.isFinite(saved.baseScore));
});
test('predecessor search excludes self, handles accents and rejects inaccessible games and cycles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'predecessor-search-'));
  const seeds = ['Árvore 100%_story', 'Arvore sequel', 'Unrelated'].map((name, i) => ({
    ...seedGames[0],
    id: `search-${i}`,
    name,
    prerequisiteId: null,
  }));
  const repo = new LocalGameRepository(seeds, join(dir, 'games.json'));
  const service = new GameService(repo);
  const server = makeServer(service, null);
  try {
    await service.patch(seeds[1].id, { prerequisiteId: seeds[0].id });
    await assert.rejects(service.patch(seeds[0].id, { prerequisiteId: seeds[1].id }), /circular/);
    await assert.rejects(
      service.patch(seeds[0].id, { prerequisiteId: 'inaccessible' }),
      /não encontrado/,
    );
    await service.patch(seeds[1].id, { prerequisiteId: null });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address();
    assert(address && typeof address !== 'string');
    const search = async (query: string, excludeId = '') => {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/games/search?` +
          new URLSearchParams({ q: query, excludeId }),
      );
      return { response, games: (await response.json()) as ScoredGame[] };
    };
    assert.deepEqual((await search('ar')).games, []);
    assert.deepEqual(
      (await search('arvore', seeds[0].id)).games.map((g) => g.id),
      [seeds[1].id],
    );
    assert.deepEqual(
      (await search('100%_')).games.map((g) => g.id),
      [seeds[0].id],
    );
    assert.equal((await search('x'.repeat(121))).response.status, 400);
  } finally {
    if (server.listening) await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(dir, { recursive: true, force: true });
  }
});
test('starting parallel games persists dates without changing desire and removes queue pins', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'playing-games-'));
  try {
    const seeds = seedGames.slice(0, 2).map((g) => ({
      ...g,
      status: 'Não iniciado' as const,
      startedAt: null,
      prerequisiteId: null,
      structure: 'Campanha',
      desire: 'Alta' as const,
    }));
    const repo = new LocalGameRepository(seeds, join(dir, 'games.json'));
    const service = new GameService(repo);
    const move = await service.reorder(seeds[0].id, 1);
    await move.done;
    const started = await service.patch(seeds[0].id, { status: 'Jogando' });
    assert.equal(started.startedAt, new Date().toISOString().slice(0, 10));
    assert.equal(started.desire, 'Alta');
    assert.equal((await service.manualState()).adjustments.length, 0);
    await service.patch(seeds[1].id, { status: 'Jogando', startedAt: '2026-10-01' });
    const recommendations = await service.recommendations();
    assert.equal(recommendations.playing?.length, 2);
    assert.equal(recommendations.total, 0);
    await service.patch(seeds[0].id, { notes: 'Still playing' });
    assert.equal((await repo.get(seeds[0].id))?.startedAt, started.startedAt);
    await service.patch(seeds[0].id, { status: 'Não iniciado' });
    assert.equal((await service.recommendations()).total, 1);
    const restored = new LocalGameRepository(seeds, join(dir, 'games.json'));
    assert.equal((await restored.get(seeds[1].id))?.startedAt, '2026-10-01');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('snapshot completo, pontuações válidas e IDs únicos', async () => {
  assert.equal(seedGames.length, 481);
  assert.equal(new Set(seedGames.map((g) => g.id)).size, 481);
  const dir = await mkdtemp(join(tmpdir(), 'games-'));
  try {
    const service = new GameService(new LocalGameRepository(seedGames, join(dir, 'games.json')));
    const games = await service.all();
    assert(games.every((g) => Number.isFinite(g.baseScore) && Number.isFinite(g.affinity)));
    const q = await service.recommendations();
    assert(q.items.every((i) => Number.isFinite(i.score)));
    assert.equal(new Set(q.items.map((i) => i.game.id)).size, q.total);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('vontade preserva nota importada; nova nota conclui, recalcula e persiste', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'games-'));
  try {
    const file = join(dir, 'games.json');
    const first = {
      ...seedGames[0],
      rating: 5,
      status: 'Não iniciado' as const,
      prerequisiteId: null,
      structure: 'Campanha',
      desire: 'Baixa' as const,
    };
    const repo = new LocalGameRepository([first], file);
    const service = new GameService(repo);
    const before = (await service.all())[0].baseScore;
    await service.patch(first.id, { desire: 'Muito Alta' });
    assert.equal((await repo.get(first.id))!.status, 'Não iniciado');
    assert((await service.all())[0].baseScore > before);
    await service.patch(first.id, {
      rating: 4,
      actualHours: 12,
      notes: 'Muito bom',
    });
    assert.equal((await repo.get(first.id))!.status, 'Finalizado');
    assert.equal((await service.recommendations()).total, 0);
    const restored = new LocalGameRepository([first], file);
    assert.equal((await restored.get(first.id))!.actualHours, 12);
    assert.equal((await restored.get(first.id))!.notes, 'Muito bom');
    await service.patch(first.id, {
      status: 'Não iniciado',
      rating: 3,
      autoFinish: false,
    });
    assert.equal((await repo.get(first.id))!.status, 'Não iniciado');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('validação rejeita notas, tags e campos inválidos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'games-'));
  try {
    const service = new GameService(
      new LocalGameRepository([seedGames[0]], join(dir, 'games.json')),
    );
    for (const body of [
      { rating: 0 },
      { actualHours: -1 },
      { secondaryTags: ['a', 'b', 'c', 'd'] },
      { id: 'change' },
      { finishedAt: '2026-02-30' },
    ])
      await assert.rejects(service.patch(seedGames[0].id, body));
    await assert.rejects(service.patch('ausente', { notes: 'x' }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('API HTTP filtra, avalia, recalcula, retorna erros e serve contrato', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'games-'));
  const service = new GameService(new LocalGameRepository(seedGames, join(dir, 'games.json')));
  const server = makeServer(service);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  try {
    let r = await fetch(base + '/api/v1/games?pageSize=2');
    const page = (await r.json()) as GamePage;
    assert.equal(page.total, 481);
    assert.equal(page.items.length, 2);
    const id = page.items[0].id;
    r = await fetch(base + '/api/v1/games/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 4.5, actualHours: 9 }),
    });
    assert.equal(r.status, 200);
    const game = (await r.json()) as ScoredGame;
    assert.equal(game.status, 'Finalizado');
    const queue = (await (await fetch(base + '/api/v1/recommendations')).json()) as Recommendations;
    assert(!queue.items.some((i: QueueEntry) => i.game.id === id));
    assert.equal(
      (
        await fetch(base + '/api/v1/games/' + id, {
          method: 'PATCH',
          body: 'invalid',
        })
      ).status,
      400,
    );
    assert.equal((await fetch(base + '/api/v1/games/absent')).status, 404);
    const spec = (await (await fetch(base + '/api/v1/openapi.json')).json()) as { openapi: string };
    assert.equal(spec.openapi, '3.1.0');
    const html = await (await fetch(base + '/ordem')).text();
    assert(html.includes('<app-root>'));
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(dir, { recursive: true, force: true });
  }
});
