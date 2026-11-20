import {
  getGenerativeModel,
  InferenceSource,
  type AI,
  type GenerateContentRequest,
  type GenerativeModel,
  type HybridParams,
  type Part,
} from 'firebase/ai';
import type { AIConfig } from './config';
import { cloudModelFor, type Feature, type Route } from './routing';

export interface ModelOptions {
  feature: Feature;
  config: AIConfig;
  /** Overrides the Remote Config route (spike page / tests only). */
  mode?: Route;
  /** Inputs the on-device session must accept. Text is always included. */
  image?: boolean;
  systemInstruction: string;
  /** JSON schema for structured output; applied to both the cloud and on-device paths. */
  schema?: Record<string, unknown>;
}

/** Pure: builds the HybridParams for getGenerativeModel from Remote Config + feature needs. */
export function buildModelParams(opts: ModelOptions): HybridParams {
  const mode = opts.mode ?? opts.config.routes[opts.feature];
  const model = cloudModelFor(opts.feature, {
    fast: opts.config.cloudModelFast,
    compile: opts.config.cloudModelCompile,
  });
  const expectedInputs: { type: 'text' | 'image'; languages?: string[] }[] = [
    { type: 'text', languages: ['en'] },
  ];
  if (opts.image) expectedInputs.push({ type: 'image' });

  return {
    mode,
    inCloudParams: {
      model,
      systemInstruction: opts.systemInstruction,
      ...(opts.schema && {
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: opts.schema as never,
        },
      }),
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs,
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        initialPrompts: [{ role: 'system', content: [{ type: 'text', value: opts.systemInstruction }] }],
      } as never,
      ...(opts.schema && { promptOptions: { responseConstraint: opts.schema } }),
    },
  };
}

export function makeModel(ai: AI, opts: ModelOptions): GenerativeModel {
  return getGenerativeModel(ai, buildModelParams(opts));
}

export type Source = 'ON_DEVICE' | 'IN_CLOUD' | 'UNKNOWN';

export interface RunResult {
  text: string;
  source: Source;
  latencyMs: number;
}

export function toSource(value: unknown): Source {
  if (value === InferenceSource.ON_DEVICE) return 'ON_DEVICE';
  if (value === InferenceSource.IN_CLOUD) return 'IN_CLOUD';
  return 'UNKNOWN';
}

/** One generateContent call, timed, with the SDK-reported inference source. */
export async function runTimed(
  model: GenerativeModel,
  request: string | (string | Part)[] | GenerateContentRequest,
  now: () => number = () => performance.now(),
): Promise<RunResult> {
  const start = now();
  const result = await model.generateContent(request);
  const latencyMs = Math.round(now() - start);
  return { text: result.response.text(), source: toSource(result.response.inferenceSource), latencyMs };
}
