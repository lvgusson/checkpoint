import pkg from '@playwright/test';
const { test, expect } = pkg;

test.describe('Checkpoint E2E Smoke Tests', () => {
  test('should load the login page', async ({ page }) => {
    await page.goto('/login');

    // Check that login page is rendered
    await expect(page).toHaveTitle(/Checkpoint|checkpoint/i);

    // Verify login form elements exist and wait for mounting
    const emailInput = page.getByLabel(/e-mail ou usuário/i);
    const passwordInput = page.getByLabel(/senha/i);

    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible({ timeout: 10000 });

    // Verify sword brand mark is displayed
    const brandMark = page.locator('.brand-mark .bonfire');
    await expect(brandMark).toBeVisible({ timeout: 10000 });
  });

  test('should toggle password visibility on login page', async ({ page }) => {
    await page.goto('/login');

    const passwordInput = page.getByTestId('login-password');
    const toggleBtn = page.getByTestId('login-password-toggle');

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(toggleBtn).toHaveAttribute('aria-label', 'Mostrar');

    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(toggleBtn).toHaveAttribute('aria-label', 'Ocultar');

    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(toggleBtn).toHaveAttribute('aria-label', 'Mostrar');
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
    // Filter out network errors and third-party font preflights when bypass headers are present.
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Failed to fetch') &&
        !e.includes('Failed to load resource') &&
        !e.includes('fonts.gstatic.com') &&
        !e.includes('x-vercel-protection-bypass'),
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('should display Portuguese text on login page', async ({ page }) => {
    await page.goto('/login');

    // Wait for the login button / form to render
    const submitBtn = page.getByRole('button', { name: /^Entrar$/i });
    await expect(submitBtn).toBeVisible({ timeout: 10000 });

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
    await page.waitForURL(/\/(jogos|login)/, { timeout: 10000 }).catch(() => null);

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

    // Filter out expected network errors (API not running or third-party font preflights)
    const fatalErrors = jsErrors.filter(
      (e) =>
        !e.includes('Failed to fetch') &&
        !e.includes('Failed to load resource') &&
        !e.includes('fetch') &&
        !e.includes('API') &&
        !e.includes('http') &&
        !e.includes('fonts.gstatic.com') &&
        !e.includes('x-vercel-protection-bypass'),
    );

    expect(fatalErrors.length).toBe(0);
  });
});
