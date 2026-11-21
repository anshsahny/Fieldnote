import { describe, expect, it, vi } from 'vitest';
import type { Part } from 'firebase/ai';
import { validateFixPack } from '../validate';
import { assemblePack, codePrefix, CompileError, stepsForCode, type CodeOutput, type IndexOutput } from './assemble';
import { compileCode, compileIndex, retryableReason, type GenerateFn } from './compile';
import { formatPages, parsePageRange } from './pdf';

const pdf = { type: 'inlineData', inlineData: { mimeType: 'application/pdf', data: 'JVBERi0=' } } as Part;
const meta = { title: 'Acme AF96 manual', pageList: '10-12', url: 'https://example.com/af96.pdf' };

const index: IndexOutput = {
  brand: 'Acme',
  family: 'AF96 two-stage furnace',
  equipmentType: 'gas_furnace',
  displayType: 'seven_segment',
  modelPatterns: ['^AF96\\d{4}[A-Z]{2}$'],
  faultCodes: [
    { code: 'E3', display: 'Display shows E3', meaning: 'Pressure switch open', pages: '11' },
    { code: 'E4', display: 'Display shows E4', meaning: 'Limit open', pages: '12' },
  ],
};

const tree = (opts: { brokenTarget?: boolean } = {}): CodeOutput => ({
  likelyCauses: ['Blocked vent', 'Failed inducer'],
  firstStep: 'S1',
  steps: [
    {
      id: 'S1',
      instruction: 'Call for heat and check the inducer.',
      ask: { type: 'observation', options: ['runs', 'does not run'] },
      next: [
        { option: 'runs', goto: opts.brokenTarget ? 'S9' : 'S2' },
        { option: 'does not run', goto: 'S3' },
      ],
      safety: 'EXPOSED_WIRING',
      pages: '11',
    },
    { id: 'S2', instruction: 'Inducer runs.', outcome: { kind: 'escalate', summary: 'Check the pressure switch hose and vent.' }, safety: 'NONE' },
    { id: 'S3', instruction: 'Inducer is dead.', outcome: { kind: 'fix', summary: 'Replace the inducer motor.', parts: ['inducer motor'] } },
  ],
});

const reply = (value: unknown) => ({ text: typeof value === 'string' ? value : JSON.stringify(value), latencyMs: 5, promptTokens: 1200, model: 'gemini-test' });

describe('compiler: mocked model output', () => {
  it('index + per-code trees assemble into a pack that passes the validator', async () => {
    const gen: GenerateFn = vi.fn(async (req) => (req.schema.required && (req.schema.required as string[]).includes('faultCodes') ? reply(index) : reply(tree())));
    const idx = await compileIndex(gen, pdf, meta);
    const codes = { E3: await compileCode(gen, pdf, idx, 'E3', meta), E4: await compileCode(gen, pdf, idx, 'E4', meta) };
    const pack = assemblePack({ index: idx, codes, source: { title: meta.title, url: meta.url, pages: meta.pageList } });
    const result = validateFixPack(pack);
    expect(result.ok, JSON.stringify(!result.ok && result.issues)).toBe(true);
    expect(pack.packId).toBe('acme-af96-two-stage-furnace-v1');
    expect(pack.faultCodes.map((f) => f.firstStep)).toEqual(['CE3-S1', 'CE4-S1']);
    expect(pack.steps['CE3-S1']!.safety).toBe('EXPOSED_WIRING');
    expect(pack.steps['CE3-S2']!.safety).toBeUndefined();
    expect(pack.safetyStops.map((s) => s.id)).toContain('GAS');
  });

  it('sends the manual pages and the prompt to every call', async () => {
    const gen = vi.fn<GenerateFn>(async () => reply(tree()));
    await compileCode(gen, pdf, index, 'E3', meta);
    const req = gen.mock.calls[0]![0];
    expect(req.parts).toContain(pdf);
    expect(String(req.parts[0])).toContain('Fault code: E3');
    expect(req.system).toContain('Never invent');
  });

  it('retries once with the validator issues as feedback, then succeeds', async () => {
    const gen = vi.fn<GenerateFn>().mockResolvedValueOnce(reply(tree({ brokenTarget: true }))).mockResolvedValueOnce(reply(tree()));
    const calls: boolean[] = [];
    const out = await compileCode(gen, pdf, index, 'E3', meta, { onCall: (c) => void calls.push(c.ok) });
    expect(out.steps[0]!.next![0]!.goto).toBe('S2');
    expect(String(gen.mock.calls[1]![0].parts[0])).toMatch(/previous answer had these problems[\s\S]*CE3-S9/);
    expect(calls).toEqual([false, true]);
  });

  it('turns malformed output into a readable error after one retry', async () => {
    const gen = vi.fn<GenerateFn>(async () => reply('{"likelyCauses": ["x"], "steps": '));
    await expect(compileCode(gen, pdf, index, 'E3', meta)).rejects.toThrow(/Code E3 could not be compiled[\s\S]*did not return valid JSON/);
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it('reports wrongly shaped output with field paths', async () => {
    const gen = vi.fn<GenerateFn>(async () => reply({ likelyCauses: [], steps: [] }));
    await expect(compileIndex(gen, pdf, meta)).rejects.toBeInstanceOf(CompileError);
    await expect(compileCode(gen, pdf, index, 'E3', meta)).rejects.toThrow(/likelyCauses|firstStep/);
  });

  it('backs off and retries on rate limits and server errors', async () => {
    const gen = vi
      .fn<GenerateFn>()
      .mockRejectedValueOnce(new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED'))
      .mockRejectedValueOnce(new Error('[503 Service Unavailable] The model is overloaded.'))
      .mockResolvedValueOnce(reply(index));
    const sleep = vi.fn(async (_ms: number) => {});
    const progress: string[] = [];
    await expect(compileIndex(gen, pdf, meta, { sleep, onProgress: (m) => progress.push(m) })).resolves.toMatchObject({ brand: 'Acme' });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([20_000, 40_000]);
    expect(progress.filter((m) => /retrying/.test(m))).toEqual(['Rate limited; retrying in 20 s…', 'Model service error; retrying in 40 s…']);
  });

  it('does not retry ordinary errors, and does not mistake "generateContent" for a rate limit', async () => {
    expect(retryableReason(new Error('Error fetching from .../models/x:generateContent: [400 Bad Request] invalid schema'))).toBeNull();
    expect(retryableReason(new Error('[500 Internal Server Error] INTERNAL'))).toBe('service error');
    const gen = vi.fn<GenerateFn>().mockRejectedValue(new Error('[400 Bad Request] invalid argument'));
    await expect(compileIndex(gen, pdf, meta, { sleep: async () => {} })).rejects.toThrow(/400/);
    expect(gen).toHaveBeenCalledTimes(1);
  });
});

describe('assembly helpers', () => {
  it('drops step page refs that repeat the fault code page', () => {
    const pack = assemblePack({ index, codes: { E3: tree() }, source: { title: 't', url: 'https://example.com/x.pdf', pages: '10-12' } });
    expect(pack.faultCodes[0]!.pages).toBe('11');
    expect(pack.steps['CE3-S1']!.pages).toBeUndefined();
  });

  it('prefixes step ids per fault code so trees never collide', () => {
    expect(codePrefix('E3')).toBe('CE3');
    expect(codePrefix('3 flashes')).toBe('C3flashes');
    const { firstStep, steps } = stepsForCode('59', tree());
    expect(firstStep).toBe('C59-S1');
    expect(Object.keys(steps)).toEqual(['C59-S1', 'C59-S2', 'C59-S3']);
    expect(steps['C59-S1']!.next).toEqual({ runs: 'C59-S2', 'does not run': 'C59-S3' });
  });
});

describe('page ranges', () => {
  it('parses and formats ranges', () => {
    expect(parsePageRange('42-44, 46,45', 52)).toEqual([42, 43, 44, 45, 46]);
    expect(formatPages([42, 43, 44, 46, 50, 51])).toBe('42-44, 46, 50-51');
  });

  it('rejects ranges outside the document', () => {
    expect(() => parsePageRange('50-60', 52)).toThrow(/outside pages 1-52/);
    expect(() => parsePageRange('abc', 52)).toThrow(/not a page/);
  });
});
