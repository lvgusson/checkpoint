import { useEffect, useRef } from 'react';

export interface UseInfiniteScrollOptions {
  /** Callback fired when the sentinel element enters the viewport. */
  onLoadMore: () => void;
  /** Whether there are more items to load. */
  hasMore: boolean;
  /** Whether a fetch is currently in flight. */
  isLoading: boolean;
  /** Distance from viewport to start loading (default: '100px'). */
  rootMargin?: string;
  /** Visibility threshold to trigger (default: 0). */
  threshold?: number;
  /** Scroll container element, or null for browser viewport. */
  root?: Element | null;
  /** Whether the observer is enabled (default: true). */
  enabled?: boolean;
  /** Change it after each slice renders: the observer restarts, so a sentinel still in view fires again. */
  resetKey?: unknown;
}

/**
 * Hook that sets up an IntersectionObserver on a sentinel element.
 * Triggers `onLoadMore` when the sentinel is intersecting, `hasMore` is true, and `isLoading` is false.
 */
export function useInfiniteScroll<T extends HTMLElement = HTMLDivElement>({
  onLoadMore,
  hasMore,
  isLoading,
  rootMargin = '100px',
  threshold = 0,
  root = null,
  enabled = true,
  resetKey,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<T | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  });

  useEffect(() => {
    if (!enabled || !hasMore || isLoading) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) onLoadMoreRef.current();
      },
      { root, rootMargin, threshold },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [enabled, hasMore, isLoading, rootMargin, threshold, root, resetKey]);

  return sentinelRef;
}
