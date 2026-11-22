import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { getDb } from '../firebase/client';
import type { Feature, Route } from './routing';

export interface InferenceEvent {
  /** status_check: the "Test the on-device model" button on /status. */
  feature: Feature | 'status_check';
  source: 'ON_DEVICE' | 'IN_CLOUD' | 'NONE';
  latencyMs: number;
  ok: boolean;
  promptTokensEst?: number;
  model?: string;
  mode?: Route;
}

/** Hybrid Ledger row: metadata only (never prompt or response content). Never throws. */
export async function logInferenceEvent(orgId: string, e: InferenceEvent): Promise<void> {
  try {
    await addDoc(collection(getDb(), 'orgs', orgId, 'inferenceEvents'), {
      feature: e.feature,
      platform: 'web',
      source: e.source,
      latencyMs: Math.max(0, Math.round(e.latencyMs)),
      ok: e.ok,
      ts: Timestamp.now(),
      ...(e.promptTokensEst !== undefined && { promptTokensEst: Math.round(e.promptTokensEst) }),
      ...(e.model && { model: e.model.slice(0, 128) }),
      ...(e.mode && { mode: e.mode }),
    });
  } catch (err) {
    console.warn('Ledger write failed', err);
  }
}
