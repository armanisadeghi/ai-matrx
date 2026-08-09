---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
vision: [features/agents/docs/AGENT_SETS.md, features/agents/docs/AGENT_SETS_ROADMAP.md]
---

# Agent Sets — Runtime Delegation

Execution half of Agent Sets. System of record: `features/agents/docs/AGENT_SETS.md` (+ `AGENT_SETS_ROADMAP.md` for Phase 2+). The sibling authoring handoff (sync/inspect) finished and was deleted 2026-08-08.

## Done (compressed)

- **Delegation E2E-VERIFIED on production 2026-08-08** (a throwaway 2-member set via the product RPCs): members project as `custom_tool_N` tools (dry-run count tracks membership), turn 1 delegated in a nested `sub_agent` child run with structured output, turn 2 (`/conversations/{id}`) re-injected members and used the other specialist on request; persistence + cost spine confirmed in `chat.*`. Server contract details: `aidream/aidream/services/agent_sets/FEATURE.md`.
- **Live member highlight BUILT** (mount model (a): run panel embedded in the builder; canvas lights up in place). Mechanism, files, and selectors documented in `AGENT_SETS.md` "Runtime delegation". `chat.conversation.initial_agent_id` mapping verified against live child rows.
- Grid orchestrator hub tile · shared-member batch hydration · supervisor prompt on generated orchestrators · Run entries — all shipped (see `AGENT_SETS.md`).

## Remaining work

1. **Live browser verification of the canvas highlight.** Not yet run in a real browser. Test: `/agents/sets/<orchestratorId>` on desktop → Run (opens the embedded panel) → send a delegating message → member nodes pulse while running, emerald when done; turn 2 resets rings. Known nuance: fork/retry inside the embedded panel navigates to the full runner route.
2. **Intermittent production 502s (~10% of `/api/ai/agents/*` requests, Cloudflare-served)** — root cause of the historical "headless empty run" bug; masked by the describer's 3× retry but hits every retry-less consumer. Tracked in `aidream/FOUND_DEFECTS.md` (2026-08-08 entry); needs an infra session.
3. Phase 2+ (pipelines/DAG, input mapping, editable edges) and Phase 3 hardening (dangling-member GC, cycle prevention, versioned runs, cross-org auth) — see `AGENT_SETS_ROADMAP.md`.
