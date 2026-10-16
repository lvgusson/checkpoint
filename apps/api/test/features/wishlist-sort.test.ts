import { expect, it } from 'vitest';
import { compareWishlistItems } from '../../../../packages/core/src/wishlist.ts';
import { emptyGame } from '../../src/integrations/steam/mapping.ts';
import { scoreGames } from '../../src/domain/scoring.ts';
import type { WishlistItem } from '../../../../packages/core/src/models.ts';
const item = (name: string, price: number | null, discount: number, score = 50): WishlistItem => ({
  game: { ...scoreGames([emptyGame(name)]).games[0], id: name, baseScore: score },
  description: null,
  price:
    price === null
      ? null
      : {
          currency: 'BRL',
          initialCents: price,
          finalCents: price,
          discountPercent: discount,
          discountEndsAt: null,
          isFree: price === 0,
          formatted: null,
          fetchedAt: '',
        },
});
it('wishlist shares stable price, discount and recommendation ordering with unknown prices last', () => {
  const items = [
    item('Unknown', null, 0),
    item('Beta', 100, 50, 70),
    item('Alpha', 100, 50, 70),
    item('Free', 0, 0, 10),
  ];
  const names = (sort: Parameters<typeof compareWishlistItems>[0]) =>
    [...items].sort(compareWishlistItems(sort)).map((i) => i.game.name);
  expect(names('price')).toStrictEqual(['Free', 'Alpha', 'Beta', 'Unknown']);
  expect(names('discount')).toStrictEqual(['Alpha', 'Beta', 'Free', 'Unknown']);
  expect(names('recommendation')).toStrictEqual(['Alpha', 'Beta', 'Unknown', 'Free']);
});

it('WishlistService.list defaults to recommendation sort', async () => {
  const { WishlistService } = await import('../../src/services/wishlist.ts');
  const { GameService } = await import('../../src/services/games.ts');
  const { SteamClient } = await import('../../src/integrations/steam/client.ts');
  const { createData } = await import('../../src/main/data.ts');
  const { GameStatus, Desire } = await import('../../../../packages/core/src/models.ts');

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
    ...emptyGame('Game Low Desire'),
    id: 'game-low',
    status: GameStatus.Wishlist,
    desire: Desire.Low,
  };
  const g2 = {
    ...emptyGame('Game High Desire'),
    id: 'game-high',
    status: GameStatus.Wishlist,
    desire: Desire.VeryHigh,
  };
  await data.games.save(g1);
  await data.games.save(g2);
  const games = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);
  const steam = new SteamClient({
    fetch: async () => {
      throw new Error('No external calls');
    },
  });
  const wishes = new WishlistService(games, data.wishlist, steam);
  const list = await wishes.list();
  expect(list.map((i) => i.game.id)).toEqual(['game-high', 'game-low']);
});
