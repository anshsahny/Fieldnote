import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * P5 smoke: the judge's path through the console, locally or on the hosted URL (BASE_URL).
 * A fresh Playwright Chrome profile has no on-device model, so triage takes the cloud path,
 * which is exactly what a judge without Chrome flags sees.
 */

async function expectAccessible(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map((v) => `${name}: ${v.id} (${v.impact}) ${v.nodes.length}× ${v.nodes[0]?.target.join(' ')}`),
    `${name} has serious accessibility issues`,
  ).toEqual([]);
}

test('status page works signed out without spending an App Check attempt', async ({ page }) => {
  const exchanges: string[] = [];
  page.on('request', (r) => r.url().includes('exchangeRecaptcha') && exchanges.push(r.url()));
  await page.goto('/status');
  await expect(page.getByRole('heading', { level: 1, name: 'Can this browser run AI on-device?' })).toBeVisible();
  await expect(page.getByTestId('appcheck-status')).toContainText('Checked on the first AI call');
  await page.waitForTimeout(2_000);
  // A token requested before any interaction scores low and can pause cloud AI for a day.
  expect(exchanges).toEqual([]);
  await expectAccessible(page, 'status');
});

test('dark theme is accessible too (contrast is checked per theme)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fn-theme', 'dark'));
  await page.goto('/');
  await expect(page.getByTestId('try-demo')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectAccessible(page, 'sign-in (dark)');
  await page.getByTestId('try-demo').click();
  await expect(page.locator('.list-item').first()).toBeVisible({ timeout: 20_000 });
  await expectAccessible(page, 'dashboard (dark)');
  await page.goto('/ledger');
  await expect(page.getByRole('heading', { name: 'AI calls per day' })).toBeVisible({ timeout: 20_000 });
  await expectAccessible(page, 'ledger (dark)');
  await page.goto('/jobs/job-1001');
  await expect(page.getByRole('heading', { name: 'Field session' })).toBeVisible({ timeout: 20_000 });
  await expectAccessible(page, 'job detail (dark)');
});

test('demo: sign in, dashboard, triage a sample photo, ledger', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/');
  await expect(page.getByTestId('try-demo')).toBeVisible();
  await expectAccessible(page, 'sign-in');
  await page.getByTestId('try-demo').click();

  await expect(page.getByRole('heading', { level: 1, name: "Today's dispatch" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('On the board')).toBeVisible();
  await expect(page.locator('.list-item').first()).toBeVisible({ timeout: 20_000 });
  await expectAccessible(page, 'dashboard');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Photo triage' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Know the fault before the truck rolls' })).toBeVisible();
  await page.getByRole('button', { name: 'Goodman display' }).click();
  await expect(page.getByRole('img', { name: /Customer photo: Goodman display/ })).toBeVisible();
  await expectAccessible(page, 'triage');
  await page.getByTestId('run-triage').click();

  // Without Chrome's on-device model, Fieldnote asks before a photo goes to the cloud.
  const confirm = page.getByTestId('confirm-cloud');
  if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) await confirm.click();

  // On the hosted site, App Check's reCAPTCHA sometimes scores a brand-new automated browser as a
  // bot and rejects the cloud call; the page must then explain it. Locally (debug token) and for
  // real visitors the result appears.
  const result = page.getByText("Model's guess");
  const botCheck = page.getByText(/didn't pass Google's bot check/);
  await expect(result.or(botCheck)).toBeVisible({ timeout: 60_000 });
  if (await botCheck.isVisible()) {
    test.info().annotations.push({ type: 'app-check', description: 'reCAPTCHA scored this automated browser as a bot' });
    expect(process.env.BASE_URL, 'App Check must not reject the local dev run').toBeTruthy();
  } else {
    await expect(page.locator('.triage-result').locator('.badge-cloud, .badge-ondevice').first()).toBeVisible();
  }

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Hybrid ledger' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Where the AI ran' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI calls per day' })).toBeVisible({ timeout: 20_000 });
  await expectAccessible(page, 'ledger');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Jobs' }).click();
  await expect(page.getByTestId('jobs-table')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('jobs-table').getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Field session' })).toBeVisible();
  await expectAccessible(page, 'job detail');
});
