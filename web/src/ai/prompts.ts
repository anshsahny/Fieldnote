// Parser/renderer for shared/prompts/*.md (same rules as ios/Fieldnote/AI/PromptTemplate.swift).
import diagnosisSource from '../../../shared/prompts/diagnosis.md?raw';
import jobSummarySource from '../../../shared/prompts/job_summary.md?raw';
import nameplateSource from '../../../shared/prompts/nameplate.md?raw';
import triageSource from '../../../shared/prompts/triage.md?raw';

export interface PromptMeta {
  name: string;
  version: number;
  platforms: string[];
  route?: string;
  max_tokens?: number;
}

export interface PromptTemplate {
  meta: PromptMeta;
  system: string;
  user: string;
  /** Placeholder names used in the user section, in first-seen order. */
  variables: string[];
}

export interface RenderedPrompt {
  name: string;
  version: number;
  system: string;
  user: string;
}

export class PromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptError';
  }
}

const PLACEHOLDER = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g;

function parseScalar(raw: string): string | number | string[] {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value.replace(/^["']|["']$/g, '');
}

export function parsePrompt(source: string): PromptTemplate {
  const text = source.replace(/\r\n/g, '\n');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) throw new PromptError('Prompt is missing its --- frontmatter --- header');

  const meta: Record<string, unknown> = {};
  for (const line of fm[1]!.split('\n')) {
    const m = line.match(/^([a-z_]+)\s*:\s*(.*)$/);
    if (m) meta[m[1]!] = parseScalar(m[2]!.replace(/\s+#.*$/, ''));
  }
  if (typeof meta.name !== 'string' || !meta.name) throw new PromptError('Frontmatter needs "name"');
  if (typeof meta.version !== 'number') throw new PromptError(`Prompt "${meta.name}" needs a numeric "version"`);

  const body = text.slice(fm[0].length);
  const sections = new Map<string, string>();
  const headings = [...body.matchAll(/^## (System|User)\s*$/gm)];
  headings.forEach((h, i) => {
    const start = h.index! + h[0].length;
    const end = i + 1 < headings.length ? headings[i + 1]!.index! : body.length;
    sections.set(h[1]!, body.slice(start, end).trim());
  });
  const system = sections.get('System');
  const user = sections.get('User');
  if (!system || !user) throw new PromptError(`Prompt "${meta.name}" needs "## System" and "## User" sections`);

  const variables = [...new Set([...user.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
  return {
    meta: {
      name: meta.name,
      version: meta.version,
      platforms: Array.isArray(meta.platforms) ? (meta.platforms as string[]) : [],
      route: typeof meta.route === 'string' ? meta.route : undefined,
      max_tokens: typeof meta.max_tokens === 'number' ? meta.max_tokens : undefined,
    },
    system,
    user,
    variables,
  };
}

export function renderPrompt(template: PromptTemplate, vars: Record<string, string>): RenderedPrompt {
  const missing = template.variables.filter((v) => !(v in vars));
  if (missing.length) throw new PromptError(`Prompt "${template.meta.name}" is missing: ${missing.join(', ')}`);
  const unknown = Object.keys(vars).filter((v) => !template.variables.includes(v));
  if (unknown.length) throw new PromptError(`Prompt "${template.meta.name}" has no placeholder for: ${unknown.join(', ')}`);
  return {
    name: template.meta.name,
    version: template.meta.version,
    system: template.system,
    user: template.user.replace(PLACEHOLDER, (_, name: string) => vars[name]!),
  };
}

/** The bundled prompts, parsed once. Throws at import time if a prompt file is malformed. */
export const PROMPTS = {
  diagnosis: parsePrompt(diagnosisSource),
  job_summary: parsePrompt(jobSummarySource),
  nameplate: parsePrompt(nameplateSource),
  triage: parsePrompt(triageSource),
} as const;
