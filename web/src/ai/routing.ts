import { InferenceMode } from 'firebase/ai';

export const FEATURES = [
  'compile',
  'triage',
  'job_summary',
  'ledger_insights',
  'nameplate',
  'diagnosis',
  'report',
] as const;
export type Feature = (typeof FEATURES)[number];

export type Route = (typeof InferenceMode)[keyof typeof InferenceMode];
export const ROUTES = Object.values(InferenceMode) as Route[];

export const routeKey = (feature: Feature) => `route_${feature}` as const;

/** Strict parse of a Remote Config route value; anything unexpected falls back. */
export function parseRoute(value: unknown, fallback: Route): Route {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (ROUTES as string[]).includes(v) ? (v as Route) : fallback;
}

/** Which cloud model a feature uses (both names come from Remote Config). */
export function cloudModelFor(feature: Feature, models: { fast: string; compile: string }): string {
  return feature === 'compile' ? models.compile : models.fast;
}
