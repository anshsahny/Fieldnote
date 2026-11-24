import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * P6 eval, opt-in (real model calls): EVAL_ROUTE=only_in_cloud npx playwright test e2e/eval.spec.ts
 * Runs the 24 scenarios on /eval (dev server, App Check debug token) and writes the run to
 * eval/results/web-<route>-<date>.json. Playwright's fresh Chrome profile has no Gemini Nano, so
 * the on-device route is run by hand in your own Chrome on /eval and downloaded from there.
 */
const route = process.env.EVAL_ROUTE;

test.skip(!route, 'set EVAL_ROUTE to run the eval');

test(`eval ${route}`, async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await page.goto(`/eval?route=${route}&auto=1`);
  await expect(page.getByRole('heading', { level: 1, name: 'Diagnosis eval' })).toBeVisible();
  type Probe = { __fieldnoteEval?: { done: boolean } };
  const handle = await page.waitForFunction(() => {
    const state = (globalThis as Probe).__fieldnoteEval;
    return state?.done ? state : false;
  }, undefined, {
    timeout: 19 * 60_000,
    polling: 2_000,
  });
  const result = (await handle.jsonValue()) as { run?: { route: string; startedAt: string; turns: unknown[] }; error?: string };
  expect(result.error).toBeUndefined();
  const run = result.run!;
  const dir = join(process.cwd(), '..', 'eval', 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `web-${run.route}-${run.startedAt.slice(0, 10)}.json`), JSON.stringify(run, null, 2) + '\n');
  expect(run.turns.length).toBeGreaterThan(0);
});
