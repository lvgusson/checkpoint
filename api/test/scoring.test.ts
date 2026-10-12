import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGames, recommendGames, defaultWeights } from '../src/scoring.ts';
import type { Game } from '../../shared/models.ts';
import { defaultConfig } from '../src/scoring.ts';

const game = (id: string, patch: Partial<Game> = {}): Game => ({
  id,
  name: id,
  primaryGenre: 'FPS',
  status: 'Não iniciado',
  desire: 'Média',
  store: 'Steam',
  platform: 'PC',
  secondaryTags: [],
  pace: 'Moderado',
  structure: 'Campanha',
  actualHours: null,
  startedAt: null,
  finishedAt: null,
  rating: null,
  notes: '',
  mainHours: 10,
  extraHours: 10,
  completionistHours: null,
  size: '',
  timeVerification: 'A confirmar',
  timeSource: '',
  reviewNotes: '',
  previousEstimatedHours: null,
  coop: '',
  mechanic: 'Tiro',
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

test('playing games stay above the queue, including games excluded by list filters', () => {
  const result = recommendGames(
    [
      game('active-a', { status: 'Jogando', startedAt: '2026-10-10' }),
      game('active-b', { status: 'Jogando', structure: 'Sem fim definido' }),
      game('priority', { desire: 'Imediata' }),
      game('pending'),
    ],
    { ...defaultConfig, filters: { ...defaultConfig.filters, excludedGenres: ['FPS'] } },
  );
  assert.deepEqual(
    result.playing?.map((g) => g.id),
    ['active-a', 'active-b'],
  );
  assert.equal(result.total, 0);
  assert.equal(result.estimatedHours, 0);
  assert.ok(!result.excluded.some((g) => g.gameId.startsWith('active')));
  const unfiltered = recommendGames([
    game('active', { status: 'Jogando', desire: 'Baixa' }),
    game('priority', { desire: 'Imediata' }),
    game('pending'),
  ]);
  assert.equal(unfiltered.items[0].game.id, 'priority');
  assert.equal(unfiltered.total, 2);
  assert.ok(unfiltered.items.every((i) => i.game.status !== 'Jogando'));
});

test('só mudar vontade eleva a pontuação e muda a ordem', () => {
  const a = game('a', { desire: 'Baixa' }),
    b = game('b');
  assert.equal(recommendGames([a, b]).items[0].game.id, 'b');
  a.desire = 'Muito Alta';
  assert.equal(recommendGames([a, b]).items[0].game.id, 'a');
});
test('nota alta aprende o estilo sem confundir ausência de nota com zero', () => {
  const target = game('alvo');
  const neutral = scoreGames([target]).games[0].affinity;
  const data = scoreGames([target, game('avaliado', { status: 'Finalizado', rating: 5 })]);
  assert.ok(data.games[0].affinity > neutral);
  assert.equal(neutral, 50);
});
test('tempo planejado aprende apenas com finalizados e tempos válidos', () => {
  const data = scoreGames([
    game('pendente'),
    game('feito', { status: 'Finalizado', actualHours: 5 }),
  ]);
  assert.equal(data.timeFactor, 5 / 6);
  assert.equal(data.games[0].plannedHours, 8.3);
  assert.equal(data.games[1].plannedHours, 10);
});
test('a repetição de subgênero pesa menos que a de gênero principal', () => {
  assert.ok(defaultWeights.repeatTag < defaultWeights.repeatGenre);
  const games = [
    game('a', { desire: 'Muito Alta', secondaryTags: ['Horda'] }),
    game('b', { primaryGenre: 'TPS', secondaryTags: ['Horda'] }),
    game('c', { primaryGenre: 'TPS', secondaryTags: ['Exploração'] }),
  ];
  const q = recommendGames(games);
  assert.equal(q.items[0].game.id, 'a');
  assert.equal(q.items[1].game.id, 'c');
});
test('após um longo frenético favorece respiro curto e calmo', () => {
  const q = recommendGames([
    game('longo', { desire: 'Muito Alta', extraHours: 60, pace: 'Frenético' }),
    game('outro-longo', { extraHours: 60, pace: 'Frenético' }),
    game('respiro', {
      extraHours: 8,
      pace: 'Calmo',
      primaryGenre: 'Puzzle',
      mechanic: 'Puzzle',
    }),
  ]);
  assert.equal(q.items[0].game.id, 'longo');
  assert.equal(q.items[1].game.id, 'respiro');
  assert.ok(q.items[1].adjustments.some((a) => a.points === 8));
});
test('finalizado, abandonado e jogo sem fim não entram na fila', () => {
  const q = recommendGames([
    game('feito', { status: 'Finalizado' }),
    game('abandono', { status: 'Abandonado' }),
    game('sem-fim', { structure: 'Sem fim definido' }),
    game('pendente'),
  ]);
  assert.deepEqual(
    q.items.map((e) => e.game.id),
    ['pendente'],
  );
});
test('sequência espera o predecessor, mas permite intercalar outro gênero', () => {
  const q = recommendGames([
    game('1', { desire: 'Muito Alta' }),
    game('2', { desire: 'Muito Alta', prerequisiteId: '1' }),
    game('outro', {
      desire: 'Muito Alta',
      primaryGenre: 'Puzzle',
      pace: 'Calmo',
      mechanic: 'Puzzle',
    }),
  ]);
  assert.equal(q.items[0].game.id, '1');
  assert.equal(q.items[1].game.id, 'outro');
  assert.equal(q.items[2].game.id, '2');
});
test('predecessor removido não bloqueia a fila e ciclo é informado', () => {
  const q = recommendGames([
    game('livre', { prerequisiteId: 'removido' }),
    game('a', { prerequisiteId: 'b' }),
    game('b', { prerequisiteId: 'a' }),
  ]);
  assert.deepEqual(
    q.items.map((e) => e.game.id),
    ['livre'],
  );
  assert.equal(q.excluded.length, 2);
});
test('tempos ausentes não geram NaN nem estimativas inventadas', () => {
  const q = recommendGames([game('sem-tempo', { mainHours: null, extraHours: null })]);
  assert.equal(q.items[0].game.plannedHours, null);
  assert.ok(Number.isFinite(q.items[0].score));
});
