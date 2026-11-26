import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Devpost gallery screenshots of the console (opt-in): SHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * 1440×900 at 2× (2880×1800 PNGs) into docs/submission/screenshots/, light theme, demo guest.
 * Triage runs the real cloud path once (a fresh Playwright profile has no Gemini Nano).
 */
test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });

const dir = join(process.cwd(), '..', 'docs', 'submission', 'screenshots');

async function shot(page: Page, name: string) {
  mkdirSync(dir, { recursive: true });
  await page.evaluate('window.scrollTo(0, 0)');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(600); // let charts and transitions settle
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

test('console screenshots', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem('fn-theme', 'light'));
  await page.goto('/');
  await page.getByTestId('try-demo').click();
  await expect(page.locator('.list-item').first()).toBeVisible({ timeout: 20_000 });
  await shot(page, 'web-1-dashboard');

  await page.goto('/triage');
  await page.getByRole('button', { name: 'Goodman display' }).click();
  await page.getByTestId('run-triage').click();
  const confirm = page.getByTestId('confirm-cloud');
  if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) await confirm.click();
  await expect(page.getByTestId('triage-fault')).toBeVisible({ timeout: 60_000 });
  await shot(page, 'web-2-triage');

  await page.goto('/ledger');
  await expect(page.getByRole('heading', { name: 'AI calls per day' })).toBeVisible({ timeout: 20_000 });
  await shot(page, 'web-3-ledger');

  await page.goto('/packs');
  await expect(page.getByTestId('published-packs')).toBeVisible({ timeout: 20_000 });
  await shot(page, 'web-4-packs');

  await page.goto('/jobs/job-1001');
  await expect(page.getByRole('heading', { name: 'Field session' })).toBeVisible({ timeout: 20_000 });
  await shot(page, 'web-5-job');

  await page.goto('/status');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(page, 'web-6-status');
});
