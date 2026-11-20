import type { GenerativeModel, Part } from 'firebase/ai';
import { getAIInstance } from '../../ai/firebase';
import type { AIConfig } from '../../ai/config';
import { diagnosisSchema, TRIAGE_SCHEMA, validateDecision } from '../../ai/diagnosis';
import { makeModel, runTimed, type Source } from '../../ai/hybrid';
import { PROMPTS, renderPrompt } from '../../ai/prompts';
import type { Route } from '../../ai/routing';
import { DIAGNOSIS_CASE, SAMPLE_JOB, TRIAGE_MESSAGE } from './fixtures';

export type SpikeId = 'text' | 'image' | 'structured' | 'structured_image';

export interface SpikeRow {
  id: SpikeId;
  label: string;
  mode: Route;
  source: Source | 'ERROR';
  latencyMs: number | null;
  check: string;
  pass: boolean;
  output: string;
}

export const SPIKES: { id: SpikeId; label: string }[] = [
  { id: 'text', label: 'Text → text (job summary)' },
  { id: 'image', label: 'Text + image → text (photo triage)' },
  { id: 'structured', label: 'Structured JSON (diagnosis choice)' },
  { id: 'structured_image', label: 'Text + image → JSON (triage)' },
];

export interface SpikeContext {
  config: AIConfig;
  /** undefined = use the Remote Config route for the feature. */
  mode?: Route;
  image: Part;
  onProgress?: (message: string) => void;
}

async function prepare(model: GenerativeModel, mode: Route, ctx: SpikeContext) {
  if (mode === 'only_in_cloud') return;
  // Must follow a user gesture (the Run button). Resolves quickly when the model is downloaded.
  await model.initializeDeviceModel((p) => ctx.onProgress?.(`On-device model download ${Math.round(p * 100)}%`));
}

export async function runSpike(id: SpikeId, ctx: SpikeContext): Promise<SpikeRow> {
  const label = SPIKES.find((s) => s.id === id)!.label;
  const ai = getAIInstance();
  const feature = id === 'structured' ? 'diagnosis' : id === 'text' ? 'job_summary' : 'triage';
  const mode = ctx.mode ?? ctx.config.routes[feature];

  try {
    if (id === 'text') {
      const p = renderPrompt(PROMPTS.job_summary, { job_json: JSON.stringify(SAMPLE_JOB, null, 2) });
      const model = makeModel(ai, { feature, config: ctx.config, mode, systemInstruction: p.system });
      await prepare(model, mode, ctx);
      const r = await runTimed(model, p.user);
      const pass = r.text.trim().length > 20;
      return { id, label, mode, ...r, check: pass ? 'non-empty summary' : 'empty output', pass, output: r.text };
    }

    if (id === 'image' || id === 'structured_image') {
      const p = renderPrompt(PROMPTS.triage, { customer_message: TRIAGE_MESSAGE });
      const schema = id === 'structured_image' ? TRIAGE_SCHEMA : undefined;
      const model = makeModel(ai, { feature, config: ctx.config, mode, image: true, schema, systemInstruction: p.system });
      await prepare(model, mode, ctx);
      const r = await runTimed(model, [p.user, ctx.image]);
      if (!schema) {
        const pass = /3|three/i.test(r.text);
        return { id, label, mode, ...r, check: pass ? 'mentions the 3-flash code' : 'missed the 3-flash code', pass, output: r.text };
      }
      try {
        const json = JSON.parse(r.text) as Record<string, unknown>;
        const pass = typeof json.likelyFault === 'string' && Array.isArray(json.partsToBring);
        return { id, label, mode, ...r, check: pass ? 'valid triage JSON' : 'JSON missing fields', pass, output: r.text };
      } catch {
        return { id, label, mode, ...r, check: 'invalid JSON', pass: false, output: r.text };
      }
    }

    // structured diagnosis
    const p = renderPrompt(PROMPTS.diagnosis, {
      step_instruction: DIAGNOSIS_CASE.step_instruction,
      allowed_choices: DIAGNOSIS_CASE.allowed.join(' | '),
      history: DIAGNOSIS_CASE.history,
      note: DIAGNOSIS_CASE.note,
    });
    const model = makeModel(ai, {
      feature,
      config: ctx.config,
      mode,
      schema: diagnosisSchema(DIAGNOSIS_CASE.allowed),
      systemInstruction: p.system,
    });
    await prepare(model, mode, ctx);
    const r = await runTimed(model, p.user);
    const v = validateDecision(r.text, DIAGNOSIS_CASE.allowed);
    const pass = v.ok && v.decision.choice === DIAGNOSIS_CASE.expected;
    const check = v.ok ? `choice="${v.decision.choice}" conf=${v.decision.confidence}` : v.error;
    return { id, label, mode, ...r, check, pass, output: r.text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { id, label, mode, source: 'ERROR', latencyMs: null, check: 'threw', pass: false, output: message };
  }
}

/** Reads a same-origin image URL into an inline-data Part (JPEG/PNG only for on-device). */
export async function imagePartFromUrl(url: string): Promise<Part> {
  const blob = await (await fetch(url)).blob();
  return imagePartFromBlob(blob);
}

export function imagePartFromBlob(blob: Blob): Promise<Part> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => {
      const data = String(reader.result).split(',')[1] ?? '';
      resolve({ type: 'inlineData', inlineData: { data, mimeType: blob.type || 'image/jpeg' } });
    };
    reader.readAsDataURL(blob);
  });
}
