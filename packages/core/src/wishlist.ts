import type { WishlistItem } from './models.ts';

export const wishlistSorts = ['name', 'price', 'discount', 'recommendation'] as const;
export type WishlistSort = (typeof wishlistSorts)[number];

/** The API and screen use the same order, with unavailable prices last. */
export function compareWishlistItems(sort: WishlistSort) {
  return (a: WishlistItem, b: WishlistItem): number => {
    const name = () =>
      a.game.name.localeCompare(b.game.name, 'pt-BR') || a.game.id.localeCompare(b.game.id);
    if (sort === 'recommendation') return b.game.baseScore - a.game.baseScore || name();
    if (sort === 'price' || sort === 'discount') {
      const available = (item: WishlistItem) =>
        !!item.price && (item.price.isFree || item.price.finalCents !== null);
      const aa = available(a),
        bb = available(b);
      if (aa !== bb) return aa ? -1 : 1;
      if (aa && bb) {
        const diff =
          sort === 'price'
            ? (a.price!.isFree ? 0 : a.price!.finalCents!) -
              (b.price!.isFree ? 0 : b.price!.finalCents!)
            : b.price!.discountPercent - a.price!.discountPercent;
        if (diff) return diff;
      }
    }
    return name();
  };
}
