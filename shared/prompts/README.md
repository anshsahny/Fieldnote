# Prompts (single source of truth)

Every prompt used by either platform lives here as one Markdown file per prompt. The web app
imports these files at build time; the iOS app bundles a copy at build time. Don't duplicate
prompt text in code.

## File format

```markdown
---
name: diagnosis          # matches the Remote Config key prompt_version_<name>
version: 1               # bump on every change; keep in sync with Remote Config
platforms: [ios]         # where it runs
mode: prefer_on_device   # default routing (Remote Config route_<feature> can override)
max_tokens: 1500         # budget for the assembled on-device request
---

<prompt text>
```

Planned prompts: `compile`, `triage`, `job_summary`, `nameplate`, `diagnosis`, `report`
(see `remoteconfig.template.json` → `prompts`).
