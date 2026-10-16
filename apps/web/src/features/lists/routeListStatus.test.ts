import { describe, expect, it } from 'vitest';
import { routeListStatus } from './lists-store';

describe('routeListStatus', () => {
  it('returns ready when listId is known without waterfalling on lists query', () => {
    expect(routeListStatus('known-list', { isError: false, data: undefined })).toBe('ready');
    expect(routeListStatus('known-list', { isError: true })).toBe('ready');
  });

  it('returns error when listId is null and lists query failed (root cause fix)', () => {
    expect(routeListStatus(null, { isError: true })).toBe('error');
    expect(routeListStatus(null, { isError: true, data: undefined })).toBe('error');
  });

  it('returns empty when listId is null and user has no lists (root cause fix)', () => {
    expect(routeListStatus(null, { isError: false, data: [] })).toBe('empty');
  });

  it('returns loading when listId is null and lists are still loading', () => {
    expect(routeListStatus(null, { isError: false, data: undefined })).toBe('loading');
  });

  it('returns loading when listId is null while effect redirects to an available list', () => {
    expect(routeListStatus(null, { isError: false, data: [{ id: 'default-list' }] })).toBe(
      'loading',
    );
  });
});
