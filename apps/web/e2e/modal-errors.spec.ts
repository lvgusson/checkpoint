import pkg from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { readFileCredentials, resolveBypassSecret, getBypassHeaders } from './route-map-helpers';

const { test, expect } = pkg;

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const fromFile = readFileCredentials();
const EMAIL = process.env.E2E_EMAIL ?? fromFile.email;
const PASSWORD = process.env.E2E_PASSWORD ?? fromFile.password;
const hasCredentials = Boolean(EMAIL && PASSWORD);

const BYPASS_SECRET = resolveBypassSecret(
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  fromFile.bypassSecret,
);

test.describe.serial('Game Detail Modal Network and Catalog Errors', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.skip(!hasCredentials, 'Requires credentials to test authenticated routes');
    const extraHTTPHeaders = getBypassHeaders(BASE_URL, BYPASS_SECRET);
    context = await browser.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders,
    });
    page = await context.newPage();

    await page.goto('/login');
    const emailInput = page.getByTestId('login-email');
    const passwordInput = page.getByTestId('login-password');
    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await emailInput.fill(EMAIL!);
    await passwordInput.fill(PASSWORD!);

    const submitBtn = page.getByTestId('login-submit-login');
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await page.getByRole('button', { name: /^Entrar$/i }).click();
    }
    await page.waitForURL(/\/(jogos|ordem)/, { timeout: 30000 });
  });

  test.afterAll(async () => {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
  });

  test('1. Catalog 504 error shows accessible alert, disables controls, and retry works when restored', async () => {
    await page.route('**/api/v1/catalog', (route) =>
      route.fulfill({
        status: 504,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'Gateway Timeout', status: 504 }),
      }),
    );

    await page.goto('/ordem');
    const queueRow = page.locator('.queue-row-main a, .next-game').first();
    await expect(queueRow).toBeVisible({ timeout: 10000 });
    await queueRow.click();

    const modal = page.locator('dialog[data-testid^="modal-game-"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Catalog error alert must appear
    const catalogAlert = modal.getByTestId('modal-catalog-error');
    await expect(catalogAlert).toBeVisible({ timeout: 5000 });
    await expect(catalogAlert).toHaveAttribute('role', 'alert');
    await expect(catalogAlert).toContainText('Não foi possível carregar as opções de catálogo.');

    // Retry button must be available
    const retryBtn = modal.getByTestId('modal-catalog-retry');
    await expect(retryBtn).toBeVisible();

    // Controls must be disabled while catalog is in error
    const statusSelect = modal.getByTestId('modal-status');
    const desireSelect = modal.getByTestId('modal-desire');
    const tagsSelect = modal.getByTestId('modal-tags');
    await expect(statusSelect).toBeDisabled();
    await expect(desireSelect).toBeDisabled();
    await expect(tagsSelect).toBeDisabled();

    // Unroute and click retry
    await page.unroute('**/api/v1/catalog');
    await retryBtn.click();

    // Error alert must disappear and controls become enabled
    await expect(catalogAlert).not.toBeVisible({ timeout: 5000 });
    await expect(statusSelect).toBeEnabled({ timeout: 5000 });
    await expect(desireSelect).toBeEnabled();
    await expect(tagsSelect).toBeEnabled();

    // Close modal
    const closeBtn = modal.getByTestId('modal-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('2. Catalog hanging request shows loading state and disables controls until aborted', async () => {
    let routeResolved = false;
    await page.route('**/api/v1/catalog', async (route) => {
      // Keep request pending until test finishes
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3000);
        page.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      if (!routeResolved) {
        routeResolved = true;
        await route.abort().catch(() => {});
      }
    });

    await page.goto('/ordem');
    const queueRow = page.locator('.queue-row-main a, .next-game').first();
    await expect(queueRow).toBeVisible({ timeout: 10000 });
    await queueRow.click();

    const modal = page.locator('dialog[data-testid^="modal-game-"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // While catalog is pending, loading status is displayed and controls are disabled
    const catalogLoading = modal.getByTestId('modal-catalog-loading');
    await expect(catalogLoading).toBeVisible({ timeout: 5000 });
    await expect(catalogLoading).toHaveAttribute('role', 'status');

    const statusSelect = modal.getByTestId('modal-status');
    await expect(statusSelect).toBeDisabled();

    await page.unroute('**/api/v1/catalog');
    const closeBtn = modal.getByTestId('modal-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('3. Game query failure removes loader and displays error alert with retry button', async () => {
    await page.route('**/api/v1/games/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'Internal Server Error', status: 500 }),
      }),
    );

    await page.goto('/ordem');
    const queueRow = page.locator('.queue-row-main a, .next-game').first();
    await expect(queueRow).toBeVisible({ timeout: 10000 });
    await queueRow.click();

    const modal = page.locator('dialog[data-testid^="modal-game-"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Modal loader must NOT remain visible
    const modalLoader = modal.getByTestId('loader-modal');
    await expect(modalLoader).not.toBeVisible({ timeout: 5000 });

    // Error UI must appear
    const errorAlert = modal.getByRole('alert');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('Não foi possível carregar o jogo.');

    const retryBtn = modal.getByTestId('modal-game-retry');
    await expect(retryBtn).toBeVisible();

    await page.unroute('**/api/v1/games/**');
    const closeBtn = modal.getByTestId('modal-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
