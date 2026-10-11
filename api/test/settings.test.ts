import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  recommendGames,
  defaultConfig,
  defaultFilters,
  defaultRules,
  filterOptions,
  isCompetitive,
} from '../src/scoring.ts';
import { parseScoringConfig, scoringFactors } from '../src/scoring-config.ts';
import { LocalScoringConfigRepository } from '../src/settings-repository.ts';
import { LOCAL_DEFAULT_LIST_ID } from '../src/list-repository.ts';
import { LocalGameRepository } from '../src/repository.ts';
import { LocalManualAdjustmentRepository } from '../src/manual-repository.ts';
import { GameService } from '../src/service.ts';
import { makeServer } from '../src/server.ts';
import { seedGames } from '../src/seed.ts';
import type {
  Game,
  QueueFilters,
  Recommendations,
  ScoringConfig,
  ScoringRuleId,
  ScoringSettings,
} from '../../shared/models.ts';

const withRules = (patch: Partial<Record<ScoringRuleId, boolean>>): ScoringConfig => ({
  weights: defaultConfig.weights,
  rules: { ...defaultRules, ...patch },
  filters: defaultFilters,
});
const withFilters = (patch: Partial<QueueFilters>): ScoringConfig => ({
  ...defaultConfig,
  filters: { ...defaultFilters, ...patch },
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
          i.pinnedPosition ?? 0, // era manualPoints (0 sem ajuste): mesma impressão digital
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

test('filtros de conteúdo removem jogos e informam o motivo', () => {
  const games = [
    game('fps'),
    game('rpg', { primaryGenre: 'RPG', secondaryTags: ['Terror'], pace: 'Calmo' }),
    game('curto', { mainHours: 2, extraHours: null, store: 'GOG', coop: 'Online' }),
    game('longo', { mainHours: 80, extraHours: 90, desire: 'Alta' }),
    game('sem-tempo', { mainHours: null, extraHours: null }),
  ];
  const run = (f: Partial<QueueFilters>) => {
    const q = recommendGames(games, withFilters({ ...f }));
    return { ids: q.items.map((i) => i.game.id).sort(), excluded: q.excluded };
  };
  const all = ['curto', 'fps', 'longo', 'rpg', 'sem-tempo'];
  assert.deepEqual(run({}).ids, all);
  assert.deepEqual(run({}).excluded, []);
  const genre = run({ excludedGenres: ['fps'] }); // sem diferenciar maiúsculas
  assert.deepEqual(genre.ids, ['rpg']);
  assert(genre.excluded.every((e) => e.reason === 'Filtro: gênero FPS'));
  assert.deepEqual(run({ excludedTags: ['terror'] }).ids, ['curto', 'fps', 'longo', 'sem-tempo']);
  assert.deepEqual(run({ stores: ['GOG'] }).ids, ['curto']);
  assert.deepEqual(run({ paces: ['Calmo'] }).ids, ['rpg']);
  assert.deepEqual(run({ coopOnly: true }).ids, ['curto']);
  assert.deepEqual(run({ minDesire: 'Alta' }).ids, ['longo']);
  // Horas = plannedHours (estimativa × ritmo); sem tempo passa pelos limites...
  assert.deepEqual(run({ maxHours: 20 }).ids, ['curto', 'fps', 'rpg', 'sem-tempo']);
  assert.deepEqual(run({ minHours: 20 }).ids, ['longo', 'sem-tempo']);
  assert.deepEqual(run({ minHours: 5, maxHours: 20 }).ids, ['fps', 'rpg', 'sem-tempo']);
  // ...exceto quando pedido.
  const unknown = run({ excludeUnknownHours: true });
  assert.deepEqual(unknown.ids, ['curto', 'fps', 'longo', 'rpg']);
  assert.deepEqual(unknown.excluded, [
    { gameId: 'sem-tempo', reason: 'Filtro: sem tempo estimado' },
  ]);
});

test('filtro não bloqueia a sequência de um predecessor filtrado', () => {
  const games = [game('a', { primaryGenre: 'RPG' }), game('b', { prerequisiteId: 'a' })];
  const q = recommendGames(games, withFilters({ excludedGenres: ['RPG'] }));
  assert.deepEqual(
    q.items.map((i) => i.game.id),
    ['b'],
  );
});

test('opções dos filtros contam os candidatos da fila', () => {
  const o = filterOptions(seedGames);
  assert.equal(o.total, 394); // mesma base da fila padrão
  assert.equal(o.hours.length, o.total);
  const sum = (xs: { count: number }[]) => xs.reduce((s, x) => s + x.count, 0);
  assert.equal(sum(o.genres), o.total);
  assert.equal(sum(o.stores), o.total);
  assert.equal(sum(o.desires), o.total);
  assert(o.genres.every((g, i) => i === 0 || o.genres[i - 1].count >= g.count));
  const top = o.genres[0];
  const q = recommendGames(seedGames, withFilters({ excludedGenres: [top.value] }));
  assert.equal(q.total, o.total - top.count);
  assert.equal(q.excluded.length, top.count);
});

test('pré-requisitos e ajuste manual desligáveis', () => {
  const games = [game('a', { desire: 'Baixa' }), game('b', { prerequisiteId: 'a' })];
  assert.equal(recommendGames(games).items[0].game.id, 'a');
  assert.equal(recommendGames(games, withRules({ prerequisites: false })).items[0].game.id, 'b');
  const plain = recommendGames([game('a'), game('b')]).items.map((i) => i.game.id);
  const pins = [{ gameId: plain[1], position: 1 }];
  const on = recommendGames([game('a'), game('b')], defaultConfig, pins);
  assert.equal(on.items[0].game.id, plain[1]);
  assert.equal(on.items[0].pinnedPosition, 1);
  const off = recommendGames([game('a'), game('b')], withRules({ manual: false }), pins);
  assert.deepEqual(
    off.items.map((i) => i.game.id),
    plain,
  );
  assert(off.items.every((i) => i.pinnedPosition === null));
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
    { weights: {}, rules: {}, filters: [] },
    { weights: {}, rules: {}, filters: { nope: 1 } },
    { weights: {}, rules: {}, filters: { excludedGenres: 'FPS' } },
    { weights: {}, rules: {}, filters: { excludedGenres: [''] } },
    { weights: {}, rules: {}, filters: { minHours: -1 } },
    { weights: {}, rules: {}, filters: { maxHours: '10' } },
    { weights: {}, rules: {}, filters: { minHours: 30, maxHours: 10 } },
    { weights: {}, rules: {}, filters: { coopOnly: 1 } },
    { weights: {}, rules: {}, filters: { minDesire: 'Altíssima' } },
  ])
    assert.throws(() => parseScoringConfig(bad), RangeError, JSON.stringify(bad));
  const f = parseScoringConfig({
    weights: {},
    rules: {},
    filters: { excludedGenres: [' FPS ', 'FPS'], maxHours: 20, minDesire: 'Alta' },
  }).filters;
  assert.deepEqual(f, {
    ...defaultFilters,
    excludedGenres: ['FPS'],
    maxHours: 20,
    minDesire: 'Alta',
  });
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
    const L = LOCAL_DEFAULT_LIST_ID;
    const repo = new LocalScoringConfigRepository(file);
    assert.equal((await repo.get(L)).version, 0);
    const custom = withRules({ repeatPace: false });
    const saved = await repo.save(L, custom);
    assert.equal(saved.version, 1);
    const again = new LocalScoringConfigRepository(file);
    assert.deepEqual((await again.get(L)).config, custom);
    assert.equal((await again.get(L)).version, 1);
    assert.equal((await again.save(L, defaultConfig)).version, 2);
    assert.equal((await again.get('outra')).version, 0);
    // Arquivo antigo (uma config só, sem listas) vira a config da lista padrão.
    const old = join(dir, 'old.json');
    await writeFile(old, JSON.stringify({ config: custom, version: 7, updatedAt: null }));
    assert.equal((await new LocalScoringConfigRepository(old).get(L)).version, 7);
    // Sem filters ou com filtro salvo inválido: volta ao padrão neutro.
    await writeFile(
      old,
      JSON.stringify({
        config: { weights: {}, rules: {}, filters: { maxHours: 'x', excludedTags: ['Terror'] } },
        version: 3,
      }),
    );
    const legacy = await new LocalScoringConfigRepository(old).get(L);
    assert.deepEqual(legacy.config.filters, { ...defaultFilters, excludedTags: ['Terror'] });
    await writeFile(old, JSON.stringify({ config: { weights: {}, rules: {} }, version: 4 }));
    assert.deepEqual((await new LocalScoringConfigRepository(old).get(L)).config, defaultConfig);
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
    const json = async <T>(r: Promise<Response> | Response) => (await (await r).json()) as T;
    const first = await json<ScoringSettings>(call('/settings/scoring'));
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
    assert.equal((await json<ScoringSettings>(put)).version, 1);
    const q = await json<Recommendations>(call('/recommendations'));
    assert.equal(q.configVersion, 1);
    assert(q.items.every((i) => !isCompetitive(i.game)));
    assert.equal(first.filterOptions.total, 394);
    const long = await call('/settings/scoring', 'PUT', {
      weights: first.config.weights,
      rules: first.config.rules,
      filters: { maxHours: 15, excludeUnknownHours: true },
    });
    assert.equal(long.status, 200);
    assert.equal((await json<ScoringSettings>(long)).config.filters.maxHours, 15);
    const short = await json<Recommendations>(call('/recommendations'));
    assert(short.items.every((i) => i.game.plannedHours !== null && i.game.plannedHours <= 15));
    assert.equal(short.total + short.excluded.length, 394);
    assert.equal(
      (await call('/settings/scoring', 'PUT', { ...first.config, filters: { minHours: -2 } }))
        .status,
      400,
    );
    const reset = await json<ScoringSettings>(call('/settings/scoring/reset', 'POST'));
    assert.equal(reset.version, 3);
    assert.deepEqual(reset.config, defaultConfig);
    assert.equal((await json<Recommendations>(call('/recommendations'))).total, 394);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
