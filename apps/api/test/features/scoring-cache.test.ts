import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyGame } from '../../src/integrations/steam/mapping.ts';
import { GameService } from '../../src/services/games.ts';
import { createData } from '../../src/main/data.ts';
import { GameStatus } from '../../../../packages/core/src/models.ts';
import { runWithContext } from '../../src/shared/context.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Scoring Cache (checkpoint-0j1)', () => {
  async function setupService() {
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
    const game = { ...emptyGame('Cache Game 1'), id: 'cache-game-1', rating: 3 };
    await data.games.save(game);
    const service = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);
    return { data, service, game };
  }

  it('returns cached scored games on repeated all() calls without reading repository again', async () => {
    const { service } = await setupService();

    await runWithContext({ userId: 'user-cache-1' }, async () => {
      const listSpy = vi.spyOn(service.repository, 'list');

      const first = await service.all();
      expect(first).toBeDefined();
      expect(listSpy).toHaveBeenCalledTimes(1);
      expect(Object.isFrozen(first)).toBe(true);

      const second = await service.all();
      expect(second).toBe(first); // Exact reference match (cached)
      expect(listSpy).toHaveBeenCalledTimes(1); // No second DB read
    });
  });

  it('recalculates when scoring settings version bumps', async () => {
    const { service } = await setupService();

    await runWithContext({ userId: 'user-cache-2' }, async () => {
      const listSpy = vi.spyOn(service.repository, 'list');

      const first = await service.all();
      expect(listSpy).toHaveBeenCalledTimes(1);

      // Save new settings to bump version (toSettings reads repository once)
      await service.saveScoringSettings({
        weights: { recentPurchase: 10 },
        rules: {},
      });
      expect(listSpy).toHaveBeenCalledTimes(2);

      const second = await service.all();
      expect(listSpy).toHaveBeenCalledTimes(3);
      expect(second).not.toBe(first);

      // Subsequent read hits cache
      const third = await service.all();
      expect(third).toBe(second);
      expect(listSpy).toHaveBeenCalledTimes(3);
    });
  });

  it('evicts cache and recalculates when a game is updated via patch()', async () => {
    const { service, game } = await setupService();

    await runWithContext({ userId: 'user-cache-3' }, async () => {
      const listSpy = vi.spyOn(service.repository, 'list');

      const first = await service.all();
      expect(listSpy).toHaveBeenCalledTimes(1);

      // Mutate a game via patch (game() reads repository once and warms cache)
      await service.patch(game.id, { rating: 5 });
      expect(listSpy).toHaveBeenCalledTimes(2);

      const second = await service.all();
      expect(listSpy).toHaveBeenCalledTimes(2); // Hits cache warmed by patch()
      expect(second).not.toBe(first);
      const updated = second.find((g) => g.id === game.id);
      expect(updated?.rating).toBe(5);

      // Subsequent read hits cache
      const third = await service.all();
      expect(third).toBe(second);
      expect(listSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('evicts cache when a game is purchased', async () => {
    const { service, data } = await setupService();
    const wish = { ...emptyGame('Wish to Buy'), id: 'wish-to-buy', status: GameStatus.Wishlist };
    await data.games.save(wish);

    await runWithContext({ userId: 'user-cache-4' }, async () => {
      const listSpy = vi.spyOn(service.repository, 'list');

      const first = await service.all();
      expect(first.find((g) => g.id === wish.id)?.status).toBe(GameStatus.Wishlist);
      expect(listSpy).toHaveBeenCalledTimes(1);

      await service.purchase(wish.id);

      const second = await service.all();
      expect(listSpy).toHaveBeenCalledTimes(2);
      expect(second.find((g) => g.id === wish.id)?.status).toBe(GameStatus.NotStarted);
    });
  });

  it('caps cache size at MAX_CACHE_ENTRIES', async () => {
    const { service } = await setupService();

    // Populate 55 different user keys
    for (let i = 1; i <= 55; i++) {
      await runWithContext({ userId: `user-cap-${i}` }, async () => {
        await service.all();
      });
    }

    // Verify cache size does not exceed 50
    const cacheSize = (service as unknown as { scoredCache: Map<string, unknown> }).scoredCache
      .size;
    expect(cacheSize).toBeLessThanOrEqual(50);
  });
});
