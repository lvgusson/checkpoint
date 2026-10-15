import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrackQueue, type TrackEvent } from './queue';

const event = (screen: string): TrackEvent => ({
  kind: 'page_view',
  screen,
  occurredAt: '2026-10-15T00:00:00.000Z',
});

/** Lets pending promise callbacks (fire-and-forget sends) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('createTrackQueue', () => {
  it('drops the oldest event when the cap is reached', () => {
    const send = vi.fn();
    const queue = createTrackQueue({ send });

    for (let i = 0; i <= 200; i++) queue.push(event(`/e${i}`));
    expect(queue.size()).toBe(200);

    queue.flush();
    const sent = send.mock.calls.flatMap(([events]) => events as TrackEvent[]);
    expect(sent).toHaveLength(200);
    expect(sent[0].screen).toBe('/e1');
    expect(sent[199].screen).toBe('/e200');
  });

  it('sends batches of at most 50 events', () => {
    const send = vi.fn();
    const queue = createTrackQueue({ send });

    for (let i = 0; i < 120; i++) queue.push(event(`/e${i}`));
    queue.flush();

    expect(send.mock.calls.map(([events]) => (events as TrackEvent[]).length)).toEqual([
      50, 50, 20,
    ]);
    expect(queue.size()).toBe(0);
  });

  it('flushes on the 5 second timer while data is queued', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const queue = createTrackQueue({ send });

    queue.push(event('/jogos'));
    vi.advanceTimersByTime(4_999);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(1);
    expect(queue.size()).toBe(0);
  });

  it('keeps no timer running when the queue is empty', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const queue = createTrackQueue({ send });

    expect(vi.getTimerCount()).toBe(0);

    queue.push(event('/jogos'));
    expect(vi.getTimerCount()).toBe(1);

    queue.flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops a batch after one failed retry (two attempts, no more)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const queue = createTrackQueue({ send });

    queue.push(event('/jogos'));
    queue.flush();
    await settle();
    await settle();

    expect(send).toHaveBeenCalledTimes(2);
    expect(queue.size()).toBe(0);
  });

  it('delivers the batch when the retry succeeds', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValue(undefined);
    const queue = createTrackQueue({ send });

    queue.push(event('/jogos'));
    queue.flush();
    await settle();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual([event('/jogos')]);
  });

  it('never throws when send throws synchronously', () => {
    const send = vi.fn(() => {
      throw new Error('boom');
    });
    const queue = createTrackQueue({ send });

    expect(() => queue.push(event('/jogos'))).not.toThrow();
    expect(() => queue.flush()).not.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never throws out of push or flush when send rejects', async () => {
    const send = vi.fn().mockRejectedValue(new Error('down'));
    const queue = createTrackQueue({ send });

    expect(() => queue.push(event('/jogos'))).not.toThrow();
    expect(() => queue.flush()).not.toThrow();
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('patternFor', async () => {
  const { patternFor } = await import('./index');

  it('preserves paths without parameters', () => {
    expect(patternFor('/jogos', {})).toBe('/jogos');
    expect(patternFor('/desejos', {})).toBe('/desejos');
    expect(patternFor('/configuracoes', {})).toBe('/configuracoes');
  });

  it('replaces dynamic route parameters with parameter pattern', () => {
    expect(patternFor('/ordem/cl9876543210', { listId: 'cl9876543210' })).toBe('/ordem/:listid');
    expect(patternFor('/jogos/super-mario', { id: 'super-mario' })).toBe('/jogos/:id');
    expect(patternFor('/configuracoes/list-1', { listId: 'list-1' })).toBe(
      '/configuracoes/:listid',
    );
  });

  it('rejects invalid or too long screen paths', () => {
    expect(patternFor('/invalid?query=true', {})).toBeUndefined();
    expect(patternFor('/' + 'a'.repeat(125), {})).toBeUndefined();
  });

  it('handles parameters with a percent symbol without throwing URIError', () => {
    expect(patternFor('/jogos/100%', { id: '100%' })).toBe('/jogos/:id');
    expect(patternFor('/jogos/100%25', { id: '100%' })).toBe('/jogos/:id');
    expect(patternFor('/ordem/%', { listId: '%' })).toBe('/ordem/:listid');
  });

  it('replaces only the exact segment when a param value is a substring of another segment', () => {
    expect(patternFor('/jogos/mario-kart/mario', { id: 'mario' })).toBe('/jogos/mario-kart/:id');
    expect(patternFor('/ordem/ordem-especial/123', { listId: '123' })).toBe(
      '/ordem/ordem-especial/:listid',
    );
  });
});
