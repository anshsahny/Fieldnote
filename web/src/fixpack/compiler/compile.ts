// Manual → fix pack compiler: one index call, then one call per fault code (small, checkable
// outputs), then assembly + validation. The model call is injected so this runs in tests.
import type { Part } from 'firebase/ai';
import { PROMPTS, renderPrompt } from '../../ai/prompts';
import {
  CODE_RESPONSE_SCHEMA,
  CompileError,
  INDEX_RESPONSE_SCHEMA,
  parseCodeOutput,
  parseIndexOutput,
  validateCodeOutput,
  type CodeOutput,
  type IndexOutput,
} from './assemble';

export interface GenerateRequest {
  system: string;
  parts: (string | Part)[];
  schema: Record<string, unknown>;
}
export interface GenerateResult {
  text: string;
  latencyMs: number;
  promptTokens?: number;
  model?: string;
}
export type GenerateFn = (req: GenerateRequest) => Promise<GenerateResult>;

export interface CallRecord {
  kind: 'index' | 'code';
  code?: string;
  attempt: number;
  ok: boolean;
  latencyMs: number;
  promptTokens?: number;
  model?: string;
  error?: string;
}

export interface CompileHooks {
  onProgress?: (message: string) => void;
  onCall?: (call: CallRecord) => void | Promise<void>;
  /** Waits between rate-limit retries (overridable in tests). */
  sleep?: (ms: number) => Promise<void>;
}

export interface ManualMeta {
  title: string;
  /** Original manual page numbers of the attached slice, e.g. "42-49". */
  pageList: string;
}

const isRateLimit = (e: unknown) => /429|RESOURCE_EXHAUSTED|quota|rate/i.test(String((e as Error)?.message ?? e));

async function call(gen: GenerateFn, req: GenerateRequest, hooks: CompileHooks): Promise<GenerateResult> {
  const sleep = hooks.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await gen(req);
    } catch (e) {
      if (!isRateLimit(e) || attempt >= 2) throw e;
      hooks.onProgress?.(`Rate limited; retrying in ${20 * (attempt + 1)} s…`);
      await sleep(20_000 * (attempt + 1));
    }
  }
}

export async function compileIndex(gen: GenerateFn, pdf: Part, meta: ManualMeta, hooks: CompileHooks = {}): Promise<IndexOutput> {
  const p = renderPrompt(PROMPTS.compile_index, { manual_title: meta.title, page_list: meta.pageList });
  hooks.onProgress?.('Reading the fault code index…');
  let result: GenerateResult | undefined;
  try {
    result = await call(gen, { system: p.system, parts: [p.user, pdf], schema: INDEX_RESPONSE_SCHEMA as never }, hooks);
    const index = parseIndexOutput(result.text);
    await hooks.onCall?.({ kind: 'index', attempt: 1, ok: true, latencyMs: result.latencyMs, promptTokens: result.promptTokens, model: result.model });
    return index;
  } catch (e) {
    await hooks.onCall?.({ kind: 'index', attempt: 1, ok: false, latencyMs: result?.latencyMs ?? 0, error: String((e as Error).message) });
    throw e;
  }
}

/** Compiles one code's step tree; retries once, feeding the validator's issues back to the model. */
export async function compileCode(
  gen: GenerateFn,
  pdf: Part,
  index: IndexOutput,
  code: string,
  meta: ManualMeta & { url: string },
  hooks: CompileHooks = {},
): Promise<CodeOutput> {
  const fc = index.faultCodes.find((f) => f.code === code);
  if (!fc) throw new CompileError(`Code ${code} is not in the index.`);
  let feedback = '';
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    hooks.onProgress?.(`Building steps for code ${code}${attempt > 1 ? ' (retry)' : ''}…`);
    const p = renderPrompt(PROMPTS.compile_code, {
      manual_title: meta.title,
      brand: index.brand,
      family: index.family,
      page_list: meta.pageList,
      code: fc.code,
      display: fc.display,
      meaning: fc.meaning,
      feedback,
    });
    let result: GenerateResult | undefined;
    try {
      result = await call(gen, { system: p.system, parts: [p.user, pdf], schema: CODE_RESPONSE_SCHEMA as never }, hooks);
      const out = parseCodeOutput(result.text, code);
      const issues = validateCodeOutput(index, code, out, { title: meta.title, url: meta.url, pages: meta.pageList });
      if (issues.length === 0) {
        await hooks.onCall?.({ kind: 'code', code, attempt, ok: true, latencyMs: result.latencyMs, promptTokens: result.promptTokens, model: result.model });
        return out;
      }
      lastError = issues.slice(0, 6).map((i) => `${i.path}: ${i.message}`).join('\n');
    } catch (e) {
      if (!(e instanceof CompileError)) {
        await hooks.onCall?.({ kind: 'code', code, attempt, ok: false, latencyMs: result?.latencyMs ?? 0, error: String((e as Error).message) });
        throw e;
      }
      lastError = e.message;
    }
    await hooks.onCall?.({ kind: 'code', code, attempt, ok: false, latencyMs: result?.latencyMs ?? 0, error: lastError });
    feedback = `Your previous answer had these problems; return a corrected tree:\n${lastError}`;
  }
  throw new CompileError(`Code ${code} could not be compiled into a valid tree:\n${lastError}`);
}
