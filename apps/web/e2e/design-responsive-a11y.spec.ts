import pkg from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const { test, expect } = pkg;

// DESIGN_ROUTES="/,/settings" overrides the route list.
const routes = (process.env.DESIGN_ROUTES ?? '/').split(',').map((r) => r.trim());
const widths = [320, 375, 768, 1024, 1440];

for (const route of routes) {
  for (const width of widths) {
    test(`${route} @${width}: no horizontal overflow, no axe violations`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      // A blank or still-hydrating page must fail, not pass: wait for a real heading and some text.
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect((await page.locator('body').innerText()).trim().length, 'page text').toBeGreaterThan(
        40,
      );

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal overflow').toBe(false);

      const slug = `${route.replace(/\W+/g, '_').replace(/^_+|_+$/g, '') || 'root'}-${width}`;
      await page.screenshot({ path: `test-results/design/${slug}.png`, fullPage: true });

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      await info.attach('axe', {
        body: JSON.stringify(violations, null, 2),
        contentType: 'application/json',
      });
      expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
}
