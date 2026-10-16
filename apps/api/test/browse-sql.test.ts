import { describe, expect, it } from 'vitest';
import { db } from '../src/data/db.ts';
import { PgGamesDriver } from '../src/data/drivers/pg/games.ts';
import { JsonGamesDriver } from '../src/data/drivers/json/games.ts';
import { GameRepositoryImpl } from '../src/data/repositories/games.ts';
import { GameService } from '../src/services/games.ts';
import { SEED_APP_USER_ID } from '../src/services/auth-user.ts';
import {
  Desire,
  type Game,
  GameStatus,
  type ScoredGame,
} from '../../../packages/core/src/models.ts';
import { emptyGame } from '../src/integrations/steam/mapping.ts';
import { runWithContext } from '../src/shared/context.ts';
import { gameFrom, gameJson, toGame, type RawGame } from '../src/data/drivers/pg/shared.ts';

const hasDb = Boolean(process.env.SECURITY_TEST_DATABASE_URL);

describe.skipIf(!hasDb)('PgGamesDriver SQL browse', () => {
  const sql = db(process.env.SECURITY_TEST_DATABASE_URL!);
  const driver = new PgGamesDriver(sql);

  it('paginates results with distinct items per page and correct total count', async () => {
    const page1 = await driver.browse(SEED_APP_USER_ID, {
      sort: 'name',
      page: 1,
      pageSize: 5,
    });
    const page2 = await driver.browse(SEED_APP_USER_ID, {
      sort: 'name',
      page: 2,
      pageSize: 5,
    });

    expect(page1.items).toHaveLength(5);
    expect(page2.items).toHaveLength(5);
    expect(page1.total).toBe(481);
    expect(page2.total).toBe(481);

    const idsPage1 = new Set(page1.items.map((g) => g.id));
    for (const game of page2.items) {
      expect(idsPage1.has(game.id)).toBe(false);
    }
  });

  it('filters by status', async () => {
    const result = await driver.browse(SEED_APP_USER_ID, {
      status: GameStatus.Playing,
      sort: 'name',
      page: 1,
      pageSize: 20,
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBe(result.items.length);
    for (const game of result.items) {
      expect(game.status).toBe(GameStatus.Playing);
    }
  });

  it('filters by primaryGenre', async () => {
    const result = await driver.browse(SEED_APP_USER_ID, {
      primaryGenre: 'Soulslike',
      sort: 'name',
      page: 1,
      pageSize: 50,
    });

    expect(result.total).toBe(12);
    expect(result.items).toHaveLength(12);
    for (const game of result.items) {
      expect(game.primaryGenre).toBe('Soulslike');
    }
  });

  it('filters by search query q in name and secondaryTags case-insensitively', async () => {
    const byName = await driver.browse(SEED_APP_USER_ID, {
      q: 'dark souls',
      sort: 'name',
      page: 1,
      pageSize: 20,
    });

    expect(byName.total).toBeGreaterThan(0);
    for (const game of byName.items) {
      const match =
        game.name.toLowerCase().includes('dark souls') ||
        game.secondaryTags.some((t) => t.toLowerCase().includes('dark souls'));
      expect(match).toBe(true);
    }

    const byTag = await driver.browse(SEED_APP_USER_ID, {
      q: 'roguelike',
      sort: 'name',
      page: 1,
      pageSize: 20,
    });

    expect(byTag.total).toBeGreaterThan(0);
    for (const game of byTag.items) {
      const match =
        game.name.toLowerCase().includes('roguelike') ||
        game.secondaryTags.some((t) => t.toLowerCase().includes('roguelike'));
      expect(match).toBe(true);
    }
  });

  it('filters by store', async () => {
    const result = await driver.browse(SEED_APP_USER_ID, {
      store: 'Steam',
      sort: 'name',
      page: 1,
      pageSize: 30,
    });

    expect(result.total).toBeGreaterThan(0);
    for (const game of result.items) {
      expect(game.store).toBe('Steam');
    }
  });

  it('escapes LIKE wildcards in search query q safely', async () => {
    const percentSearch = await driver.browse(SEED_APP_USER_ID, {
      q: '%',
      sort: 'name',
      page: 1,
      pageSize: 20,
    });
    for (const game of percentSearch.items) {
      const text = game.name + ' ' + game.secondaryTags.join(' ');
      expect(text.includes('%')).toBe(true);
    }

    const underscoreSearch = await driver.browse(SEED_APP_USER_ID, {
      q: '_',
      sort: 'name',
      page: 1,
      pageSize: 20,
    });
    for (const game of underscoreSearch.items) {
      const text = game.name + ' ' + game.secondaryTags.join(' ');
      expect(text.includes('_')).toBe(true);
    }
  });

  it('sorts by name ascending (lower(name), code)', async () => {
    const result = await driver.browse(SEED_APP_USER_ID, {
      sort: 'name',
      page: 1,
      pageSize: 15,
    });

    const expectedRows = await sql<{ game: RawGame }[]>`
      SELECT ${gameJson(sql)} AS game
        FROM ${gameFrom(sql)}
       WHERE e.user_id = ${SEED_APP_USER_ID}
       ORDER BY lower(g.name), g.code
       LIMIT 15`;

    expect(result.items).toHaveLength(15);
    expect(result.items.map((g) => g.id)).toEqual(expectedRows.map((r) => toGame(r.game).id));
  });

  it('sorts by desire priority (rd.sort_order, lower(name))', async () => {
    const desireOrder: Record<string, number> = {
      [Desire.Immediate]: 0,
      [Desire.VeryHigh]: 1,
      [Desire.High]: 2,
      [Desire.Medium]: 3,
      [Desire.Low]: 4,
      [Desire.VeryLow]: 5,
    };

    const result = await driver.browse(SEED_APP_USER_ID, {
      sort: 'desire',
      page: 1,
      pageSize: 30,
    });

    const expectedRows = await sql<{ game: RawGame }[]>`
      SELECT ${gameJson(sql)} AS game
        FROM ${gameFrom(sql)}
        LEFT JOIN ref_desire rd ON rd.code = e.desire
       WHERE e.user_id = ${SEED_APP_USER_ID}
       ORDER BY rd.sort_order, lower(g.name)
       LIMIT 30`;

    expect(result.items).toHaveLength(30);
    expect(result.items.map((g) => g.id)).toEqual(expectedRows.map((r) => toGame(r.game).id));
    for (let i = 1; i < result.items.length; i++) {
      const prev = result.items[i - 1];
      const curr = result.items[i];
      const orderA = desireOrder[prev.desire] ?? 99;
      const orderB = desireOrder[curr.desire] ?? 99;
      expect(orderA <= orderB).toBe(true);
    }
  });

  it('returns total count even when requested page is beyond results', async () => {
    const result = await driver.browse(SEED_APP_USER_ID, {
      sort: 'name',
      page: 9999,
      pageSize: 50,
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(481);
  });

  it('GameService.browse with PgGamesDriver pushes down name and desire sort', async () => {
    const repo = new GameRepositoryImpl(driver, async () => SEED_APP_USER_ID);
    const listsMock = {
      list: async () => [{ id: 'list-1', name: 'Principal', createdAt: '' }],
      get: async () => ({ id: 'list-1', name: 'Principal', createdAt: '' }),
      create: async () => ({ id: 'list-2', name: 'Other', createdAt: '' }),
      rename: async () => undefined,
      remove: async () => 'removed' as const,
    };
    const manualMock = {
      list: async () => [],
      pin: async () => {},
      remove: async () => false,
      moves: async () => [],
    };
    const settingsMock = {
      get: async () => ({
        config: {
          weights: {
            desire: 1,
            affinity: 0,
            duration: 0,
            recentPurchase: 0,
            inProgress: 0,
            repeatGenre: 0,
            repeatMechanic: 0,
            repeatTag: 0,
            shortGame: 0,
            longGame: 0,
            recentHours: 0,
            longAfterHeavy: 0,
            shortAfterLong: 0,
          },
          rules: {
            desire: true,
            affinity: false,
            duration: false,
            inProgress: false,
            repeatGenre: false,
            repeatGenreTwoBack: false,
            repeatMechanic: false,
            repeatTag: false,
            repeatTagTwoBack: false,
            consecutiveLong: false,
            longAfterHeavy: false,
            repeatPace: false,
            contrastingPace: false,
            shortAfterLong: false,
            excludeEndless: false,
            excludeAbandoned: false,
            excludeCompetitive: false,
            prerequisites: false,
            manual: false,
          },
          filters: {
            excludedGenres: [],
            excludedTags: [],
            stores: [],
            paces: [],
            minHours: null,
            maxHours: null,
            excludeUnknownHours: false,
            coopOnly: false,
            minDesire: null,
          },
        },
        version: 1,
        updatedAt: null,
      }),
      save: async () => ({
        config: {} as never,
        version: 2,
        updatedAt: null,
      }),
    };
    const service = new GameService(repo, manualMock, null, settingsMock as never, listsMock);

    await runWithContext({ appUserId: SEED_APP_USER_ID }, async () => {
      const byName = await service.browse({ sort: 'name', page: '1', pageSize: '10' });
      expect(byName.items).toHaveLength(10);
      expect(byName.total).toBe(481);

      const byDesire = await service.browse({ sort: 'desire', page: '1', pageSize: '10' });
      expect(byDesire.items).toHaveLength(10);
      expect(byDesire.total).toBe(481);

      const byScore = await service.browse({ sort: 'score', page: '1', pageSize: '10' });
      expect(byScore.items).toHaveLength(10);
      expect(byScore.total).toBe(481);
    });
  });
});

describe('JsonGamesDriver browse', () => {
  const seed: Game[] = [
    {
      ...emptyGame('Alpha Game'),
      id: 'G001',
      name: 'Alpha Game',
      status: GameStatus.NotStarted,
      desire: Desire.Low,
      primaryGenre: 'Action',
      store: 'Steam',
      secondaryTags: ['2D', 'Pixel Art'],
    },
    {
      ...emptyGame('Beta Game'),
      id: 'G002',
      name: 'Beta Game',
      status: GameStatus.Playing,
      desire: Desire.Immediate,
      primaryGenre: 'RPG',
      store: 'GOG',
      secondaryTags: ['Turn-Based', 'Fantasy'],
    },
    {
      ...emptyGame('Gamma Game'),
      id: 'G003',
      name: 'Gamma Game',
      status: GameStatus.Finished,
      desire: Desire.VeryHigh,
      primaryGenre: 'Action',
      store: 'Steam',
      secondaryTags: ['Fantasy'],
    },
    {
      ...emptyGame('Delta 100% Game'),
      id: 'G004',
      name: 'Delta 100% Game',
      status: GameStatus.NotStarted,
      desire: Desire.Medium,
      primaryGenre: 'Puzzle',
      store: 'Epic',
      secondaryTags: ['Casual'],
    },
  ];

  it('paginates correctly in JsonGamesDriver', async () => {
    const driver = new JsonGamesDriver(seed, null);
    const page1 = await driver.browse('any', { sort: 'name', page: 1, pageSize: 2 });
    const page2 = await driver.browse('any', { sort: 'name', page: 2, pageSize: 2 });

    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.total).toBe(4);
    expect(page2.total).toBe(4);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
  });

  it('filters by status, primaryGenre, and search query q in JsonGamesDriver', async () => {
    const driver = new JsonGamesDriver(seed, null);

    const byStatus = await driver.browse('any', {
      sort: 'name',
      status: GameStatus.Playing,
      page: 1,
      pageSize: 10,
    });
    expect(byStatus.total).toBe(1);
    expect(byStatus.items[0].name).toBe('Beta Game');

    const byGenre = await driver.browse('any', {
      sort: 'name',
      primaryGenre: 'Action',
      page: 1,
      pageSize: 10,
    });
    expect(byGenre.total).toBe(2);

    const byQueryTag = await driver.browse('any', {
      sort: 'name',
      q: 'pixel art',
      page: 1,
      pageSize: 10,
    });
    expect(byQueryTag.total).toBe(1);
    expect(byQueryTag.items[0].name).toBe('Alpha Game');
  });

  it('sorts by name and desire in JsonGamesDriver', async () => {
    const driver = new JsonGamesDriver(seed, null);

    const byName = await driver.browse('any', { sort: 'name', page: 1, pageSize: 10 });
    expect(byName.items.map((g) => g.name)).toEqual([
      'Alpha Game',
      'Beta Game',
      'Delta 100% Game',
      'Gamma Game',
    ]);

    const byDesire = await driver.browse('any', { sort: 'desire', page: 1, pageSize: 10 });
    expect(byDesire.items.map((g) => g.name)).toEqual([
      'Beta Game', // Immediate
      'Gamma Game', // VeryHigh
      'Delta 100% Game', // Medium
      'Alpha Game', // Low
    ]);
  });
});

describe('GameService browse integration', () => {
  it('delegates sort=name and sort=desire to repository and preserves score sort in memory', async () => {
    const seed: Game[] = [
      {
        ...emptyGame('Game A'),
        id: 'A',
        name: 'Game A',
        status: GameStatus.NotStarted,
        desire: Desire.Low,
        primaryGenre: 'Indie',
        store: 'Steam',
        secondaryTags: [],
      },
      {
        ...emptyGame('Game B'),
        id: 'B',
        name: 'Game B',
        status: GameStatus.NotStarted,
        desire: Desire.VeryHigh,
        primaryGenre: 'Indie',
        store: 'Steam',
        secondaryTags: [],
      },
    ];

    const driver = new JsonGamesDriver(seed, null);
    const repo = new GameRepositoryImpl(driver, async () => 'user-1');

    const listsMock = {
      list: async () => [{ id: 'list-1', name: 'Principal', createdAt: '' }],
      get: async () => ({ id: 'list-1', name: 'Principal', createdAt: '' }),
      create: async () => ({ id: 'list-2', name: 'Other', createdAt: '' }),
      rename: async () => undefined,
      remove: async () => 'removed' as const,
    };
    const manualMock = {
      list: async () => [],
      pin: async () => {},
      remove: async () => false,
      moves: async () => [],
    };
    const settingsMock = {
      get: async () => ({
        config: {
          weights: {
            desire: 1,
            affinity: 0,
            duration: 0,
            recentPurchase: 0,
            inProgress: 0,
            repeatGenre: 0,
            repeatMechanic: 0,
            repeatTag: 0,
            shortGame: 0,
            longGame: 0,
            recentHours: 0,
            longAfterHeavy: 0,
            shortAfterLong: 0,
          },
          rules: {
            desire: true,
            affinity: false,
            duration: false,
            inProgress: false,
            repeatGenre: false,
            repeatGenreTwoBack: false,
            repeatMechanic: false,
            repeatTag: false,
            repeatTagTwoBack: false,
            consecutiveLong: false,
            longAfterHeavy: false,
            repeatPace: false,
            contrastingPace: false,
            shortAfterLong: false,
            excludeEndless: false,
            excludeAbandoned: false,
            excludeCompetitive: false,
            prerequisites: false,
            manual: false,
          },
          filters: {
            excludedGenres: [],
            excludedTags: [],
            stores: [],
            paces: [],
            minHours: null,
            maxHours: null,
            excludeUnknownHours: false,
            coopOnly: false,
            minDesire: null,
          },
        },
        version: 1,
        updatedAt: null,
      }),
      save: async () => ({
        config: {} as never,
        version: 2,
        updatedAt: null,
      }),
    };

    const service = new GameService(repo, manualMock, null, settingsMock as never, listsMock);

    await runWithContext({ appUserId: 'user-1' }, async () => {
      const byName = await service.browse({ sort: 'name' });
      expect(byName.items.map((g) => g.name)).toEqual(['Game A', 'Game B']);

      const byDesire = await service.browse({ sort: 'desire' });
      expect(byDesire.items.map((g) => g.name)).toEqual(['Game B', 'Game A']);

      const byScore = await service.browse({ sort: 'score' });
      expect(byScore.items).toHaveLength(2);
      expect((byScore.items[0] as ScoredGame).baseScore).toBeGreaterThanOrEqual(
        (byScore.items[1] as ScoredGame).baseScore,
      );

      const byDefault = await service.browse({});
      expect(byDefault.items).toHaveLength(2);

      await expect(service.browse({ q: 'test\0invalid' })).rejects.toThrow('Parâmetro inválido');
    });
  });
});
