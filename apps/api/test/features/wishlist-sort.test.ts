import assert from 'node:assert/strict';
import { test } from 'node:test';
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
test('wishlist shares stable price, discount and recommendation ordering with unknown prices last', () => {
  const items = [
    item('Unknown', null, 0),
    item('Beta', 100, 50, 70),
    item('Alpha', 100, 50, 70),
    item('Free', 0, 0, 10),
  ];
  const names = (sort: Parameters<typeof compareWishlistItems>[0]) =>
    [...items].sort(compareWishlistItems(sort)).map((i) => i.game.name);
  assert.deepEqual(names('price'), ['Free', 'Alpha', 'Beta', 'Unknown']);
  assert.deepEqual(names('discount'), ['Alpha', 'Beta', 'Free', 'Unknown']);
  assert.deepEqual(names('recommendation'), ['Alpha', 'Beta', 'Unknown', 'Free']);
});
