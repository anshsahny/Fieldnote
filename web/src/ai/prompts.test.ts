import { describe, expect, it } from 'vitest';
import { parsePrompt, PromptError, PROMPTS, renderPrompt } from './prompts';
import { TEMPLATE_DEFAULTS } from './config';
import { FEATURES } from './routing';

const sample = `---
name: demo
version: 3
platforms: [ios, web]
route: route_demo   # trailing comment
max_tokens: 500
---

## System

Be precise.

## User

Step: {{step}}
Note: {{note}} / again {{ step }}
`;

describe('parsePrompt', () => {
  it('reads frontmatter, sections, and placeholders', () => {
    const t = parsePrompt(sample);
    expect(t.meta).toEqual({ name: 'demo', version: 3, platforms: ['ios', 'web'], route: 'route_demo', max_tokens: 500 });
    expect(t.system).toBe('Be precise.');
    expect(t.variables).toEqual(['step', 'note']);
  });

  it('rejects a prompt without frontmatter or sections', () => {
    expect(() => parsePrompt('## System\nx\n## User\ny')).toThrow(PromptError);
    expect(() => parsePrompt('---\nname: x\nversion: 1\n---\n## System\nonly system')).toThrow(/User/);
    expect(() => parsePrompt('---\nname: x\n---\n## System\na\n## User\nb')).toThrow(/version/);
  });
});

describe('renderPrompt', () => {
  const t = parsePrompt(sample);

  it('fills every placeholder, including repeats', () => {
    expect(renderPrompt(t, { step: 'S1', note: 'hums' }).user).toBe('Step: S1\nNote: hums / again S1');
  });

  it('refuses missing or unknown variables', () => {
    expect(() => renderPrompt(t, { step: 'S1' })).toThrow(/missing: note/);
    expect(() => renderPrompt(t, { step: 'S1', note: 'x', extra: 'y' })).toThrow(/extra/);
  });
});

describe('shared/prompts', () => {
  it('every bundled prompt parses and declares a known Remote Config route', () => {
    const routeKeys = FEATURES.map((f) => `route_${f}`);
    for (const [key, p] of Object.entries(PROMPTS)) {
      expect(p.meta.name).toBe(key);
      expect(p.meta.version).toBeGreaterThanOrEqual(1);
      expect(routeKeys).toContain(p.meta.route);
    }
    expect(PROMPTS.diagnosis.variables).toEqual(['step_instruction', 'allowed_choices', 'history', 'note']);
  });

  it('every prompt version matches its Remote Config prompt_version_<name> default', () => {
    for (const [key, p] of Object.entries(PROMPTS)) {
      const configured = TEMPLATE_DEFAULTS[`prompt_version_${key}`];
      if (configured === undefined) continue; // compile_index/compile_code share prompt_version_compile
      expect(`${key}@${p.meta.version}`).toBe(`${key}@${configured}`);
    }
  });
});
