import fs from 'node:fs';
import pkg from '@playwright/test';
const { defineConfig, devices } = pkg;

function isLocalhost(urlStr) {
  if (!urlStr) return true;
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]'
    );
  } catch {
    const lower = urlStr.toLowerCase();
    return lower.includes('localhost') || lower.includes('127.0.0.1');
  }
}

function getBypassSecret() {
  const envSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (envSecret) return envSecret;
  try {
    const creds = JSON.parse(
      fs.readFileSync(new URL('../../playwrite-credentials.json', import.meta.url), 'utf8'),
    );
    return creds.bypassSecret?.trim() || undefined;
  } catch {
    return undefined;
  }
}

const rawBaseURL = process.env.BASE_URL?.trim();
const baseURL = rawBaseURL || 'http://localhost:5173';
const isLocal = isLocalhost(baseURL);
const bypassSecret = !isLocal ? getBypassSecret() : undefined;

const extraHTTPHeaders = bypassSecret
  ? {
      'x-vercel-protection-bypass': bypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    }
  : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    extraHTTPHeaders,
    trace: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: isLocal
    ? {
        command: 'pnpm dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      }
    : undefined,
});
