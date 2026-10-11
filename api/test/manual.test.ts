import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recommendGames, planMove, defaultConfig, type ManualPin } from '../src/scoring.ts';
import { LocalGameRepository } from '../src/repository.ts';
import { LocalManualAdjustmentRepository } from '../src/manual-repository.ts';
import { LOCAL_DEFAULT_LIST_ID } from '../src/list-repository.ts';
import { GameService } from '../src/service.ts';
import { makeServer } from '../src/server.ts';
import { seedGames } from '../src/seed.ts';
import type {
  Game,
  Desire,
  ManualMove,
  ManualResetResult,
  ManualState,
  QueueEntry,
  ReorderAccepted,
  Recommendations,
} from '../../shared/models.ts';

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
/** Contexto variado: gêneros, ritmos e durações diferentes (com pontos, a curva tinha saltos). */
const library = () => Array.from({ length: 10 }, (_, i) => game(i));
const ids = (games: Game[], pins: ManualPin[] = []) =>
  recommendGames(games, undefined, pins).items.map((i) => i.game.id);
const temp = () => mkdtemp(join(tmpdir(), 'manual-'));
const makeService = (games: Game[], dir: string) => {
  const service = new GameService(
    new LocalGameRepository(games, join(dir, 'games.json')),
    new LocalManualAdjustmentRepository(join(dir, 'manual.json')),
  );
  service.retryOptions = { sleep: async () => {} };
  return service;
};
/** O que o front faz ao soltar: remove e insere. */
const splice = (order: string[], id: string, to: number) => {
  const next = order.filter((x) => x !== id);
  next.splice(to - 1, 0, id);
  return next;
};

test('sem pins a fila é a do algoritmo', () => {
  const games = library();
  assert.deepEqual(recommendGames(games, undefined, []), recommendGames(games));
  assert(recommendGames(games).items.every((i) => i.pinnedPosition === null));
  assert.deepEqual(recommendGames(seedGames, undefined, []), recommendGames(seedGames));
});

for (const [name, from, to] of [
  ['para frente', 7, 3],
  ['para trás', 2, 6],
  ['para a primeira posição', 9, 1],
  ['para a última posição', 1, 10],
] as const) {
  test('pin fica exatamente onde foi solto: ' + name, () => {
    const games = library();
    const id = ids(games)[from - 1];
    const q = recommendGames(games, undefined, [{ gameId: id, position: to }]);
    const entry = q.items[to - 1];
    assert.equal(entry.game.id, id);
    assert.equal(entry.pinnedPosition, to);
    assert.equal(entry.reasons[0], 'Posição fixada por você');
    assert.equal(q.total, 10);
  });
}

test('merge: fila por pontuação SEM os fixados + fixados inseridos em X (sem recalcular contexto)', () => {
  const games = library();
  const [x, y] = [ids(games)[6], ids(games)[2]];
  const q = recommendGames(games, undefined, [
    { gameId: x, position: 2 },
    { gameId: y, position: 5 },
  ]);
  const rest = recommendGames(games.filter((g) => g.id !== x && g.id !== y));
  const expected = rest.items.map((i) => i.game.id);
  expected.splice(1, 0, x);
  expected.splice(4, 0, y);
  assert.deepEqual(
    q.items.map((i) => i.game.id),
    expected,
  );
  // Os não fixados mantêm score e ajustes da fila calculada sem os fixos.
  const scores = new Map(rest.items.map((i) => [i.game.id, i.score]));
  for (const i of q.items)
    if (i.pinnedPosition === null) assert.equal(i.score, scores.get(i.game.id));
  assert.deepEqual(
    q.items.map((i) => i.position),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
});

test('dois pins na mesma posição: o mais recente fica, o outro desce; além do fim vai para o fim', () => {
  const games = library();
  const [a, b, c] = ids(games).slice(-3);
  const q = ids(games, [
    { gameId: a, position: 2 },
    { gameId: b, position: 2 },
    { gameId: c, position: 999 },
  ]);
  assert.equal(q[1], b);
  assert.equal(q[2], a);
  assert.equal(q[9], c);
});

test('pin antes do predecessor fica onde foi solto, com aviso', () => {
  const games = library();
  const order = ids(games);
  const [prequel, sequel] = [order[3], order[8]];
  const withDependency = games.map((g) =>
    g.id === sequel ? { ...g, prerequisiteId: prequel } : g,
  );
  const q = recommendGames(withDependency, undefined, [{ gameId: sequel, position: 1 }]);
  assert.equal(q.items[0].game.id, sequel);
  assert.equal(q.items[0].pinnedBeforePrerequisite, true);
  assert(q.items[0].reasons.includes('Antes do jogo anterior da série'));
  assert(q.items.slice(1).every((i) => !i.pinnedBeforePrerequisite));
  const off = recommendGames(
    withDependency,
    { ...defaultConfig, rules: { ...defaultConfig.rules, prerequisites: false } },
    [{ gameId: sequel, position: 1 }],
  );
  assert.equal(off.items[0].game.id, sequel);
  assert.equal(off.items[0].pinnedBeforePrerequisite, false);
  // Predecessor fixado não bloqueia a continuação na fila por pontuação.
  const pre = recommendGames(withDependency, undefined, [{ gameId: prequel, position: 10 }]);
  assert.equal(pre.total, 10);
  assert.equal(pre.items.find((i) => i.game.id === sequel)!.pinnedBeforePrerequisite, true);
});

test('vontade Imediata vai ao topo (entre si pelo score) e os pins entram depois', () => {
  const games = library();
  const order = ids(games);
  const urgent = [order[9], order[7]];
  const withUrgent = games.map((g) =>
    urgent.includes(g.id) ? { ...g, desire: 'Imediata' as const } : g,
  );
  const q = recommendGames(withUrgent);
  assert.deepEqual(new Set(q.items.slice(0, 2).map((i) => i.game.id)), new Set(urgent));
  assert(q.items[0].reasons.includes('Vontade imediata'));
  const pinned = recommendGames(withUrgent, undefined, [{ gameId: order[0], position: 1 }]);
  assert.equal(pinned.items[0].game.id, order[0]);
  assert.deepEqual(new Set(pinned.items.slice(1, 3).map((i) => i.game.id)), new Set(urgent));
});

test('regra manual desligada ignora os pins', () => {
  const games = library();
  const id = ids(games)[9];
  const off = { ...defaultConfig, rules: { ...defaultConfig.rules, manual: false } };
  const q = recommendGames(games, off, [{ gameId: id, position: 1 }]);
  assert.deepEqual(
    q.items.map((i) => i.game.id),
    ids(games),
  );
  assert(q.items.every((i) => i.pinnedPosition === null));
});

test('planMove reproduz o arraste do front e reindexa os pins que mudaram de lugar', () => {
  const games = library();
  const pinned = ids(games)[4];
  const pins = [{ gameId: pinned, position: 3 }];
  const before = recommendGames(games, undefined, pins);
  const visible = before.items.map((i) => i.game.id);
  assert.equal(visible[2], pinned);
  // Move o primeiro para a 6ª: na tela o pin da 3ª sobe para a 2ª, e o plano acompanha.
  const moved = visible[0];
  const plan = planMove(before, moved, 6);
  assert.equal(plan.fromPosition, 1);
  assert.deepEqual(plan.pins, [
    { gameId: pinned, position: 2 },
    { gameId: moved, position: 6 },
  ]);
  const after = ids(games, [...pins, ...plan.pins]);
  assert.equal(after[5], moved);
  assert.equal(after[1], pinned);
  assert.equal(after.indexOf(moved), splice(visible, moved, 6).indexOf(moved));
  assert.throws(() => planMove(before, moved, 11), RangeError);
  assert.throws(() => planMove(before, 'ausente', 1), RangeError);
  // Arrastar um jogo já fixado só troca o X dele.
  const again = planMove(recommendGames(games, undefined, pins), pinned, 7);
  assert.deepEqual(again.pins, [{ gameId: pinned, position: 7 }]);
});

test('a fila depois de vários arrastes é exatamente a da tela', () => {
  const games = library();
  let pins: ManualPin[] = [];
  let shown = ids(games);
  for (const [from, to] of [
    [10, 1],
    [1, 4],
    [6, 8],
    [3, 3],
    [8, 2],
  ]) {
    const id = shown[from - 1];
    const plan = planMove(recommendGames(games, undefined, pins), id, to);
    pins = [...pins.filter((p) => !plan.pins.some((n) => n.gameId === p.gameId)), ...plan.pins];
    shown = splice(shown, id, to);
    const q = ids(games, pins);
    // Todo jogo fixado está exatamente onde aparece na tela.
    for (const p of pins) assert.equal(q.indexOf(p.gameId), shown.indexOf(p.gameId), p.gameId);
  }
});

test('serviço: aceita na hora, grava em background, persiste e solta o pin', async () => {
  const dir = await temp();
  try {
    const games = library();
    const service = makeService(games, dir);
    const start = (await service.recommendations()).items.map((i) => i.game.id);
    const id = start[6];
    const first = await service.reorder(id, 2);
    assert.deepEqual(first.accepted, {
      accepted: true,
      gameId: id,
      fromPosition: 7,
      toPosition: 2,
    });
    await first.done;
    assert.equal((await service.recommendations()).items[1].game.id, id);
    await (
      await service.reorder(id, 5)
    ).done;
    assert.equal((await service.recommendations()).items[4].game.id, id);

    const persisted = makeService(games, dir);
    const reread = await persisted.recommendations();
    assert.equal(reread.items[4].game.id, id);
    assert.equal(reread.items[4].pinnedPosition, 5);
    const state = await persisted.manualState();
    assert.equal(state.adjustments.length, 1);
    assert.equal(state.adjustments[0].manualPosition, 5);
    assert.deepEqual(
      state.moves.map((m) => [m.fromPosition, m.toPosition, m.kind]),
      [
        [7, 2, 'reorder'],
        [2, 5, 'reorder'],
      ],
    );
    const reset = await persisted.resetManual(id);
    assert.equal(reset.removed, true);
    assert.deepEqual(
      reset.recommendations.items.map((i) => i.game.id),
      start,
    );
    assert.equal((await persisted.manualState()).adjustments.length, 0);
    assert.equal((await persisted.manualState()).moves.at(-1)!.kind, 'reset');
    assert.equal((await persisted.resetManual(id)).removed, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('finalizar um jogo fixado remove o pin', async () => {
  const dir = await temp();
  try {
    const games = library();
    const service = makeService(games, dir);
    const id = ids(games)[9];
    await (
      await service.reorder(id, 1)
    ).done;
    assert.equal((await service.manualState()).adjustments.length, 1);
    await service.patch(id, { rating: 4 });
    assert.equal((await service.manualState()).adjustments.length, 0);
    assert.equal((await service.manualState()).moves.at(-1)!.kind, 'reset');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('movimentos rápidos são aplicados em ordem e cada jogo fica onde foi solto', async () => {
  const dir = await temp();
  try {
    const games = library();
    const service = makeService(games, dir);
    let shown = (await service.recommendations()).items.map((i) => i.game.id);
    const moves: [string, number][] = [
      [shown[9], 1],
      [shown[0], 4],
      [shown[5], 8],
    ];
    const tickets = [];
    for (const [id, to] of moves) {
      tickets.push(await service.reorder(id, to));
      shown = splice(shown, id, to);
    }
    await Promise.all(tickets.map((t) => t.done));
    const q = (await service.recommendations()).items.map((i) => i.game.id);
    for (const [id] of moves) assert.equal(q.indexOf(id), shown.indexOf(id), id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a resposta não espera a gravação; falhas temporárias são retentadas', async () => {
  const games = library();
  const manual = new LocalManualAdjustmentRepository();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const realPin = manual.pin.bind(manual);
  manual.pin = async (listId: string, pins: ManualPin[], move: ManualMove) => {
    calls++;
    await gate;
    if (calls < 3) throw new Error('banco indisponível');
    return realPin(listId, pins, move);
  };
  const dir = await temp();
  const warn = console.warn;
  console.warn = () => {};
  try {
    const service = new GameService(new LocalGameRepository(games, join(dir, 'g.json')), manual);
    const waits: number[] = [];
    service.retryOptions = { sleep: async (ms) => void waits.push(ms) };
    const id = ids(games)[9];
    const ticket = await service.reorder(id, 1);
    assert.equal(ticket.accepted.accepted, true);
    assert.equal(calls, 1); // aceito com a gravação ainda presa no "banco"
    assert.equal((await manual.list(LOCAL_DEFAULT_LIST_ID)).length, 0);
    release();
    await ticket.done;
    assert.equal(calls, 3);
    assert.deepEqual(waits, [200, 400]);
    assert.equal((await service.recommendations()).items[0].game.id, id);
  } finally {
    console.warn = warn;
    await rm(dir, { recursive: true, force: true });
  }
});

test('falha permanente: 5 tentativas, done resolve, nada gravado e erro registrado', async () => {
  const games = library();
  const manual = new LocalManualAdjustmentRepository();
  manual.pin = async () => {
    throw new Error('fora do ar');
  };
  const dir = await temp();
  const logged: unknown[] = [];
  const [warn, error] = [console.warn, console.error];
  console.warn = () => {};
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const service = new GameService(new LocalGameRepository(games, join(dir, 'g.json')), manual);
    const waits: number[] = [];
    service.retryOptions = { sleep: async (ms) => void waits.push(ms) };
    const ticket = await service.reorder(ids(games)[9], 1);
    await ticket.done;
    assert.deepEqual(waits, [200, 400, 800, 1600]);
    assert.equal(logged.length, 1);
    assert.deepEqual(
      (await service.recommendations()).items.map((i) => i.game.id),
      ids(games),
    );
  } finally {
    [console.warn, console.error] = [warn, error];
    await rm(dir, { recursive: true, force: true });
  }
});

test('API HTTP: 200 imediato, valida, fila reflete o arraste e solta o pin', async () => {
  const dir = await temp();
  const server = makeServer(makeService(seedGames, dir), null);
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
    const queue = (await (await fetch(base + '/recommendations')).json()) as Recommendations;
    const last = queue.items.at(-1)!.game.id;
    let r = await post({ gameId: last, toPosition: 1 });
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()) as ReorderAccepted, {
      accepted: true,
      gameId: last,
      fromPosition: queue.total,
      toPosition: 1,
    });
    // O GET entra na cadeia do usuário: já vê a gravação feita em background.
    const after = (await (await fetch(base + '/recommendations')).json()) as Recommendations;
    assert.equal(after.items[0].game.id, last);
    assert.equal(after.items[0].pinnedPosition, 1);
    assert.equal((await post({ gameId: last, toPosition: 0 })).status, 400);
    assert.equal((await post({ gameId: last, toPosition: queue.total + 1 })).status, 400);
    assert.equal((await post({ gameId: 'ausente', toPosition: 1 })).status, 404);
    const done = seedGames.find((g) => g.status === 'Finalizado')!.id;
    assert.equal((await post({ gameId: done, toPosition: 1 })).status, 409);
    const state = (await (await fetch(base + '/queue/adjustments')).json()) as ManualState;
    assert.equal(state.adjustments[0].gameId, last);
    r = await fetch(base + '/queue/adjustments/' + last, { method: 'DELETE' });
    assert.equal(r.status, 200);
    const reset = (await r.json()) as ManualResetResult;
    assert.equal(reset.removed, true);
    assert.deepEqual(
      reset.recommendations.items.map((i: QueueEntry) => i.game.id),
      queue.items.map((i: QueueEntry) => i.game.id),
    );
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(dir, { recursive: true, force: true });
  }
});
