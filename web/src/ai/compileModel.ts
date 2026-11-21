import type { AIConfig } from './config';
import { getAIInstance } from './firebase';
import { makeModel } from './hybrid';
import type { GenerateFn } from '../fixpack/compiler/compile';

/** Cloud generate function for the compiler: route_compile (only_in_cloud) + cloud_model_compile. */
export function makeCompileGenerate(config: AIConfig): GenerateFn {
  return async ({ system, parts, schema }) => {
    const model = makeModel(getAIInstance(), { feature: 'compile', config, systemInstruction: system, schema });
    const start = performance.now();
    const result = await model.generateContent(parts);
    return {
      text: result.response.text(),
      latencyMs: Math.round(performance.now() - start),
      promptTokens: result.response.usageMetadata?.promptTokenCount,
      model: config.cloudModelCompile,
    };
  };
}
