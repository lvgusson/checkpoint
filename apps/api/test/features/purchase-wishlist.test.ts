import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyGame } from '../../src/integrations/steam/mapping.ts';
import { scoreGames, defaultConfig } from '../../src/domain/scoring.ts';
import { GameService } from '../../src/services/games.ts';
import { createData } from '../../src/main/data.ts';
import { GameStatus } from '../../../../packages/core/src/models.ts';

test('purchase moves a wish to the library and preserves its first purchase date', async () => {
  const data = await createData({
    dataDir: '/tmp',
    env: {
      DATA_FILE: '',
      LISTS_FILE: '',
      MANUAL_FILE: '',
      SETTINGS_FILE: '',
      WISHLIST_FILE: '',
    },
  });
  const game = { ...emptyGame('Purchase test'), id: 'purchase-test' };
  await data.games.save(game);
  const service = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);
  const purchased = await service.purchase(game.id);
  assert.equal(purchased.status, GameStatus.NotStarted);
  assert.ok(Number.isFinite(Date.parse(purchased.purchasedAt!)));
  assert.equal((await service.purchase(game.id)).purchasedAt, purchased.purchasedAt);
  await data.games.save({ ...purchased, status: GameStatus.Wishlist });
  const purchasedAgain = await service.purchase(game.id);
  assert.equal(purchasedAgain.status, GameStatus.NotStarted);
  assert.equal(purchasedAgain.purchasedAt, purchased.purchasedAt);
  await assert.rejects(service.purchase('foreign'), { code: 404 });
});

test('recent purchase adds 10, 5, then 0 points at 0, 15, and 30 days', (t) => {
  const now = new Date('2026-10-15T12:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  const game = { ...emptyGame('Test'), status: GameStatus.NotStarted };
  const baseline = scoreGames([game]).games[0].baseScore;
  for (const [days, points] of [
    [0, 10],
    [15, 5],
    [30, 0],
    [60, 0],
  ]) {
    const purchasedAt = new Date(now.getTime() - days * 86400000).toISOString();
    assert.equal(scoreGames([{ ...game, purchasedAt }]).games[0].baseScore, baseline + points);
  }
  const config = structuredClone(defaultConfig);
  config.weights.recentPurchase = 20;
  assert.equal(
    scoreGames([{ ...game, purchasedAt: now.toISOString() }], config).games[0].baseScore,
    baseline + 20,
  );
});

test('purchase refuses unrelated games and client purchase fields', async () => {
  const data = await createData({
    dataDir: '/tmp',
    env: {
      DATA_FILE: '',
      LISTS_FILE: '',
      MANUAL_FILE: '',
      SETTINGS_FILE: '',
      WISHLIST_FILE: '',
    },
  });
  const game = { ...emptyGame('Already owned'), id: 'owned', status: GameStatus.Playing };
  await data.games.save(game);
  const service = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);
  await assert.rejects(service.purchase(game.id), { code: 409 });
  const { IncomingMessage } = await import('node:http');
  const { Socket } = await import('node:net');
  const { gamesRoute } = await import('../../src/routes/games.ts');
  const request = new IncomingMessage(new Socket());
  request.method = 'POST';
  request.headers['content-length'] = '20';
  await assert.rejects(
    gamesRoute(
      service,
      request,
      new URL('http://localhost/api/v1/games/owned/purchase'),
      async () => ({ purchasedAt: '2099-01-01' }),
    ),
    { code: 400 },
  );
  assert.equal((await data.games.get(game.id))?.status, GameStatus.Playing);
});

test('wishlist rejects invalid order and imports over 1000 games before app downloads', async (t) => {
  const { WishlistService } = await import('../../src/services/wishlist.ts');
  const { SteamClient } = await import('../../src/integrations/steam/client.ts');
  const data = await createData({
    dataDir: '/tmp',
    env: {
      DATA_FILE: '',
      LISTS_FILE: '',
      MANUAL_FILE: '',
      SETTINGS_FILE: '',
      WISHLIST_FILE: '',
    },
  });
  const games = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);
  const steam = new SteamClient({
    fetch: async () => {
      throw new Error('Unexpected external request');
    },
  });
  t.mock.method(steam, 'resolveSteamId', async () => '76561198000000000');
  t.mock.method(steam, 'wishlist', async () => Array.from({ length: 1001 }, (_, i) => i + 1));
  const wishes = new WishlistService(games, data.wishlist, steam);
  await assert.rejects(wishes.list('bad-sort'), { code: 400 });
  await assert.rejects(wishes.importSteam({ profile: '76561198000000000' }), { code: 413 });
});
