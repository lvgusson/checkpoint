import pkg from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import {
  TimingCollector,
  readFileCredentials,
  resolveBypassSecret,
  getBypassHeaders,
} from './route-map-helpers';

const { test, expect } = pkg;

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
// Login: env first, then the git-ignored playwrite-credentials.json at repo root ({ email, password, bypassSecret }).
const fromFile = readFileCredentials();
const EMAIL = process.env.E2E_EMAIL ?? fromFile.email;
const PASSWORD = process.env.E2E_PASSWORD ?? fromFile.password;
const hasCredentials = Boolean(EMAIL && PASSWORD);

// Vercel protection bypass: env variable wins over playwrite-credentials.json bypassSecret.
const BYPASS_SECRET = resolveBypassSecret(
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  fromFile.bypassSecret,
);

test.use({ trace: 'off' });

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

async function ensureAuth(p: Page): Promise<void> {
  if (!hasCredentials) return;
  if (p.url().includes('/login')) {
    const emailInput = p.getByTestId('login-email');
    const passwordInput = p.getByTestId('login-password');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill(EMAIL!);
      await passwordInput.fill(PASSWORD!);
      const submitBtn = p.getByTestId('login-submit-login');
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
      } else {
        await p.getByRole('button', { name: /^Entrar$/i }).click();
      }
      await p.waitForURL(/\/(jogos|ordem)/, { timeout: 30000 });
    }
  }
}

async function executeCleanup(cleanup: PendingCleanup, context: BrowserContext): Promise<void> {
  console.log(
    `[CLEANUP] Starting cleanup for game "${cleanup.gameId}". Original notes length: ${cleanup.originalNotes.length}`,
  );

  const base = cleanup.baseURL.replace(/\/+$/, '');
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
      `${base}/api/v1/games/${encodeURIComponent(cleanup.gameId)}`,
      {
        headers,
        data: { notes: cleanup.originalNotes },
        timeout: 30000,
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
      await freshPage.goto(`${base}/jogos/${encodeURIComponent(cleanup.gameId)}`, {
        timeout: 30000,
      });
      const notesArea = freshPage
        .getByTestId('detail-notes')
        .or(freshPage.locator('textarea[name="notes"]'));
      await expect(notesArea).toBeVisible({ timeout: 30000 });
      await notesArea.fill(cleanup.originalNotes);
      const saveBtn = freshPage
        .getByTestId('detail-notes-save')
        .or(freshPage.getByRole('button', { name: /Salvar avaliação/i }));
      await saveBtn.click();
      await expect(freshPage.getByTestId('detail-save-status')).toContainText(/Salvo/i, {
        timeout: 30000,
      });
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
    `${base}/api/v1/games/${encodeURIComponent(cleanup.gameId)}`,
    {
      headers: verifyHeaders,
      timeout: 30000,
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
    const extraHTTPHeaders = getBypassHeaders(BASE_URL, BYPASS_SECRET);
    context = await browser.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders,
    });
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
    await timings.collectSummary(page);
    timings.save();
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
  });

  function skipDestructive(testId: string, desc: string): void {
    console.log(`[SAFE-SKIP] Destructive element "${testId}": ${desc}`);
  }

  // Screen 1: Nav
  test('screen-1-nav: visit nav elements per testid-map', async () => {
    await page.goto('/login');

    // nav-skip-content
    await expect(page.getByTestId('nav-skip-content')).toBeAttached();

    // nav-brand-desktop / nav-brand-mobile
    const brand = page.getByTestId('nav-brand-desktop').or(page.getByTestId('nav-brand-mobile'));
    if (
      await brand
        .first()
        .isVisible({ timeout: 1000 })
        .catch(() => false)
    ) {
      await brand
        .first()
        .click()
        .catch(() => {});
    }

    // nav-theme-toggle
    const themeToggle = page.getByTestId('nav-theme-toggle');
    if (await themeToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await themeToggle.click().catch(() => {});
      await themeToggle.click().catch(() => {});
    }

    // nav desktop & mobile links
    for (const screen of ['library', 'wishlist', 'queue', 'settings', 'appearance']) {
      const link = page
        .getByTestId(`nav-desktop-${screen}`)
        .or(page.getByTestId(`nav-mobile-${screen}`));
      if (
        await link
          .first()
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        await link
          .first()
          .hover()
          .catch(() => {});
      }
    }

    // nav-logout (destructive)
    skipDestructive('nav-logout', 'Ends session');

    await timings.collect(page, 'screen-1-nav', '/login');
  });

  // Screen 2: Login
  test('screen-2-login: visit login elements per testid-map', async () => {
    await page.goto('/login');

    // Tabs
    const tabSignup = page.getByTestId('login-tab-signup');
    if (await tabSignup.isVisible({ timeout: 1500 }).catch(() => false)) {
      await tabSignup.click().catch(() => {});
    }
    const tabLogin = page.getByTestId('login-tab-login');
    if (await tabLogin.isVisible({ timeout: 1500 }).catch(() => false)) {
      await tabLogin.click().catch(() => {});
    }

    // Forgot / back
    const forgotLink = page.getByTestId('login-forgot');
    if (await forgotLink.isVisible({ timeout: 1500 }).catch(() => false)) {
      await forgotLink.click().catch(() => {});
      const backLink = page.getByTestId('login-back');
      if (await backLink.isVisible({ timeout: 1500 }).catch(() => false)) {
        await backLink.click().catch(() => {});
      }
    }

    // Inputs
    const emailInput = page.getByTestId('login-email');
    const passwordInput = page.getByTestId('login-password');
    await expect(emailInput).toBeVisible({ timeout: 30000 });
    await expect(passwordInput).toBeVisible({ timeout: 30000 });

    // Destructive signup/forgot/reset submits
    skipDestructive('login-submit-signup', 'Creates account');
    skipDestructive('login-submit-forgot', 'Requests password recovery');
    skipDestructive('login-submit-reset', 'Changes password');

    // Submit login if credentials available
    if (hasCredentials) {
      await emailInput.fill(EMAIL!);
      await passwordInput.fill(PASSWORD!);
      const submitBtn = page.getByTestId('login-submit-login');
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
      } else {
        await page.getByRole('button', { name: /^Entrar$/i }).click();
      }
      await page.waitForURL(/\/(jogos|ordem)/, { timeout: 30000 });
    }

    await timings.collect(page, 'screen-2-login', '/login');
  });

  // Screen 3: Library
  test('screen-3-library: visit library elements per testid-map', async () => {
    if (!hasCredentials) {
      test.skip(true, 'Skipping authenticated step without credentials.');
      return;
    }
    await page.goto('/jogos');
    await expect(page.locator('.game-grid')).toBeVisible({ timeout: 30000 });

    // library-open-queue
    const openQueue = page.getByTestId('library-open-queue');
    if (await openQueue.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(openQueue).toBeVisible();
    }

    // library-search
    const search = page.getByTestId('library-search');
    if (await search.isVisible({ timeout: 1000 }).catch(() => false)) {
      await search.fill('Mario');
      await page.waitForTimeout(300);
      await search.fill('');
    }

    // library-filter-{genre,status,store}
    for (const filter of ['genre', 'status', 'store']) {
      const sel = page.getByTestId(`library-filter-${filter}`);
      if (await sel.isVisible({ timeout: 1000 }).catch(() => false)) {
        await sel.focus().catch(() => {});
      }
    }

    // library-sort
    const sort = page.getByTestId('library-sort');
    if (await sort.isVisible({ timeout: 1000 }).catch(() => false)) {
      await sort.focus().catch(() => {});
    }

    // library-retry / error / load-more
    for (const retryId of ['library-retry', 'library-error-retry', 'library-load-more-retry']) {
      const retryBtn = page.getByTestId(retryId);
      if (await retryBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        // Inspect presence
      }
    }

    // First card link
    const firstCard = page.locator('.game-card a.card-link').first();
    await expect(firstCard).toBeVisible({ timeout: 30000 });

    // Skip destructive
    skipDestructive('library-playing-<code>', 'Toggles playing status');
    skipDestructive('library-immediate-<code>', 'Toggles immediate priority');

    await timings.collect(page, 'screen-3-library', '/jogos');
  });

  // Screen 4: Detail
  test('screen-4-detail: visit detail elements per testid-map and safe edit notes', async () => {
    if (!hasCredentials) {
      test.skip(true, 'Skipping authenticated step without credentials.');
      return;
    }
    await page.goto('/jogos');
    const firstCard = page.locator('.game-card a.card-link').first();
    await expect(firstCard).toBeVisible({ timeout: 30000 });
    const href = await firstCard.getAttribute('href');
    expect(href).toBeTruthy();
    const gameId = decodeURIComponent(href!.replace(/^\/jogos\//, ''));
    expect(gameId).toBeTruthy();

    await page.goto(href!);
    await ensureAuth(page);
    const detailForm = page
      .getByTestId('detail-form')
      .or(page.locator('form.detail-form'))
      .or(page.locator('.detail-page form'))
      .or(page.locator('form'));
    await expect(detailForm.first()).toBeVisible({ timeout: 30000 });

    // detail-{back,open-queue,time-source,imported-data}
    const backBtn = page.getByTestId('detail-back');
    if (await backBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(backBtn).toBeVisible();
    }
    const importedData = page.getByTestId('detail-imported-data');
    if (await importedData.isVisible({ timeout: 1000 }).catch(() => false)) {
      await importedData.click().catch(() => {});
      await importedData.click().catch(() => {});
    }

    // detail-rating-{1..5,clear}, auto-finish
    for (let r = 1; r <= 5; r++) {
      const rBtn = page.getByTestId(`detail-rating-${r}`);
      if (await rBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await rBtn.hover().catch(() => {});
      }
    }
    const autoFinish = page.getByTestId('detail-auto-finish');
    if (await autoFinish.isVisible({ timeout: 1000 }).catch(() => false)) {
      await autoFinish.click().catch(() => {});
      await autoFinish.click().catch(() => {});
    }

    // Field inputs
    for (const f of ['actual-hours', 'name', 'main-hours', 'extra-hours', 'completionist-hours']) {
      const input = page.getByTestId(`detail-${f}`);
      if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
        await input.focus().catch(() => {});
      }
    }

    // Metadata selectors
    for (const s of [
      'status',
      'desire',
      'genre',
      'tags',
      'pace',
      'mechanic',
      'structure',
      'store',
      'platform',
    ]) {
      const sel = page.getByTestId(`detail-${s}`);
      if (await sel.isVisible({ timeout: 500 }).catch(() => false)) {
        await sel.focus().catch(() => {});
      }
    }

    // Prerequisite search
    const prereqSearch = page.getByTestId('detail-prerequisite-search');
    if (await prereqSearch.isVisible({ timeout: 500 }).catch(() => false)) {
      await prereqSearch.focus().catch(() => {});
    }

    // Skip destructive
    skipDestructive('detail-prerequisite-remove', 'Removes prerequisite');
    skipDestructive('detail-finish', 'Finishes game');

    // Single allowed write: notes edit with pre-registered verified cleanup
    const notesArea = page.getByTestId('detail-notes').or(page.locator('textarea[name="notes"]'));
    await expect(notesArea).toBeVisible({ timeout: 30000 });
    const originalNotes = await notesArea.inputValue();
    console.log(`[detail-edit] Captured original notes length: ${originalNotes.length}`);

    const currentToken = capturedToken || (await getAuthToken(page));
    pendingCleanup = {
      gameId,
      originalNotes,
      token: currentToken,
      baseURL: BASE_URL,
    };

    const testNotes = originalNotes
      ? `${originalNotes} [e2e-route-map]`
      : 'Route map e2e test note';
    await notesArea.fill(testNotes);
    const saveBtn = page
      .getByTestId('detail-notes-save')
      .or(page.getByRole('button', { name: /Salvar avaliação/i }));
    await saveBtn.click();
    await expect(page.getByTestId('detail-save-status')).toContainText(/Salvo/i, {
      timeout: 30000,
    });

    await timings.collect(page, 'screen-4-detail', href!);

    const cleanup = pendingCleanup;
    pendingCleanup = null;
    await executeCleanup(cleanup, context);
  });

  // Screen 5: Queue
  test('screen-5-queue: visit queue elements per testid-map', async () => {
    if (!hasCredentials) {
      test.skip(true, 'Skipping authenticated step without credentials.');
      return;
    }
    await page.goto('/ordem');
    await ensureAuth(page);
    await expect(page.getByRole('heading', { name: /Ordem de jogos/i })).toBeVisible({
      timeout: 30000,
    });

    // queue-{search,search-clear,recalculate}
    const search = page.getByTestId('queue-search');
    if (await search.isVisible({ timeout: 1500 }).catch(() => false)) {
      await search.fill('Mario');
      const clearBtn = page.getByTestId('queue-search-clear');
      if (await clearBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await clearBtn.click().catch(() => {});
      } else {
        await search.fill('');
      }
    }
    const recalc = page.getByTestId('queue-recalculate');
    if (await recalc.isVisible({ timeout: 1000 }).catch(() => false)) {
      await recalc.click().catch(() => {});
    }

    // List menus & create / cancel
    const listTrigger = page.getByTestId('queue-list-trigger');
    if (await listTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await listTrigger.click().catch(() => {});
      const createBtn = page.getByTestId('queue-list-create');
      if (await createBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await createBtn.click().catch(() => {});
        const cancelBtn = page.getByTestId('queue-list-cancel');
        if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await cancelBtn.click().catch(() => {});
        }
      }
    }

    // Skip destructive
    skipDestructive('queue-playing-<code>', 'Toggles playing status');
    skipDestructive('queue-immediate-<code>', 'Toggles priority');
    skipDestructive('queue-finish-<code>', 'Opens finish completion');
    skipDestructive('queue-row-<code>', 'Reorders row');
    skipDestructive('queue-drag-<code>', 'Drags row position');
    skipDestructive('queue-release-<code>', 'Removes pin position');
    skipDestructive('queue-list-save', 'Saves new list');
    skipDestructive('queue-list-remove', 'Deletes list');

    await timings.collect(page, 'screen-5-queue', '/ordem');
  });

  // Screen 6: Wishlist
  test('screen-6-wishlist: visit wishlist elements per testid-map', async () => {
    if (!hasCredentials) {
      test.skip(true, 'Skipping authenticated step without credentials.');
      return;
    }
    await page.goto('/desejos');
    await ensureAuth(page);
    await expect(page.getByRole('heading', { name: /Lista de desejos/i })).toBeVisible({
      timeout: 30000,
    });

    // Steam search, desire, sort
    const steamSearch = page.getByTestId('wishlist-steam-search');
    if (await steamSearch.isVisible({ timeout: 1500 }).catch(() => false)) {
      await steamSearch.fill('Portal');
      await page.waitForTimeout(300);
      await steamSearch.fill('');
    }
    const desire = page.getByTestId('wishlist-desire');
    if (await desire.isVisible({ timeout: 1000 }).catch(() => false)) {
      await desire.focus().catch(() => {});
    }
    const sort = page.getByTestId('wishlist-sort');
    if (await sort.isVisible({ timeout: 1000 }).catch(() => false)) {
      await sort.focus().catch(() => {});
    }

    // Manual form open / inputs
    const manualOpen = page.getByTestId('wishlist-manual-open');
    if (await manualOpen.isVisible({ timeout: 1000 }).catch(() => false)) {
      await manualOpen.click().catch(() => {});
      for (const field of ['name', 'genre', 'hours']) {
        const inp = page.getByTestId(`wishlist-manual-${field}`);
        if (await inp.isVisible({ timeout: 500 }).catch(() => false)) {
          await inp.focus().catch(() => {});
        }
      }
    }

    // Import open
    const importOpen = page.getByTestId('wishlist-import-open');
    if (await importOpen.isVisible({ timeout: 1000 }).catch(() => false)) {
      await importOpen.click().catch(() => {});
      const profile = page.getByTestId('wishlist-steam-profile');
      if (await profile.isVisible({ timeout: 500 }).catch(() => false)) {
        await profile.focus().catch(() => {});
      }
    }

    // Skip destructive
    skipDestructive('wishlist-prices-refresh', 'Refreshes prices from Steam');
    skipDestructive('wishlist-steam-add-<id>', 'Adds game from Steam');
    skipDestructive('wishlist-manual-add', 'Adds manual game');
    skipDestructive('wishlist-steam-import', 'Imports steam profile');
    skipDestructive('wishlist-purchase-<code>', 'Moves game to library');

    await timings.collect(page, 'screen-6-wishlist', '/desejos');
  });

  // Screen 7: Settings
  test('screen-7-settings: visit settings elements per testid-map', async () => {
    if (!hasCredentials) {
      test.skip(true, 'Skipping authenticated step without credentials.');
      return;
    }
    await page.goto('/configuracoes');
    await ensureAuth(page);
    await expect(page.getByRole('heading', { name: /Configurações/i })).toBeVisible({
      timeout: 30000,
    });

    const openQueue = page.getByTestId('settings-open-queue');
    if (await openQueue.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(openQueue).toBeVisible();
    }
    const filterTags = page.getByTestId('settings-filter-tags');
    if (await filterTags.isVisible({ timeout: 1000 }).catch(() => false)) {
      await filterTags.click().catch(() => {});
      await filterTags.click().catch(() => {});
    }

    // Filters
    for (const f of [
      'min-hours',
      'max-hours',
      'exclude-unknown-hours',
      'min-desire',
      'coop-only',
    ]) {
      const sel = page.getByTestId(`settings-filter-${f}`);
      if (await sel.isVisible({ timeout: 500 }).catch(() => false)) {
        await sel.focus().catch(() => {});
      }
    }

    // Theme buttons
    for (const mode of ['system', 'light', 'dark']) {
      const btn = page.getByTestId(`settings-theme-${mode}`);
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click().catch(() => {});
      }
    }

    // Skip destructive
    skipDestructive('settings-list-save', 'Saves list edits');
    skipDestructive('settings-list-remove', 'Deletes list');
    skipDestructive('settings-catalog-add', 'Adds catalog entry');
    skipDestructive('settings-catalog-remove-...', 'Deletes catalog entry');
    skipDestructive('settings-discard', 'Discards settings changes');
    skipDestructive('settings-reset', 'Resets scoring configuration');
    skipDestructive('settings-save', 'Saves scoring configuration');
    skipDestructive('settings-logo-remove', 'Deletes logo');
    skipDestructive('settings-appearance-reset', 'Resets appearance');
    skipDestructive('settings-logout', 'Logs out user');

    await timings.collect(page, 'screen-7-settings', '/configuracoes');
  });

  // Screen 8: Modal
  test('screen-8-modal: visit modal elements per testid-map', async () => {
    if (!hasCredentials) {
      test.skip(true, 'Skipping authenticated step without credentials.');
      return;
    }
    await page.goto('/ordem');
    await ensureAuth(page);
    const rowLink = page.locator('.queue-row .queue-link').first();
    if (await rowLink.isVisible({ timeout: 30000 }).catch(() => false)) {
      await rowLink.click();
      const dialog = page.locator('dialog[open]');
      await expect(dialog).toBeVisible({ timeout: 30000 });

      // modal-notes
      const modalNotes = page.getByTestId('modal-notes');
      if (await modalNotes.isVisible({ timeout: 1000 }).catch(() => false)) {
        await modalNotes.focus().catch(() => {});
      }
      // modal-open-detail
      const openDetail = page.getByTestId('modal-open-detail');
      if (await openDetail.isVisible({ timeout: 1000 }).catch(() => false)) {
        await expect(openDetail).toBeVisible();
      }
      // modal-close
      const closeBtn = page
        .getByTestId('modal-close')
        .or(dialog.locator('button[aria-label="Fechar modal"]'));
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click();
      }

      skipDestructive('modal-status-option-<key>', 'Changes status in modal');
      skipDestructive('modal-desire-option-<key>', 'Changes desire in modal');
      skipDestructive('modal-notes-save', 'Saves notes from modal');
      skipDestructive('modal-finish', 'Finishes game from modal');
    }
    await timings.collect(page, 'screen-8-modal', '/ordem');
  });

  // Screen 9: Dialog
  test('screen-9-dialog: visit dialog cancel elements per testid-map', async () => {
    if (!hasCredentials) {
      test.skip(true, 'Skipping authenticated step without credentials.');
      return;
    }
    for (const cancelId of ['dialog-finish-cancel', 'dialog-settings-reset-cancel']) {
      const btn = page.getByTestId(cancelId);
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click().catch(() => {});
      }
    }
    skipDestructive('dialog-finish-save', 'Saves finish dialog');
    skipDestructive('dialog-list-remove-<id>-confirm', 'Deletes list');
    skipDestructive('dialog-settings-reset-confirm', 'Resets settings');

    await timings.collect(page, 'screen-9-dialog', '/ordem');
  });

  // Screen 10: Loader
  test('screen-10-loader: verify loader selectors per testid-map', async () => {
    for (const loader of ['loader-detail', 'loader-queue', 'loader-modal', 'loader-sword']) {
      const el = page.getByTestId(loader);
      await el.count();
    }
    await timings.collect(page, 'screen-10-loader', '/ordem');
  });
});
