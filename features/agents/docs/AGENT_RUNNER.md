# AGENT_RUNNER.md

**Status:** `active`
**Tier:** 1 (sub-feature of `features/agents/`)
**Last updated:** `2026-07-18`

> Read [`features/agents/FEATURE.md`](../FEATURE.md) first. This doc drills into the Runner surface specifically.

---

## Purpose

The Runner is the test track for an already-saved agent definition. It is **the same runtime as Chat**, with observability turned on and the agent marked read-only. Unlike the Builder, the Runner invocation sends **only the agent ID + variable/context/user-input values** — the server hydrates the definition from cache. This is the canonical payload shape that Chat, Shortcuts, and Apps also use.

---

## Entry point

**Route**
- `app/(core)/agents/[id]/run/page.tsx`
- `app/(admin)/administration/system-agents/agents/[id]/run/page.tsx` — system-agent admin runner; reuses the same header, shell route menu, and execution surface with admin-aware links

**API endpoints**
- First turn: `POST /ai/agents/{id}` — `apiEndpointMode: "agent"`, `origin: "manual"` or `"test"`
- Subsequent turns: `POST /ai/conversations/{conversationId}`

**Key thunks**
- Goes through the unified `launchConversation` thunk (same as every consumer surface).
- `execute-instance.thunk.ts` handles body assembly + fetch + stream parsing.

---

## The payload contract (contrasted with Builder)

| Payload field | Builder | Runner / Chat / Shortcut / App |
|---|---|---|
| Agent definition | **Full snapshot inline** | ID only |
| System prompt | Sent from client | Never sent from client |
| Model + settings | Sent from client | ID-only (server owns, overridable) |
| Tools | Sent from client | ID-only (server owns) |
| Variables | Sent | Sent |
| Context | Sent | Sent |
| User input | Sent | Sent |
| `config_overrides` | N/A (defs are inline) | Optional — permitted overrides only |
| Advanced settings (`maxIterations`, etc.) | `builder.*` | **Not applicable** |

The Runner invocation is a thin envelope: "here's the agent ID, here are the form values, run it." The server resolves everything else.

---

## Version pinning in the Runner

The Runner defaults to the current version of the agent (`engine.isVersion = false`), but any past version can be pinned for comparison. This is the Runner's exclusive superpower among consumer surfaces — Chat always uses current; Shortcuts/Apps always pin a specific version; only the Runner offers ad-hoc version pinning for testing.

See [`AGENT_VERSIONING.md`](./AGENT_VERSIONING.md) for the full pin-by-version contract.

---

## What engineers see that end users don't

- Server-side logs
- Stream debugging (every NDJSON event, expanded)
- Token counts and cost per turn
- Tool invocations and their full inputs/outputs (not redacted)
- Raw model settings in effect after override resolution

These are overlays on the same runtime Chat uses — no separate code path, just additional UI wired to the same `activeRequests` stream state.

---

## Key flows

### Flow 1 — Standard test turn

1. Engineer loads `/agents/[id]/run` — `agentDefinition` slice hydrated, Runner UI renders variable inputs per the agent's declared variables.
2. Engineer fills variable values (or loads a scope preset), types a message, clicks send.
3. `launchConversation` dispatched with `routing.apiEndpointMode: "agent"`, `origin: "manual"`.
4. `assembleRequest(state, instanceId)` builds the minimal body — agent ID, variables, context, user input, optional config overrides.
5. Fetch → `POST /ai/agents/{id}`.
6. Stream processed through standard pipeline ([`STREAMING_SYSTEM.md`](./STREAMING_SYSTEM.md)).
7. Subsequent turns → `POST /ai/conversations/{conversationId}`.

### Flow 2 — Pin a past version

1. Engineer opens version selector, picks `v3` (current is `v7`).
2. Invocation is dispatched with `engine.isVersion = true` and `agentVersionId` pinned.
3. Server fetches that specific version row and runs it exactly as it was when saved — including tool list, variable definitions, system prompt of the time.
4. Runner flags the pinned version in the UI so the engineer doesn't forget they're not on current.

### Flow 3 — Scenario sweep

1. Engineer saves the current form values as a scenario.
2. Loads scenario after scenario, firing each against the same agent to find edge cases.
3. The agent definition is untouched; only inputs vary. This is the mirror-image of the Builder, which fixes inputs and varies the definition.

---

## Invariants & gotchas

- **Runner and Chat share the runtime.** If you change behavior in Runner, you change Chat. This is a feature, not a bug — the test track must match the production surface.
- **The Runner cannot modify the agent.** The agent definition is read-only while the Runner is open. To edit, go to the Builder.
- **Overrides are permission-gated.** The engineer decides at Builder time whether the consumer (Runner, Chat, Shortcut) can override model settings. If permission is off, the Runner cannot pass `config_overrides`.
- **Version pin is Runner-only.** Chat always uses current; Shortcuts/Apps pin at definition time. Only the Runner lets you pick ad-hoc.
- **Observability overlays are purely visual.** They read from the same `activeRequests` slice that Chat reads from. Do not add new stream behavior behind an observability flag; put it in the core streaming pipeline or not at all.
- **Do not send agent definition fields in a Runner invocation.** They will be ignored and may trigger schema warnings in the future.

---

## Related

- [`AGENT_BUILDER.md`](./AGENT_BUILDER.md) — the sibling surface; read both together
- [`AGENT_VERSIONING.md`](./AGENT_VERSIONING.md) — version pin semantics
- [`AGENT_INVOCATION_LIFECYCLE.md`](./AGENT_INVOCATION_LIFECYCLE.md) — endpoint routing
- [`STREAMING_SYSTEM.md`](./STREAMING_SYSTEM.md) — stream event pipeline
- `features/conversation/FEATURE.md` — the Chat surface (same runtime)

---

## Change log

- `2026-07-18` — codex: Added full shell parity for the system-agent admin runner, including the route-aware run-history sidebar and admin-preserving history links.
- `2026-04-22` — claude: initial doc. Extracted from `agent-system-mental-model.md` §3 and related.

---

> **Keep-docs-live:** any change to the Runner payload shape, endpoint routing, or observability overlay must update this doc AND `AGENT_INVOCATION_LIFECYCLE.md`.
