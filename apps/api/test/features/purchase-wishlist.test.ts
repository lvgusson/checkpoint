import { afterEach, expect, it, vi } from 'vitest';
import { emptyGame } from '../../src/integrations/steam/mapping.ts';
import { scoreGames, defaultConfig } from '../../src/domain/scoring.ts';
import { GameService } from '../../src/services/games.ts';
import { createData } from '../../src/main/data.ts';
import { Role } from '../../../../packages/core/src/authorization.ts';
import { GameStatus } from '../../../../packages/core/src/models.ts';
import { runWithContext } from '../../src/shared/context.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('purchase moves a wish to the library and preserves its first purchase date', async () => {
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
  expect(purchased.status).toBe(GameStatus.NotStarted);
  expect(Number.isFinite(Date.parse(purchased.purchasedAt!))).toBeTruthy();
  expect((await service.purchase(game.id)).purchasedAt).toBe(purchased.purchasedAt);
  await data.games.save({ ...purchased, status: GameStatus.Wishlist });
  const purchasedAgain = await service.purchase(game.id);
  expect(purchasedAgain.status).toBe(GameStatus.NotStarted);
  expect(purchasedAgain.purchasedAt).toBe(purchased.purchasedAt);
  await expect(service.purchase('foreign')).rejects.toMatchObject({ code: 404 });
});

it('recent purchase adds 10, 5, then 0 points at 0, 15, and 30 days', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const game = { ...emptyGame('Test'), status: GameStatus.NotStarted };
  const baseline = scoreGames([game]).games[0].baseScore;
  for (const [days, points] of [
    [0, 10],
    [15, 5],
    [30, 0],
    [60, 0],
  ]) {
    const purchasedAt = new Date(now.getTime() - days * 86400000).toISOString();
    expect(scoreGames([{ ...game, purchasedAt }]).games[0].baseScore).toBe(baseline + points);
  }
  const config = structuredClone(defaultConfig);
  config.weights.recentPurchase = 20;
  expect(scoreGames([{ ...game, purchasedAt: now.toISOString() }], config).games[0].baseScore).toBe(
    baseline + 20,
  );
});

it('purchase refuses unrelated games and client purchase fields', async () => {
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
  await expect(service.purchase(game.id)).rejects.toMatchObject({ code: 409 });
  const { IncomingMessage } = await import('node:http');
  const { Socket } = await import('node:net');
  const { gamesRoute } = await import('../../src/routes/games.ts');
  const request = new IncomingMessage(new Socket());
  request.method = 'POST';
  request.headers['content-length'] = '20';
  await expect(
    gamesRoute(
      service,
      request,
      new URL('http://localhost/api/v1/games/owned/purchase'),
      async () => ({ purchasedAt: '2099-01-01' }),
    ),
  ).rejects.toMatchObject({ code: 400 });
  expect((await data.games.get(game.id))?.status).toBe(GameStatus.Playing);
});

it('wishlist rejects invalid order and imports over 1000 games before app downloads', async () => {
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
  vi.spyOn(steam, 'resolveSteamId').mockResolvedValue('76561198000000000');
  vi.spyOn(steam, 'wishlist').mockResolvedValue(Array.from({ length: 1001 }, (_, i) => i + 1));
  const wishes = new WishlistService(games, data.wishlist, steam);
  await expect(wishes.list('bad-sort')).rejects.toMatchObject({ code: 400 });
  await expect(wishes.importSteam({ profile: '76561198000000000' })).rejects.toMatchObject({
    code: 413,
  });
});

it('purchase rejects a game that is not on the wishlist and was never bought', async () => {
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
  const game = { ...emptyGame('Owned test'), id: 'owned-test', status: GameStatus.Playing };
  await data.games.save(game);
  const service = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);
  await expect(service.purchase(game.id)).rejects.toMatchObject({ code: 409 });
});

it('cover falls back to the Steam header image, and an explicit cover wins', () => {
  const base = { ...emptyGame('Cover test'), status: GameStatus.NotStarted };
  const cover = (g: typeof base) => scoreGames([g]).games[0].coverUrl;
  expect(cover({ ...base, steamAppId: 620 })).toBe(
    'https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg',
  );
  expect(cover({ ...base, steamAppId: 620, coverUrl: 'https://example.com/c.jpg' })).toBe(
    'https://example.com/c.jpg',
  );
  expect(cover({ ...base, steamAppId: null, coverUrl: null })).toBeNull();
});

it('unpurchase reverts a game to wishlist and clears purchasedAt', async () => {
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
  const game = {
    ...emptyGame('Unpurchase test'),
    id: 'unpurchase-test',
    status: GameStatus.NotStarted,
    purchasedAt: '2026-01-01T00:00:00.000Z',
  };
  await data.games.save(game);
  const service = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);

  const unpurchased = await service.unpurchase(game.id);
  expect(unpurchased.status).toBe(GameStatus.Wishlist);
  expect(unpurchased.purchasedAt).toBeNull();

  const saved = await data.games.get(game.id);
  expect(saved?.status).toBe(GameStatus.Wishlist);
  expect(saved?.purchasedAt).toBeNull();
});

it('patch with status Wishlist sets status Wishlist and clears purchasedAt', async () => {
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
  const game = {
    ...emptyGame('Patch Wishlist test'),
    id: 'patch-wishlist-test',
    status: GameStatus.Playing,
    purchasedAt: '2026-01-01T00:00:00.000Z',
  };
  await data.games.save(game);
  const service = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);

  const patched = await service.patch(game.id, { status: GameStatus.Wishlist });
  expect(patched.status).toBe(GameStatus.Wishlist);
  expect(patched.purchasedAt).toBeNull();
});

it('POST /api/v1/games/:id/unpurchase calls service.unpurchase and rejects body', async () => {
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
  const game = {
    ...emptyGame('Route unpurchase test'),
    id: 'route-unpurchase-test',
    status: GameStatus.NotStarted,
    purchasedAt: '2026-01-01T00:00:00.000Z',
  };
  await data.games.save(game);
  const service = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);

  const { IncomingMessage } = await import('node:http');
  const { Socket } = await import('node:net');
  const { gamesRoute } = await import('../../src/routes/games.ts');

  const validReq = new IncomingMessage(new Socket());
  validReq.method = 'POST';
  const res = await gamesRoute(
    service,
    validReq,
    new URL('http://localhost/api/v1/games/route-unpurchase-test/unpurchase'),
    async () => ({}),
  );
  expect((res as { data: unknown })?.data).toMatchObject({
    id: 'route-unpurchase-test',
    status: GameStatus.Wishlist,
    purchasedAt: null,
  });

  const invalidReq = new IncomingMessage(new Socket());
  invalidReq.method = 'POST';
  invalidReq.headers['content-length'] = '20';
  await expect(
    gamesRoute(
      service,
      invalidReq,
      new URL('http://localhost/api/v1/games/route-unpurchase-test/unpurchase'),
      async () => ({ some: 'field' }),
    ),
  ).rejects.toMatchObject({ code: 400 });
});

it('allows ordinary users to update secondaryTags and primaryGenre', async () => {
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
  const g1 = {
    ...emptyGame('Game 1'),
    id: 'game-1',
    status: GameStatus.NotStarted,
    primaryGenre: 'Ação',
    secondaryTags: ['Indie'],
  };
  const g2 = {
    ...emptyGame('Game 2'),
    id: 'game-2',
    status: GameStatus.NotStarted,
    primaryGenre: 'RPG',
    secondaryTags: ['Pixel Art'],
  };
  await data.games.save(g1);
  await data.games.save(g2);
  const service = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);

  const updated = await runWithContext({ role: Role.User }, () =>
    service.patch(g1.id, {
      primaryGenre: 'RPG',
      secondaryTags: ['Pixel Art'],
    }),
  );
  expect(updated.primaryGenre).toBe('RPG');
  expect(updated.secondaryTags).toEqual(['Pixel Art']);

  // Admin-only field still throws 403 for ordinary users
  await expect(
    runWithContext({ role: Role.User }, () => service.patch(g1.id, { name: 'New Name' })),
  ).rejects.toMatchObject({ code: 403 });
});
