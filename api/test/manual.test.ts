import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recommendGames, solveManualPoints } from '../src/scoring.ts';
import { LocalGameRepository } from '../src/repository.ts';
import { LocalManualAdjustmentRepository } from '../src/manual-repository.ts';
import { GameService } from '../src/service.ts';
import { makeServer } from '../src/server.ts';
import { seedGames } from '../src/seed.ts';
import type { Game, Desire, QueueEntry } from '../../shared/models.ts';

const genres = ['FPS', 'Puzzle', 'RPG', 'Plataforma', 'Corrida', 'Luta'];
const paces = ['Calmo', 'Moderado', 'Frenético'];
const desires: Desire[] = ['Muito Alta', 'Alta', 'Média', 'Baixa'];
const game = (i: number, patch: Partial<Game> = {}): Game => ({
  id: 'g' + String(i).padStart(2, '0'),
  name: 'Jogo ' + i,
  primaryGenre: genres[i % genres.length],
  status: 'Não iniciado',
  desire: desires[i % desires.length],
  store: 'Steam',
  platform: 'PC',
  secondaryTags: [],
  pace: paces[i % paces.length],
  structure: 'Campanha',
  actualHours: null,
  startedAt: null,
  finishedAt: null,
  rating: null,
  notes: '',
  mainHours: 5 + ((i * 7) % 50),
  extraHours: null,
  completionistHours: null,
  size: '',
  timeVerification: '',
  timeSource: '',
  reviewNotes: '',
  previousEstimatedHours: null,
  coop: '',
  mechanic: 'M' + (i % 4),
  prerequisiteId: null,
  steamAppId: null,
  steamHours: null,
  steamUpdatedAt: null,
  updatedAt: null,
  imported: {
    plannedHours: null,
    affinity: null,
    baseScore: null,
    queueScore: null,
    previousPendingId: null,
  },
  ...patch,
});
/** Contexto uniforme (mesmo gênero/ritmo/mecânica): posição monotônica nos pontos. */
const library = () =>
  Array.from({ length: 10 }, (_, i) =>
    game(i, {
      primaryGenre: 'FPS',
      pace: 'Moderado',
      mechanic: 'Tiro',
      mainHours: 5 + i * 3,
    }),
  );
/** Contexto variado: gêneros, ritmos e durações diferentes geram saltos. */
const mixedLibrary = () => Array.from({ length: 10 }, (_, i) => game(i));
const ids = (games: Game[], manual = {}) =>
  recommendGames(games, undefined, manual).items.map((i) => i.game.id);
const temp = () => mkdtemp(join(tmpdir(), 'manual-'));
const makeService = (games: Game[], dir: string) =>
  new GameService(
    new LocalGameRepository(games, join(dir, 'games.json')),
    new LocalManualAdjustmentRepository(join(dir, 'manual.json')),
  );

test('manualPoints = 0 não altera a fila nem os motivos', () => {
  const games = library();
  const plain = recommendGames(games);
  const zero = recommendGames(games, undefined, { [games[3].id]: 0 });
  assert.deepEqual(zero, plain);
  assert(plain.items.every((i) => i.manualPoints === 0));
  assert(!plain.items.some((i) => i.reasons.includes('Ajuste manual')));
  const real = recommendGames(seedGames);
  assert.deepEqual(recommendGames(seedGames, undefined, {}), real);
});

test('ajuste manual aparece como adjustment explícito e soma ao score', () => {
  const games = library();
  const before = recommendGames(games).items;
  const last = before.at(-1)!;
  const q = recommendGames(games, undefined, { [last.game.id]: 500 });
  const entry = q.items[0];
  assert.equal(entry.game.id, last.game.id);
  assert.equal(entry.manualPoints, 500);
  assert(entry.adjustments.some((a) => a.label === 'Ajuste manual' && a.points === 500));
  assert(entry.reasons.includes('Ajuste manual'));
});

for (const [name, from, to] of [
  ['para frente', 7, 3],
  ['para trás', 2, 6],
  ['para a primeira posição', 9, 1],
  ['para a última posição', 1, 10],
] as const) {
  test('solver move ' + name, () => {
    const games = library();
    const order = ids(games);
    const id = order[from - 1];
    const s = solveManualPoints(games, id, to);
    assert.equal(s.fromPosition, from);
    assert.equal(s.effectivePosition, to);
    assert(s.exact);
    assert.equal(Math.sign(s.pointsDelta), from > to ? 1 : -1);
    assert.equal(ids(games, { [id]: s.manualPoints }).indexOf(id) + 1, to);
  });
}

test('solver aproxima quando o predecessor impede a posição exata', () => {
  const games = library();
  const order = ids(games);
  // Sequência do jogo da 4ª posição não pode passar à frente dele.
  const sequel = order[8];
  const prequel = order[3];
  const withDependency = games.map((g) =>
    g.id === sequel ? { ...g, prerequisiteId: prequel } : g,
  );
  const current = ids(withDependency);
  const s = solveManualPoints(withDependency, sequel, 1);
  assert(!s.exact);
  assert.equal(s.effectivePosition, current.indexOf(prequel) + 2);
});

test('contexto não monotônico: aproxima para a posição alcançável mais próxima', () => {
  const games = mixedLibrary();
  const id = ids(games)[6];
  const s = solveManualPoints(games, id, 3);
  // Neste fixture a curva pula da 5ª direto para a 2ª posição.
  assert(!s.exact);
  assert.equal(s.effectivePosition, 2);
  assert.equal(ids(games, { [id]: s.manualPoints }).indexOf(id) + 1, 2);
});

test('serviço acumula pontos, grava histórico, persiste e zera', async () => {
  const dir = await temp();
  try {
    const games = library();
    const service = makeService(games, dir);
    const start = (await service.recommendations()).items.map((i) => i.game.id);
    const id = start[6];
    const forward = await service.reorder(id, 2);
    assert.equal(forward.effectivePosition, 2);
    assert.equal(forward.recommendations.items[1].game.id, id);
    assert(forward.pointsDelta > 0);
    const back = await service.reorder(id, 5);
    assert.equal(back.effectivePosition, 5);
    assert(back.pointsDelta < 0);
    assert.equal(back.manualPoints, Math.round((forward.pointsDelta + back.pointsDelta) * 10) / 10);
    const persisted = makeService(games, dir);
    const q = await persisted.recommendations();
    assert.equal(q.items[4].game.id, id);
    assert.equal(q.items[4].manualPoints, back.manualPoints);
    const state = await persisted.manualState();
    assert.equal(state.adjustments[0].manualPosition, 5);
    assert.deepEqual(
      state.moves.map((m) => [m.fromPosition, m.toPosition, m.kind]),
      [
        [7, 2, 'reorder'],
        [2, 5, 'reorder'],
      ],
    );
    const reset = await persisted.resetManual(id);
    assert.equal(reset.manualPoints, 0);
    assert.equal(reset.pointsDelta, -back.manualPoints);
    assert.deepEqual(
      reset.recommendations.items.map((i) => i.game.id),
      start,
    );
    assert.equal((await persisted.manualState()).adjustments.length, 0);
    assert.equal((await persisted.manualState()).moves.at(-1)!.kind, 'reset');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('API HTTP reordena, valida e zera ajuste manual', async () => {
  const dir = await temp();
  const server = makeServer(makeService(seedGames, dir));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1';
  const post = (body: unknown) =>
    fetch(base + '/queue/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const queue = await (await fetch(base + '/recommendations')).json();
    const last = queue.items.at(-1).game.id;
    let r = await post({ gameId: last, toPosition: 1 });
    assert.equal(r.status, 200);
    const moved = await r.json();
    assert.equal(moved.recommendations.items[0].game.id, last);
    assert.equal(moved.effectivePosition, 1);
    assert(moved.manualPoints > 0);
    assert.equal((await post({ gameId: last, toPosition: 0 })).status, 400);
    assert.equal((await post({ gameId: 'ausente', toPosition: 1 })).status, 404);
    const done = seedGames.find((g) => g.status === 'Finalizado')!.id;
    assert.equal((await post({ gameId: done, toPosition: 1 })).status, 409);
    const state = await (await fetch(base + '/queue/adjustments')).json();
    assert.equal(state.adjustments[0].gameId, last);
    r = await fetch(base + '/queue/adjustments/' + last, { method: 'DELETE' });
    assert.equal(r.status, 200);
    const reset = await r.json();
    assert.equal(reset.manualPoints, 0);
    assert.deepEqual(
      reset.recommendations.items.map((i: QueueEntry) => i.game.id),
      queue.items.map((i: QueueEntry) => i.game.id),
    );
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(dir, { recursive: true, force: true });
  }
});
