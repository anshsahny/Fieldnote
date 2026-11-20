import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HybridParams } from 'firebase/ai';

vi.mock('firebase/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/ai')>();
  return { ...actual, getGenerativeModel: vi.fn(() => ({ fake: true })) };
});

import { getGenerativeModel, InferenceSource, type AI } from 'firebase/ai';
import { aiConfigFrom } from './config';
import { buildModelParams, makeModel, runTimed, toSource } from './hybrid';
import { diagnosisSchema } from './diagnosis';

const ai = {} as AI;
const rc = (overrides: Record<string, string>) =>
  aiConfigFrom((key) => overrides[key], 'remote', {
    cloud_model_fast: 'gemini-3.8-flash',
    cloud_model_compile: 'gemini-4-hydrogen',
    route_compile: 'only_in_cloud',
    route_triage: 'prefer_on_device',
    route_job_summary: 'prefer_on_device',
    route_diagnosis: 'prefer_on_device',
    route_report: 'prefer_in_cloud',
    route_nameplate: 'prefer_on_device',
    route_ledger_insights: 'prefer_in_cloud',
    ondevice_max_tokens: '3000',
    diagnosis_confidence_threshold: '0.6',
  });

function lastParams(): HybridParams {
  const calls = vi.mocked(getGenerativeModel).mock.calls;
  return calls[calls.length - 1]![1] as HybridParams;
}

describe('makeModel: Remote Config route → InferenceMode', () => {
  beforeEach(() => vi.mocked(getGenerativeModel).mockClear());

  it.each([
    ['prefer_on_device', 'prefer_on_device'],
    ['only_on_device', 'only_on_device'],
    ['prefer_in_cloud', 'prefer_in_cloud'],
    ['only_in_cloud', 'only_in_cloud'],
    [' PREFER_IN_CLOUD ', 'prefer_in_cloud'],
  ])('route_triage=%j → mode %s', (value, mode) => {
    makeModel(ai, { feature: 'triage', config: rc({ route_triage: value }), systemInstruction: 's' });
    expect(getGenerativeModel).toHaveBeenCalledWith(ai, expect.objectContaining({ mode }));
  });

  it('falls back to the template default when Remote Config sends garbage', () => {
    makeModel(ai, { feature: 'triage', config: rc({ route_triage: 'on_device_please' }), systemInstruction: 's' });
    expect(lastParams().mode).toBe('prefer_on_device');
  });

  it('lets the spike page override the route explicitly', () => {
    makeModel(ai, { feature: 'triage', config: rc({}), mode: 'only_in_cloud', systemInstruction: 's' });
    expect(lastParams().mode).toBe('only_in_cloud');
  });

  it('uses the compile model only for compile, the fast model otherwise', () => {
    makeModel(ai, { feature: 'compile', config: rc({}), systemInstruction: 's' });
    expect(lastParams().inCloudParams?.model).toBe('gemini-4-hydrogen');
    makeModel(ai, { feature: 'job_summary', config: rc({ cloud_model_fast: 'gemini-3.5-flash-lite' }), systemInstruction: 's' });
    expect(lastParams().inCloudParams?.model).toBe('gemini-3.5-flash-lite');
  });
});

describe('buildModelParams', () => {
  it('declares image input for the on-device session only when asked', () => {
    const withImage = buildModelParams({ feature: 'triage', config: rc({}), image: true, systemInstruction: 's' });
    const textOnly = buildModelParams({ feature: 'job_summary', config: rc({}), systemInstruction: 's' });
    const inputs = (p: HybridParams) =>
      (p.onDeviceParams?.createOptions as { expectedInputs: { type: string }[] }).expectedInputs.map((i) => i.type);
    expect(inputs(withImage)).toEqual(['text', 'image']);
    expect(inputs(textOnly)).toEqual(['text']);
  });

  it('applies a schema to both the cloud and the on-device path', () => {
    const schema = diagnosisSchema(['runs', 'does not run']);
    const p = buildModelParams({ feature: 'diagnosis', config: rc({}), schema, systemInstruction: 's' });
    expect(p.inCloudParams?.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: schema });
    expect(p.onDeviceParams?.promptOptions).toEqual({ responseConstraint: schema });
  });

  it('sends the system prompt to the cloud model and the on-device session', () => {
    const p = buildModelParams({ feature: 'job_summary', config: rc({}), systemInstruction: 'Be brief.' });
    expect(p.inCloudParams?.systemInstruction).toBe('Be brief.');
    expect(JSON.stringify(p.onDeviceParams?.createOptions)).toContain('Be brief.');
  });
});

describe('runTimed / toSource', () => {
  it('reports the SDK inference source and latency', async () => {
    const model = {
      generateContent: vi.fn(async () => ({
        response: { text: () => 'ok', inferenceSource: InferenceSource.ON_DEVICE },
      })),
    };
    let t = 1000;
    const result = await runTimed(model as never, 'hi', () => (t += 250));
    expect(result).toEqual({ text: 'ok', source: 'ON_DEVICE', latencyMs: 250 });
  });

  it('maps unknown sources to UNKNOWN', () => {
    expect(toSource(InferenceSource.IN_CLOUD)).toBe('IN_CLOUD');
    expect(toSource(undefined)).toBe('UNKNOWN');
  });
});
