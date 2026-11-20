import type { FirebaseApp } from 'firebase/app';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import template from '../../../remoteconfig.template.json';
import { FEATURES, parseRoute, routeKey, type Feature, type Route } from './routing';

interface TemplateParam {
  defaultValue?: { value?: string };
  valueType?: string;
}
interface RemoteConfigTemplate {
  parameters?: Record<string, TemplateParam>;
  parameterGroups?: Record<string, { parameters?: Record<string, TemplateParam> }>;
}

/** Flattens remoteconfig.template.json (the deployed template) into in-app defaults. */
export function defaultsFromTemplate(t: RemoteConfigTemplate): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (params?: Record<string, TemplateParam>) => {
    for (const [key, p] of Object.entries(params ?? {})) {
      if (p.defaultValue?.value !== undefined) out[key] = p.defaultValue.value;
    }
  };
  add(t.parameters);
  for (const group of Object.values(t.parameterGroups ?? {})) add(group.parameters);
  return out;
}

export const TEMPLATE_DEFAULTS = defaultsFromTemplate(template as RemoteConfigTemplate);

export interface AIConfig {
  routes: Record<Feature, Route>;
  cloudModelFast: string;
  cloudModelCompile: string;
  ondeviceMaxTokens: number;
  confidenceThreshold: number;
  promptVersions: Record<string, string>;
  /** Where the values came from on this load. */
  origin: 'remote' | 'defaults';
}

/** Pure mapping from a key→string lookup to a validated config. */
export function aiConfigFrom(
  get: (key: string) => string | undefined,
  origin: AIConfig['origin'],
  defaults: Record<string, string> = TEMPLATE_DEFAULTS,
): AIConfig {
  const str = (key: string) => {
    const v = get(key)?.trim();
    return v ? v : (defaults[key] ?? '');
  };
  const num = (key: string) => {
    const n = Number(str(key));
    return Number.isFinite(n) ? n : Number(defaults[key]);
  };
  const routes = Object.fromEntries(
    FEATURES.map((f) => {
      const fallback = parseRoute(defaults[routeKey(f)], 'prefer_in_cloud');
      return [f, parseRoute(get(routeKey(f)), fallback)];
    }),
  ) as Record<Feature, Route>;
  const promptVersions = Object.fromEntries(
    Object.keys(defaults)
      .filter((k) => k.startsWith('prompt_version_'))
      .map((k) => [k.replace('prompt_version_', ''), str(k)]),
  );
  return {
    routes,
    cloudModelFast: str('cloud_model_fast'),
    cloudModelCompile: str('cloud_model_compile'),
    ondeviceMaxTokens: num('ondevice_max_tokens'),
    confidenceThreshold: num('diagnosis_confidence_threshold'),
    promptVersions,
    origin,
  };
}

/** Loads Remote Config with template defaults; never throws (falls back to defaults). */
export async function loadAIConfig(app: FirebaseApp): Promise<AIConfig> {
  const rc = getRemoteConfig(app);
  rc.defaultConfig = TEMPLATE_DEFAULTS;
  rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 30_000 : 10 * 60_000;
  let origin: AIConfig['origin'] = 'defaults';
  try {
    await fetchAndActivate(rc);
    origin = 'remote';
  } catch {
    origin = 'defaults';
  }
  return aiConfigFrom((key) => getValue(rc, key).asString(), origin);
}
