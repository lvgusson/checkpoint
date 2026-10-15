import pkg from '@playwright/test';
const { test, expect } = pkg;

test.describe('Checkpoint E2E Smoke Tests', () => {
  test('should load the login page', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // Check that login page is rendered
    await expect(page).toHaveTitle(/Checkpoint|checkpoint/i);

    // Verify login form elements exist
    const emailInput = page.getByLabel(/email|usuário/i, { exact: false });
    const passwordInput = page.getByLabel(/senha|password/i, { exact: false });

    // At least one of these should be present (label might vary)
    const hasEmailInput = await emailInput.isVisible().catch(() => false);
    const hasPasswordInput = await passwordInput.isVisible().catch(() => false);
    const hasFormInputs =
      hasEmailInput ||
      hasPasswordInput ||
      (await page
        .locator('input[type="email"]')
        .count()
        .then((c) => c > 0));

    expect(hasFormInputs).toBe(true);
  });

  test('should log no console errors on the login page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/login', { waitUntil: 'networkidle' });
    // The API is not running in these tests: the dev proxy answers 502 for /api calls.
    const criticalErrors = errors.filter(
      (e) => !e.includes('Failed to fetch') && !e.includes('Failed to load resource'),
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('should display Portuguese text on login page', async ({ page }) => {
    await page.goto('/login');

    // The page uses Portuguese for UI text
    const pageContent = await page.content();

    // Check for at least one Portuguese phrase that's always visible
    const hasPortuguese =
      pageContent.includes('Entrar') ||
      pageContent.includes('Criar conta') ||
      pageContent.includes('BEM-VINDO');

    expect(hasPortuguese).toBe(true);
  });

  test('should handle route navigation structure', async ({ page }) => {
    await page.goto('/');

    // Home redirects to /jogos (library)
    await page.waitForURL(/\/(jogos|login)/, { timeout: 5000 }).catch(() => null);

    // Verify we're on a valid route
    const url = page.url();
    const isValidRoute = /\/(jogos|login)/.test(url);

    expect(isValidRoute).toBe(true);
  });

  test('should render without fatal JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });

    page.on('pageerror', (error) => {
      jsErrors.push(error.toString());
    });

    await page.goto('/login', { waitUntil: 'networkidle' });

    // Filter out expected network errors (API not running)
    const fatalErrors = jsErrors.filter(
      (e) =>
        !e.includes('Failed to fetch') &&
        !e.includes('Failed to load resource') &&
        !e.includes('fetch') &&
        !e.includes('API') &&
        !e.includes('http'),
    );

    expect(fatalErrors.length).toBe(0);
  });
});
