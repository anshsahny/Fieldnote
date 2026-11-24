// Builds eval/results/README.md from the eval runs in eval/results/*.json.
//   cd web && npm run eval:report
// Runs come from the iPhone (Diagnostics → P6 scenarios → Share, or -FNRunScenarios via devicectl),
// the Simulator, and Chrome (/eval in dev, or EVAL_ROUTE=only_in_cloud npx playwright test e2e/eval.spec.ts).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { EvalRun } from '../src/eval/summary';
import { report, resultsTable, type Pricing } from '../src/eval/report';

const root = resolve(import.meta.dirname, '..', '..');
const dir = join(root, 'eval', 'results');

const template = JSON.parse(readFileSync(join(root, 'remoteconfig.template.json'), 'utf8')) as {
  parameterGroups?: Record<string, { parameters: Record<string, { defaultValue?: { value?: string } }> }>;
  parameters?: Record<string, { defaultValue?: { value?: string } }>;
};
const params = {
  ...template.parameters,
  ...Object.values(template.parameterGroups ?? {}).reduce((a, g) => ({ ...a, ...g.parameters }), {}),
} as Record<string, { defaultValue?: { value?: string } }>;
const value = (key: string) => params[key]?.defaultValue?.value ?? '';
const pricing: Pricing = {
  inputPerMTok: Number(value('cloud_price_input_per_mtok')),
  outputPerMTok: Number(value('cloud_price_output_per_mtok')),
  source: value('cloud_price_source'),
};

const runs = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as EvalRun)
  .filter((r) => Array.isArray(r.turns) && r.platform && r.route);

if (!runs.length) {
  console.error(`No runs in ${dir}`);
  process.exit(1);
}
// Hand-written notes on what was tuned between runs (eval/results/tuning.md) follow the table.
const tuning = existsSync(join(dir, 'tuning.md')) ? readFileSync(join(dir, 'tuning.md'), 'utf8') : '';
writeFileSync(join(dir, 'README.md'), report(runs, pricing, tuning));
console.log(resultsTable(runs, pricing));
console.log(`\nWrote eval/results/README.md from ${runs.length} run(s).`);
