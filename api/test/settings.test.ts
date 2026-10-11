import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { recommendGames, defaultConfig, defaultRules, isCompetitive } from '../src/scoring.ts';
import { parseScoringConfig, scoringFactors } from '../src/scoring-config.ts';
import { LocalScoringConfigRepository } from '../src/settings-repository.ts';
import { LocalGameRepository } from '../src/repository.ts';
import { LocalManualAdjustmentRepository } from '../src/manual-repository.ts';
import { GameService } from '../src/service.ts';
import { makeServer } from '../src/server.ts';
import { seedGames } from '../src/seed.ts';
import type { Game, Recommendations, ScoringConfig, ScoringRuleId } from '../../shared/models.ts';

const withRules = (patch: Partial<Record<ScoringRuleId, boolean>>): ScoringConfig => ({
  weights: defaultConfig.weights,
  rules: { ...defaultRules, ...patch },
});
const game = (id: string, patch: Partial<Game> = {}): Game => ({
  ...seedGames[0],
  id,
  name: id,
  primaryGenre: 'FPS',
  status: 'Não iniciado',
  desire: 'Média',
  secondaryTags: [],
  pace: 'Moderado',
  structure: 'Campanha',
  mechanic: 'Tiro',
  rating: null,
  actualHours: null,
  finishedAt: null,
  mainHours: 10,
  extraHours: 10,
  previousEstimatedHours: null,
  prerequisiteId: null,
  ...patch,
});

/** Impressão digital da fila (ordem, scores, ajustes e cards), gerada antes das regras. */
const digest = (q: Recommendations) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        items: q.items.map((i) => [
          i.game.id,
          i.score,
          i.cumulativeHours,
          i.manualPoints,
          i.reasons,
          i.adjustments,
          i.game.plannedHours,
          i.game.baseScore,
          i.game.affinity,
        ]),
        t: q.timeFactor,
        h: q.estimatedHours,
        x: q.excluded,
      }),
    )
    .digest('hex');

test('config padrão reproduz exatamente a fila anterior às regras (481 jogos do seed)', () => {
  const q = recommendGames(seedGames, defaultConfig);
  assert.equal(q.total, 394);
  assert.equal(digest(q), '74f7c5144036bb2a01eb33e44a220697eb43263bb2611ecae1f3f9f7b54be85b');
  assert.deepEqual(recommendGames(seedGames), q);
});

test('termos do score base desligados contribuem 0', () => {
  const g = game('a', { desire: 'Muito Alta' });
  const base = (rules: Partial<Record<ScoringRuleId, boolean>>) =>
    recommendGames([g], withRules(rules)).items[0].game.baseScore;
  const all = base({});
  const noDesire = base({ desire: false });
  assert.equal(Math.round((all - noDesire) * 10) / 10, defaultConfig.weights.desire * 100);
  assert.equal(base({ desire: false, affinity: false, duration: false }), 0);
});

test('fator de tempo desligado = 1×', () => {
  const done = game('f', { status: 'Finalizado', actualHours: 40, finishedAt: '2024-01-01' });
  const pend = game('p');
  assert.notEqual(recommendGames([done, pend]).timeFactor, 1);
  const q = recommendGames([done, pend], withRules({ timeFactor: false }));
  assert.equal(q.timeFactor, 1);
  assert.equal(q.items[0].game.plannedHours, 10);
});

test('cada ajuste contextual some quando a regra é desligada', () => {
  const prev = game('prev', {
    status: 'Finalizado',
    finishedAt: '2024-01-01',
    actualHours: 60,
    secondaryTags: ['x'],
    pace: 'Calmo',
  });
  const cases: [ScoringRuleId, string, Partial<Game>][] = [
    ['inProgress', 'Concluir o que já começou', { status: 'Jogando' }],
    ['repeatGenre', 'Gênero repetido', {}],
    ['repeatMechanic', 'Mesma mecânica', {}],
    ['repeatTag', 'Subgêneros repetidos', { secondaryTags: ['x'] }],
    ['repeatPace', 'Mesmo ritmo', { pace: 'Calmo' }],
    ['contrastingPace', 'Contraste de ritmo', { pace: 'Frenético' }],
    ['consecutiveLong', 'Duas campanhas longas seguidas', { mainHours: 50, extraHours: 50 }],
    ['shortAfterLong', 'Respiro curto depois de um longo', { mainHours: 5, extraHours: 5 }],
    ['longAfterHeavy', 'Campanha longa após carga recente alta', { mainHours: 50, extraHours: 50 }],
  ];
  const labels = (rules: Partial<Record<ScoringRuleId, boolean>>, patch: Partial<Game>) =>
    recommendGames(
      [{ ...prev, actualHours: 100 }, game('g', patch)],
      withRules({ timeFactor: false, ...rules }),
    ).items[0].adjustments.map((a) => a.label);
  for (const [rule, label, patch] of cases) {
    assert(labels({}, patch).includes(label), `${rule} deveria aparecer`);
    assert(!labels({ [rule]: false }, patch).includes(label), `${rule} deveria sumir`);
  }
  // duas posições atrás
  const two = [
    game('a', { status: 'Finalizado', finishedAt: '2024-01-01', secondaryTags: ['y'] }),
    game('b', {
      status: 'Finalizado',
      finishedAt: '2024-01-02',
      primaryGenre: 'RPG',
      mechanic: 'Turnos',
      pace: 'Calmo',
    }),
    game('c', { secondaryTags: ['y'] }),
  ];
  const twoBack = (r: Partial<Record<ScoringRuleId, boolean>>) =>
    recommendGames(two, withRules(r)).items[0].adjustments.map((a) => a.label);
  assert(twoBack({}).includes('Gênero repetido há duas posições'));
  assert(twoBack({}).includes('Subgêneros de duas posições atrás'));
  const off = twoBack({ repeatGenreTwoBack: false, repeatTagTwoBack: false });
  assert(!off.some((l) => /duas posições/.test(l)));
});

test('filtros de elegibilidade podem ser desligados', () => {
  const games = [
    game('fim'),
    game('infinito', { structure: 'Sem fim definido' }),
    game('abandonado', { status: 'Abandonado' }),
    game('luta', { primaryGenre: 'Luta' }),
  ];
  const ids = (r: Partial<Record<ScoringRuleId, boolean>>) =>
    recommendGames(games, withRules(r))
      .items.map((i) => i.game.id)
      .sort();
  assert.deepEqual(ids({}), ['fim', 'luta']);
  assert.deepEqual(ids({ excludeEndless: false }), ['fim', 'infinito', 'luta']);
  assert.deepEqual(ids({ excludeAbandoned: false }), ['abandonado', 'fim', 'luta']);
  assert.deepEqual(ids({ excludeCompetitive: true }), ['fim']);
  assert(seedGames.some(isCompetitive));
});

test('pré-requisitos e ajuste manual desligáveis', () => {
  const games = [game('a', { desire: 'Baixa' }), game('b', { prerequisiteId: 'a' })];
  assert.equal(recommendGames(games).items[0].game.id, 'a');
  assert.equal(recommendGames(games, withRules({ prerequisites: false })).items[0].game.id, 'b');
  const manual = { a: 500 };
  const on = recommendGames([game('a'), game('b')], defaultConfig, manual);
  assert.equal(on.items[0].game.id, 'a');
  assert.equal(on.items[0].manualPoints, 500);
  const off = recommendGames([game('a'), game('b')], withRules({ manual: false }), manual);
  assert.equal(off.items.find((i) => i.game.id === 'a')!.manualPoints, 0);
  assert(off.items.every((i) => !i.adjustments.some((a) => a.label === 'Ajuste manual')));
});

test('validação da configuração', () => {
  assert.deepEqual(parseScoringConfig({ weights: {}, rules: {} }), defaultConfig);
  const ok = parseScoringConfig({ weights: { repeatGenre: -5 }, rules: { manual: false } });
  assert.equal(ok.weights.repeatGenre, -5);
  assert.equal(ok.rules.manual, false);
  for (const bad of [
    null,
    [],
    { weights: {} },
    { weights: { desire: 'x' }, rules: {} },
    { weights: { desire: Infinity }, rules: {} },
    { weights: { desire: 11 }, rules: {} },
    { weights: { longHours: -1 }, rules: {} },
    { weights: { priorStrength: 0 }, rules: {} },
    { weights: { nope: 1 }, rules: {} },
    { weights: {}, rules: { manual: 'sim' } },
    { weights: {}, rules: { nope: true } },
  ])
    assert.throws(() => parseScoringConfig(bad), RangeError, JSON.stringify(bad));
  // Toda chave de peso e de regra aparece na tabela.
  const weights = new Set(scoringFactors.map((f) => f.weight));
  const rules = new Set(scoringFactors.map((f) => f.rule));
  for (const k of Object.keys(defaultConfig.weights)) assert(weights.has(k as never), k);
  for (const k of Object.keys(defaultRules)) assert(rules.has(k as ScoringRuleId), k);
});

test('repositório JSON: versão sobe, persiste e tolera arquivo antigo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'settings-'));
  try {
    const file = join(dir, 'scoring-settings.json');
    const repo = new LocalScoringConfigRepository(file);
    assert.equal((await repo.get()).version, 0);
    const custom = withRules({ repeatPace: false });
    const saved = await repo.save(custom);
    assert.equal(saved.version, 1);
    const again = new LocalScoringConfigRepository(file);
    assert.deepEqual((await again.get()).config, custom);
    assert.equal((await again.get()).version, 1);
    assert.equal((await again.save(defaultConfig)).version, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('API: GET/PUT/reset de /settings/scoring e fila usando a config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'settings-api-'));
  const service = new GameService(
    new LocalGameRepository(seedGames, join(dir, 'games.json')),
    new LocalManualAdjustmentRepository(),
    null,
    new LocalScoringConfigRepository(),
  );
  const server = makeServer(service, null).listen(0);
  try {
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    const call = (path: string, method = 'GET', body?: unknown) =>
      fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const first = await (await call('/settings/scoring')).json();
    assert.equal(first.version, 0);
    assert.deepEqual(first.defaults, defaultConfig);
    assert(first.factors.length >= 20);
    const bad = await call('/settings/scoring', 'PUT', { weights: { desire: -1 }, rules: {} });
    assert.equal(bad.status, 400);
    const put = await call('/settings/scoring', 'PUT', {
      weights: first.config.weights,
      rules: { ...first.config.rules, excludeCompetitive: true },
    });
    assert.equal(put.status, 200);
    assert.equal((await put.json()).version, 1);
    const q = await (await call('/recommendations')).json();
    assert.equal(q.configVersion, 1);
    assert(q.items.every((i: { game: Game }) => !isCompetitive(i.game)));
    const reset = await (await call('/settings/scoring/reset', 'POST')).json();
    assert.equal(reset.version, 2);
    assert.deepEqual(reset.config, defaultConfig);
    assert.equal((await (await call('/recommendations')).json()).total, 394);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
