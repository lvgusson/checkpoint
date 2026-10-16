import pkg from '@playwright/test';
import { isLocalhost, resolveBypassSecret, getBypassHeaders } from './route-map-helpers';

const { test, expect } = pkg;

test.describe('Vercel Protection Bypass Helpers', () => {
  test('isLocalhost identifies local URLs and loopback addresses', () => {
    expect(isLocalhost('http://localhost:5173')).toBe(true);
    expect(isLocalhost('http://localhost:3000')).toBe(true);
    expect(isLocalhost('http://localhost')).toBe(true);
    expect(isLocalhost('http://127.0.0.1:5173')).toBe(true);
    expect(isLocalhost('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalhost('http://0.0.0.0:5173')).toBe(true);
    expect(isLocalhost('http://[::1]:5173')).toBe(true);
    expect(isLocalhost('')).toBe(true);
    expect(isLocalhost(undefined)).toBe(true);
  });

  test('isLocalhost returns false for remote preview domains', () => {
    expect(isLocalhost('https://checkpoint-preview.vercel.app')).toBe(false);
    expect(isLocalhost('https://checkpoint-git-homologacao.vercel.app')).toBe(false);
    expect(isLocalhost('https://staging.checkpoint.app')).toBe(false);
  });

  test('resolveBypassSecret prioritizes environment variable over credentials file', () => {
    expect(resolveBypassSecret('env-secret', 'file-secret')).toBe('env-secret');
    expect(resolveBypassSecret(undefined, 'file-secret')).toBe('file-secret');
    expect(resolveBypassSecret('', 'file-secret')).toBe('file-secret');
    expect(resolveBypassSecret('   ', 'file-secret')).toBe('file-secret');
    expect(resolveBypassSecret('env-secret', undefined)).toBe('env-secret');
    expect(resolveBypassSecret(undefined, undefined)).toBeUndefined();
    expect(resolveBypassSecret('', '')).toBeUndefined();
  });

  test('getBypassHeaders returns undefined when BASE_URL is localhost even if secret exists', () => {
    expect(getBypassHeaders('http://localhost:5173', 'secret123')).toBeUndefined();
    expect(getBypassHeaders('http://127.0.0.1:5173', 'secret123')).toBeUndefined();
    expect(getBypassHeaders('', 'secret123')).toBeUndefined();
    expect(getBypassHeaders(undefined, 'secret123')).toBeUndefined();
  });

  test('getBypassHeaders returns undefined when secret is missing or empty', () => {
    expect(getBypassHeaders('https://checkpoint-preview.vercel.app', undefined)).toBeUndefined();
    expect(getBypassHeaders('https://checkpoint-preview.vercel.app', '')).toBeUndefined();
  });

  test('getBypassHeaders returns bypass and cookie headers for remote preview URL', () => {
    const headers = getBypassHeaders('https://checkpoint-preview.vercel.app', 'test-bypass-secret');
    expect(headers).toEqual({
      'x-vercel-protection-bypass': 'test-bypass-secret',
      'x-vercel-set-bypass-cookie': 'true',
    });
  });
});
