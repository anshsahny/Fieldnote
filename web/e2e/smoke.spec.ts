import { expect, test } from '@playwright/test';

test('console shell renders and App Check settles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Fieldnote console' })).toBeVisible();
  // App Check either acquires a token or reports why not; it must not hang on "Checking…".
  await expect(page.getByTestId('appcheck-status')).not.toContainText('Checking', { timeout: 20_000 });
});
