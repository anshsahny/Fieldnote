import { describe, expect, it } from 'vitest';
import { aiConfigFrom, defaultsFromTemplate, TEMPLATE_DEFAULTS } from './config';
import { FEATURES, routeKey } from './routing';

describe('defaultsFromTemplate', () => {
  it('flattens top-level and grouped parameters', () => {
    const d = defaultsFromTemplate({
      parameters: { a: { defaultValue: { value: '1' } } },
      parameterGroups: { g: { parameters: { b: { defaultValue: { value: 'x' } } } } },
    });
    expect(d).toEqual({ a: '1', b: 'x' });
  });

  it('the deployed template defines a valid route for every feature', () => {
    const cfg = aiConfigFrom(() => undefined, 'defaults');
    for (const f of FEATURES) {
      expect(TEMPLATE_DEFAULTS[routeKey(f)], routeKey(f)).toBeDefined();
      expect(cfg.routes[f]).toBe(TEMPLATE_DEFAULTS[routeKey(f)]);
    }
    expect(cfg.cloudModelFast).toMatch(/^gemini-/);
    expect(cfg.cloudModelCompile).toMatch(/^gemini-/);
  });
});

describe('aiConfigFrom', () => {
  it('prefers Remote Config values and keeps defaults for blanks and junk', () => {
    const cfg = aiConfigFrom(
      (k) => ({ cloud_model_fast: 'gemini-3.5-flash-lite', ondevice_max_tokens: 'lots', route_report: '' })[k],
      'remote',
    );
    expect(cfg.cloudModelFast).toBe('gemini-3.5-flash-lite');
    expect(cfg.ondeviceMaxTokens).toBe(Number(TEMPLATE_DEFAULTS.ondevice_max_tokens));
    expect(cfg.routes.report).toBe(TEMPLATE_DEFAULTS.route_report);
    expect(cfg.promptVersions.diagnosis).toBe(TEMPLATE_DEFAULTS.prompt_version_diagnosis);
  });
});
