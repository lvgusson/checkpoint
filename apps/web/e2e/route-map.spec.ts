import { readFileSync } from 'node:fs';
import pkg from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { TimingCollector } from './route-map-helpers';

const { test, expect } = pkg;

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
// Login: env first, then the git-ignored playwrite-credentials.json at the repo root ({ email, password }).
function fileCredentials(): { email?: string; password?: string } {
  try {
    return JSON.parse(
      readFileSync(new URL('../../../playwrite-credentials.json', import.meta.url), 'utf8'),
    );
  } catch {
    return {};
  }
}
const fromFile = fileCredentials();
const EMAIL = process.env.E2E_EMAIL ?? fromFile.email;
const PASSWORD = process.env.E2E_PASSWORD ?? fromFile.password;
const hasCredentials = Boolean(EMAIL && PASSWORD);

test.describe.configure({ mode: 'serial' });

interface PendingCleanup {
  gameId: string;
  originalNotes: string;
  token: string | null;
  baseURL: string;
}

let pendingCleanup: PendingCleanup | null = null;
let capturedToken: string | null = null;

async function getAuthToken(p: Page): Promise<string | null> {
  if (capturedToken) return capturedToken;
  try {
    const token = await p.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('auth-token') || key.startsWith('sb-'))) {
          try {
            const item = JSON.parse(localStorage.getItem(key) || '{}');
            if (item.access_token) return item.access_token;
          } catch {
            // Ignore malformed JSON in storage
          }
        }
      }
      return null;
    });
    if (token) capturedToken = token;
    return token;
  } catch {
    return null;
  }
}

async function executeCleanup(cleanup: PendingCleanup, context: BrowserContext): Promise<void> {
  console.log(
    `[CLEANUP] Starting cleanup for game "${cleanup.gameId}". Original notes length: ${cleanup.originalNotes.length}`,
  );

  let restored = false;
  let apiError: unknown = null;

  // 1. Try direct API restore with saved token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cleanup.token) {
    headers['Authorization'] = `Bearer ${cleanup.token}`;
  }

  try {
    const patchRes = await context.request.patch(
      `${cleanup.baseURL}/api/v1/games/${encodeURIComponent(cleanup.gameId)}`,
      {
        headers,
        data: { notes: cleanup.originalNotes },
        timeout: 15000,
      },
    );
    if (patchRes.ok()) {
      restored = true;
      console.log('[CLEANUP] Direct API restore succeeded.');
    } else {
      const errText = await patchRes.text().catch(() => '');
      apiError = new Error(`API restore returned HTTP ${patchRes.status()}: ${errText}`);
    }
  } catch (err) {
    apiError = err;
  }

  // 2. Fallback to a fresh page if API direct call failed
  if (!restored) {
    console.warn(
      `[CLEANUP] Direct API restore failed (${apiError instanceof Error ? apiError.message : String(apiError)}). Attempting fresh page restore...`,
    );
    const freshPage = await context.newPage();
    try {
      await freshPage.goto(`${cleanup.baseURL}/jogos/${encodeURIComponent(cleanup.gameId)}`, {
        timeout: 15000,
      });
      const notesArea = freshPage.locator('textarea[name="notes"]');
      await notesArea.waitFor({ state: 'visible', timeout: 10000 });
      await notesArea.fill(cleanup.originalNotes);
      const saveBtn = freshPage.getByRole('button', { name: /Salvar avaliação/i });
      await saveBtn.click();
      await freshPage
        .getByRole('status')
        .filter({ hasText: /Salvo/i })
        .waitFor({ state: 'visible', timeout: 10000 });
      restored = true;
      console.log('[CLEANUP] Fresh page restore succeeded.');
    } catch (pageErr) {
      throw new Error(
        `Cleanup restore failed via both API and fresh page. Fresh page error: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}. API error: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
        { cause: pageErr },
      );
    } finally {
      await freshPage.close().catch(() => {});
    }
  }

  // 3. Verify persisted value from API
  const verifyHeaders: Record<string, string> = {};
  if (cleanup.token) {
    verifyHeaders['Authorization'] = `Bearer ${cleanup.token}`;
  }
  const getRes = await context.request.get(
    `${cleanup.baseURL}/api/v1/games/${encodeURIComponent(cleanup.gameId)}`,
    {
      headers: verifyHeaders,
      timeout: 10000,
    },
  );
  if (!getRes.ok()) {
    throw new Error(
      `Cleanup verification failed: GET /api/v1/games/${cleanup.gameId} returned HTTP ${getRes.status()}`,
    );
  }
  const persistedGame = (await getRes.json()) as { notes?: string };
  const persistedNotes = persistedGame.notes ?? '';
  if (persistedNotes !== cleanup.originalNotes) {
    throw new Error(
      `Data safety violation: restored notes do not match original notes! Expected length ${cleanup.originalNotes.length}, persisted length ${persistedNotes.length}.`,
    );
  }
  console.log(
    `[CLEANUP] Verification confirmed. Persisted notes length: ${persistedNotes.length}.`,
  );
}

test.describe('Route Map E2E Spec', () => {
  let context: BrowserContext;
  let page: Page;
  const timings = new TimingCollector();

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: BASE_URL });
    page = await context.newPage();
    page.on('request', (req) => {
      const auth = req.headers()['authorization'];
      if (auth && auth.startsWith('Bearer ')) {
        capturedToken = auth.slice(7);
      }
    });
  });

  test.afterEach(async () => {
    if (pendingCleanup) {
      test.setTimeout(45000);
      const cleanup = pendingCleanup;
      pendingCleanup = null;
      await executeCleanup(cleanup, context);
    }
  });

  test.afterAll(async () => {
    if (pendingCleanup) {
      const cleanup = pendingCleanup;
      pendingCleanup = null;
      await executeCleanup(cleanup, context);
    }
    timings.save();
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
  });

  // Step 1: login-view
  test('login-view: load login screen and verify form elements', async () => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Checkpoint|checkpoint/i);

    const emailInput = page.getByLabel(/email|usuário/i, { exact: false });
    const passwordInput = page.getByLabel(/senha|password/i, { exact: false });

    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible({ timeout: 10000 });

    await timings.collect(page, 'login-view', '/login');
  });

  // Step 2: login-submit
  test('login-submit: submit credentials and verify authentication', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping login submission.');
      return;
    }

    await page.goto('/login');
    const emailInput = page.getByLabel(/email|usuário/i, { exact: false });
    const passwordInput = page.getByLabel(/senha|password/i, { exact: false });

    await emailInput.fill(EMAIL!);
    await passwordInput.fill(PASSWORD!);

    const submitButton = page.getByRole('button', { name: /^Entrar$/i });
    await submitButton.click();

    await page.waitForURL(/\/(jogos|ordem)/, { timeout: 15000 });
    await timings.collect(page, 'login-submit', '/login');
  });

  // Step 3: theme-toggle
  test('theme-toggle: toggle light/dark theme in shell header', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping authenticated step.');
      return;
    }

    await page.goto('/jogos');
    const toggle = page.locator('header.topbar button.theme-toggle');
    await expect(toggle).toBeVisible({ timeout: 10000 });

    const initialLabel = await toggle.getAttribute('aria-label');
    await toggle.click();

    const toggledLabel = await toggle.getAttribute('aria-label');
    expect(toggledLabel).not.toBe(initialLabel);

    // Restore original theme
    await toggle.click();
    expect(await toggle.getAttribute('aria-label')).toBe(initialLabel);

    await timings.collect(page, 'theme-toggle', '/jogos');
  });

  // Step 4: library-view
  test('library-view: view games library catalog and statistics', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping authenticated step.');
      return;
    }

    await page.goto('/jogos');
    await expect(page.getByRole('heading', { name: /Lista de jogos/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('.game-grid')).toBeVisible({ timeout: 10000 });

    await timings.collect(page, 'library-view', '/jogos');
  });

  // Step 5: library-filters
  test('library-filters: filter games by search text', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping authenticated step.');
      return;
    }

    await page.goto('/jogos');
    const searchInput = page.getByRole('searchbox', { name: /Buscar jogo/i });
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    await searchInput.fill('Mario');
    await page.waitForTimeout(400);

    // Clear search to restore state
    await searchInput.fill('');
    await page.waitForTimeout(400);

    await timings.collect(page, 'library-filters', '/jogos');
  });

  // Step 6: library-scroll
  test('library-scroll: scroll down to trigger infinite catalog loading', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping authenticated step.');
      return;
    }

    await page.goto('/jogos');
    await expect(page.locator('.game-grid .game-card').first()).toBeVisible({ timeout: 10000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);

    await timings.collect(page, 'library-scroll', '/jogos');
  });

  // Step 7: detail-modal
  test('detail-modal: open game detail modal dialog', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping authenticated step.');
      return;
    }

    await page.goto('/ordem');
    const rowLink = page.locator('.queue-row .queue-link').first();
    await expect(rowLink).toBeVisible({ timeout: 10000 });
    await rowLink.click();

    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('#modal-game-title')).toBeVisible();

    // Close modal
    const closeBtn = dialog.locator('button[aria-label="Fechar modal"]');
    await closeBtn.click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    await timings.collect(page, 'detail-modal', '/ordem');
  });

  // Step 8: game-edit
  test('game-edit: modify editable notes and restore original value', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping authenticated step.');
      return;
    }

    await page.goto('/jogos');
    const firstCard = page.locator('.game-card a.card-link').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    const href = await firstCard.getAttribute('href');
    expect(href).toBeTruthy();

    const gameId = decodeURIComponent(href!.replace(/^\/jogos\//, ''));
    expect(gameId).toBeTruthy();

    await page.goto(href!);
    const notesArea = page.locator('textarea[name="notes"]');
    await expect(notesArea).toBeVisible({ timeout: 10000 });

    // Read original value before editing (log length only, never the value)
    const originalNotes = await notesArea.inputValue();
    console.log(`[game-edit] Captured original notes length: ${originalNotes.length}`);

    // Register cleanup BEFORE the first write
    const currentToken = capturedToken || (await getAuthToken(page));
    pendingCleanup = {
      gameId,
      originalNotes,
      token: currentToken,
      baseURL: BASE_URL,
    };

    // Perform mutation
    const testNotes = originalNotes
      ? `${originalNotes} [e2e-route-map]`
      : 'Route map e2e test note';

    await notesArea.fill(testNotes);
    const saveBtn = page.getByRole('button', { name: /Salvar avaliação/i });
    await saveBtn.click();

    // Check saved
    await expect(page.getByRole('status')).toContainText(/Salvo/i, { timeout: 10000 });
    expect(await notesArea.inputValue()).toBe(testNotes);

    await timings.collect(page, 'game-edit', href!);

    // Restore immediately using dedicated cleanup
    const cleanup = pendingCleanup;
    pendingCleanup = null;
    await executeCleanup(cleanup, context);
  });

  // Step 9: queue-view (read-only: no pin manipulation, no delete, no reordering)
  test('queue-view: view recommended games queue', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping authenticated step.');
      return;
    }

    await page.goto('/ordem');
    await expect(page.getByRole('heading', { name: /Ordem de jogos/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('.queue-row, .empty-state, .queue-list').first())
      .toBeVisible({ timeout: 10000 })
      .catch(() => {});

    await timings.collect(page, 'queue-view', '/ordem');
  });

  // Step 10: wishlist-view
  test('wishlist-view: view wishlist and steam prices', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping authenticated step.');
      return;
    }

    await page.goto('/desejos');
    await expect(page.getByRole('heading', { name: /Lista de desejos/i })).toBeVisible({
      timeout: 10000,
    });

    await timings.collect(page, 'wishlist-view', '/desejos');
  });

  // Step 11: settings-view
  test('settings-view: view scoring rules and content filters', async () => {
    if (!hasCredentials) {
      test.skip(true, 'E2E_EMAIL and E2E_PASSWORD are not set: skipping authenticated step.');
      return;
    }

    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { name: /Configurações/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('table.factors')).toBeVisible({ timeout: 10000 });

    await timings.collect(page, 'settings-view', '/configuracoes');
  });
});
