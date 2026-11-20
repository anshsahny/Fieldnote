# Firebase Agent Skills (used with Claude Code)

Fieldnote is built with Claude Code plus the official **Firebase agent skills**
([docs](https://firebase.google.com/docs/ai-assistance/agent-skills), [GitHub](https://github.com/firebase/agent-skills)).

## Install (reproducible, project scope)

Installed on 2026-11-19 with the commands from the Firebase docs, at **project scope**, so the
choice is recorded in [`.claude/settings.json`](../.claude/settings.json) and anyone who opens this
repo in Claude Code gets the same plugin:

```bash
claude plugin marketplace add firebase/agent-skills --scope project
claude plugin install firebase@firebase --scope project
```

Update later with `claude plugin marketplace update firebase`.

Installed: plugin **`firebase@firebase` v1.1.0**, which bundles 14 skills and the **Firebase MCP
server** (`firebase-tools mcp`).

| Skill | What it covers | Relevant to Fieldnote |
|---|---|---|
| `firebase-ai-logic-basics` | AI Logic setup, multimodal, structured output, hybrid on-device, App Check, model names via Remote Config | **Core**: P0 checks, P1 spikes, P2 compiler |
| `firebase-remote-config-basics` | Template management, feature flags, SDK usage | Routing flags, model names, prompt versions |
| `firebase-security-rules-auditor` | Red-team audit of Firestore/Storage rules | Audited `firestore.rules` in P0; rerun in P2/P6 |
| `firestore-rules-creation` | Writing Firestore rules | P2 rules + emulator tests |
| `firebase-firestore` | Firestore provisioning, rules, SDK data ops | P3/P4 offline sync |
| `firebase-auth-basics` | Auth sign-in flows, auth-based rules | P5 demo login |
| `firebase-hosting-basics` | Static/SPA deploys to Hosting | P5 hosted console |
| `firebase-basics` | First-time setup, CLI workflows | P0 |
| `xcode-project-setup` | Safely editing `.pbxproj`, adding SPM packages | Not needed: we generate the project with XcodeGen |
| `firebase-local-env-setup`\*, `firebase-crashlytics`, `firebase-analytics`, `firebase-app-hosting-basics`, `firebase-data-connect-basics`, `extension-to-functions-codebase` | Other products | Not used |

\* Listed in the Firebase docs; this plugin version ships the 14 skill folders shown in the table.

## What the skills were actually used for (log)

Only real uses are listed here; this section feeds the README credit and the Devpost write-up.

| Date | Phase | Skill | Use and outcome |
|---|---|---|---|
| 2026-11-19 | P0 | `firebase-security-rules-auditor` | Ran its red-team checklist on the first `firestore.rules`. Found and fixed: (1) **update bypass**, any tech could rewrite any job field (reassign, change address) → techs now limited to `status`/`equipment`/`updatedAt`; (2) **type safety**, ledger events weren't typed → `validInferenceEvent()` checks types, enums, and sizes. Deferred to P2/P4 (shapes not final yet): size limits and schemas for `reports` and `sessions`. |
| 2026-11-19 | P0 | `firebase-ai-logic-basics` | (a) Confirmed the "Gemini 3+ only, check the models page" rule behind our model choice. (b) Its iOS reference names the `AppCheckDebugToken` env var; we checked the SDK source (AppCheckCore in firebase-ios-sdk 13.2.0), which reads `AppCheckDebugToken` then `FIRAAppCheckDebugToken`, and aligned our bootstrap to it. (c) Flagged **limited-use App Check tokens** (`useLimitedUseAppCheckTokens: true`) for replay-protected models; carried into P1. |

| 2026-11-20 | P1 | `firebase-ai-logic-basics` (loaded as a skill) | Guided the hybrid spikes: current model names, App Check debug-token handling, limited-use App Check tokens (`useLimitedUseAppCheckTokens: true` on web and iOS), and the web hybrid patterns (`InferenceMode`, `initializeDeviceModel`, inline image parts). Combined with the SDK source, this is how we found that firebase-ios-sdk 13.0.0 removed `HybridModel`, which led to the 12.19.3 pin. |
| 2026-11-20 | P1 | Firebase MCP server (`firestore_add_document`, `firestore_get_document`) | Seeded the demo `users/{uid}` profile the rules require, and checked server-side that the offline Firestore write really reached the server after the app was killed and relaunched. |

Note: plugins load when a Claude Code session starts, so in the P0 session these skills were read
directly from the installed plugin; from P1 on they load automatically.
