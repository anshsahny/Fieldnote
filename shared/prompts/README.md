# Prompts (single source of truth)

Every prompt used by either platform lives here as one Markdown file per prompt. The web app
imports these files at build time; the iOS app bundles a copy at build time. Don't duplicate
prompt text in code.

## File format

```markdown
---
name: diagnosis          # matches the Remote Config key prompt_version_<name>
version: 1               # bump on every change; keep in sync with Remote Config
platforms: [ios, web]    # where it runs
route: route_diagnosis   # the Remote Config routing key for this feature
max_tokens: 1500         # budget for the assembled on-device request
---

## System

<system instructions>

## User

<user prompt with {{placeholders}}>
```

Rules both parsers enforce (`web/src/ai/prompts.ts`, `ios/Fieldnote/AI/PromptTemplate.swift`):
- Frontmatter must have `name` and `version`.
- `## System` and `## User` sections are required.
- `{{name}}` placeholders must all be supplied when rendering, and unknown variables are rejected.

Current prompts: `nameplate` (iOS), `diagnosis` (iOS + web), `triage` (web, text + image),
`job_summary` (web). Still to come: `compile` (P2) and `report` (P4).
