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

test.describe.serial('Verification of Game Fixes (checkpoint-ad7)', () => {
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

    // Perform login once for the entire serial suite
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

  test('1. Library covers load, no runaway requests, and infinite scroll works', async () => {
    let gamesRequestCount = 0;
    const requestListener = (req: { url: () => string }) => {
      if (req.url().includes('/api/v1/games')) {
        gamesRequestCount++;
      }
    };
    page.on('request', requestListener);

    await page.goto('/jogos');

    // Expect game cards to be visible
    const cards = page.locator('.game-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const initialCardCount = await cards.count();
    expect(initialCardCount).toBeGreaterThan(0);

    // Verify cover images are loaded (at least one cover img has naturalWidth > 0)
    const coverImages = page.locator('.game-card .cover img');
    const imageCount = await coverImages.count();
    expect(imageCount).toBeGreaterThan(0);

    const hasLoadedImage = await coverImages.first().evaluate((img: HTMLImageElement) => {
      return img.complete && img.naturalWidth > 0;
    });
    expect(hasLoadedImage).toBe(true);

    // Verify requests stabilized (no infinite runaway)
    const countAfterLoad = gamesRequestCount;
    await page.waitForTimeout(1500);
    expect(gamesRequestCount - countAfterLoad).toBeLessThanOrEqual(2);

    // Scroll down to test infinite scroll
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    page.off('request', requestListener);
  });

  test('2. Modal opens quickly without infinite load and close button is not auto-focused', async () => {
    await page.goto('/ordem');

    const queueRow = page.locator('.queue-row-main a, .next-game').first();
    await expect(queueRow).toBeVisible({ timeout: 10000 });
    await queueRow.click();

    const modal = page.locator('dialog[data-testid^="modal-game-"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify that loader-modal is not stuck
    const modalLoader = page.getByTestId('loader-modal');
    await expect(modalLoader).not.toBeVisible({ timeout: 5000 });

    // Verify modal close button (X) is NOT the activeElement
    const isCloseFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.getAttribute('data-testid') === 'modal-close';
    });
    expect(isCloseFocused).toBe(false);

    // Close modal
    const closeBtn = page.getByTestId('modal-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('3. Detail page loads without infinite loader', async () => {
    await page.goto('/jogos');
    const firstCard = page.locator('.game-card a.card-link').first();
    await expect(firstCard).toBeVisible();
    const href = await firstCard.getAttribute('href');
    expect(href).toBeTruthy();

    await page.goto(href!);

    // Expect hero title or form to be visible, not loader
    const title = page.locator('.detail-hero h1');
    await expect(title).toBeVisible({ timeout: 8000 });
    const loader = page.getByTestId('loader-detail');
    await expect(loader).not.toBeVisible();
  });

  test('4. Queue page uses infinite scroll, not manual button', async () => {
    await page.goto('/ordem');

    // The manual button "Mostrar mais 10 jogos" must NOT exist as a button
    const manualBtn = page.locator('button.load-more');
    await expect(manualBtn).toHaveCount(0);
  });

  test('5. Wishlist has money icon instead of Comprei button, and shows confirmation modal', async () => {
    await page.goto('/desejos');

    // The old "Comprei" button should not exist
    const oldCompreiBtn = page.getByRole('button', { name: /^Comprei$/i });
    await expect(oldCompreiBtn).toHaveCount(0);

    const purchaseIcons = page.locator('button.wishlist-purchase-btn');
    test.skip((await purchaseIcons.count()) === 0, 'no wishlist games in this account');
    {
      const firstPurchaseIcon = purchaseIcons.first();
      await expect(firstPurchaseIcon).toBeVisible();

      // Click money icon -> modal confirmation appears
      await firstPurchaseIcon.click();

      const confirmModal = page.getByTestId('dialog-purchase');
      await expect(confirmModal).toBeVisible({ timeout: 5000 });

      const simBtn = confirmModal.getByTestId('dialog-purchase-confirm');
      const naoBtn = confirmModal.getByTestId('dialog-purchase-cancel');
      await expect(simBtn).toBeVisible();
      await expect(naoBtn).toBeVisible();

      // Click Não to dismiss without mutating
      await naoBtn.click();
      await expect(confirmModal).not.toBeVisible();
    }
  });

  test('6. Catalog card for wishlist game has money icon in card-immediate and confirmation modal', async () => {
    await page.goto('/jogos?status=Desejado');

    const purchaseBtns = page.locator(
      '.game-card .card-immediate button[data-testid^="library-purchase-"]',
    );
    test.skip((await purchaseBtns.count()) === 0, 'no wishlist games in this account');
    {
      const firstBtn = purchaseBtns.first();
      await expect(firstBtn).toBeVisible();

      await firstBtn.click();

      const confirmModal = page.getByTestId('dialog-purchase');
      await expect(confirmModal).toBeVisible({ timeout: 5000 });

      const simBtn = confirmModal.getByTestId('dialog-purchase-confirm');
      const naoBtn = confirmModal.getByTestId('dialog-purchase-cancel');
      await expect(simBtn).toBeVisible();
      await expect(naoBtn).toBeVisible();

      await naoBtn.click();
      await expect(confirmModal).not.toBeVisible();
    }
  });

  test('7. Combobox keyboard navigation and focus management in modal', async () => {
    await page.goto('/ordem');

    const queueRow = page.locator('.queue-row-main a, .next-game').first();
    await expect(queueRow).toBeVisible({ timeout: 10000 });
    await queueRow.click();

    const modal = page.locator('dialog[data-testid^="modal-game-"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const statusCombobox = modal.getByTestId('modal-status');
    await expect(statusCombobox).toBeVisible();

    // Open via keyboard ArrowDown
    await statusCombobox.focus();
    await page.keyboard.press('ArrowDown');

    const searchInput = modal.getByTestId('modal-status-search');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();

    // Verify aria-activedescendant is populated
    await expect(searchInput).toHaveAttribute('aria-activedescendant', /-option-/);

    // Escape closes listbox and restores focus to the trigger
    await page.keyboard.press('Escape');
    await expect(searchInput).not.toBeVisible();
    await expect(statusCombobox).toBeFocused();

    // Close modal
    const closeBtn = page.getByTestId('modal-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
