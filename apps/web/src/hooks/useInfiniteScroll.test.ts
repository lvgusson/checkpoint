/* eslint-disable react-hooks/rules-of-hooks -- hooks run in a fake runner, not in React */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The web test project runs in node (no DOM), so React hooks are replaced by a tiny runner.
type Slot = { deps?: unknown[]; cleanup?: void | (() => void) };
const runner = vi.hoisted(() => ({
  slots: [] as Slot[],
  refs: [] as { current: unknown }[],
  pending: [] as (() => void)[],
  effectIndex: 0,
  refIndex: 0,
}));

vi.mock('react', () => ({
  useRef: (initial: unknown) => (runner.refs[runner.refIndex++] ??= { current: initial }),
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
    const slot = (runner.slots[runner.effectIndex] ??= {});
    runner.effectIndex++;
    const changed = !deps || !slot.deps || deps.some((d, i) => !Object.is(d, slot.deps![i]));
    if (!changed) return;
    runner.pending.push(() => {
      if (typeof slot.cleanup === 'function') slot.cleanup();
      slot.deps = deps;
      slot.cleanup = effect();
    });
  },
}));

import { useInfiniteScroll, type UseInfiniteScrollOptions } from './useInfiniteScroll';

class FakeObserver {
  static all: FakeObserver[] = [];
  disconnected = false;
  constructor(public callback: (entries: { isIntersecting: boolean }[]) => void) {
    FakeObserver.all.push(this);
  }
  observe = vi.fn();
  disconnect = () => {
    this.disconnected = true;
  };
}

const live = () => FakeObserver.all.filter((o) => !o.disconnected);

function mount(options: Partial<UseInfiniteScrollOptions> = {}) {
  runner.effectIndex = 0;
  runner.refIndex = 0;
  const ref = useInfiniteScroll({
    onLoadMore: () => {},
    hasMore: true,
    isLoading: false,
    ...options,
  });
  ref.current = {} as HTMLDivElement; // the sentinel is mounted
  runner.pending.splice(0).forEach((run) => run());
}

beforeEach(() => {
  runner.slots.length = 0;
  runner.refs.length = 0;
  runner.pending.length = 0;
  FakeObserver.all = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

describe('useInfiniteScroll', () => {
  it('calls onLoadMore when the sentinel intersects', () => {
    const onLoadMore = vi.fn();
    mount({ onLoadMore });
    live()[0].callback([{ isIntersecting: false }]);
    expect(onLoadMore).not.toHaveBeenCalled();
    live()[0].callback([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['there is nothing more to load', { hasMore: false }],
    ['a fetch is in flight', { isLoading: true }],
    ['it is disabled', { enabled: false }],
  ])('does not observe when %s', (_name, options) => {
    mount(options);
    expect(FakeObserver.all).toHaveLength(0);
  });

  it('stops observing when loading starts and observes again when it ends', () => {
    mount();
    mount({ isLoading: true });
    expect(live()).toHaveLength(0);
    mount({ isLoading: false });
    expect(live()).toHaveLength(1);
  });

  it('keeps one observer and calls the latest onLoadMore', () => {
    const first = vi.fn();
    const second = vi.fn();
    mount({ onLoadMore: first });
    mount({ onLoadMore: second });
    expect(FakeObserver.all).toHaveLength(1);
    live()[0].callback([{ isIntersecting: true }]);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('observes again when resetKey changes, so a still-visible sentinel loads the next slice', () => {
    mount({ resetKey: 24 });
    mount({ resetKey: 24 });
    expect(FakeObserver.all).toHaveLength(1);
    mount({ resetKey: 48 });
    expect(FakeObserver.all).toHaveLength(2);
    expect(live()).toHaveLength(1);
  });
});
