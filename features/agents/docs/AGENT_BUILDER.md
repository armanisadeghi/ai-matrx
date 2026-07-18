# AGENT_BUILDER.md

**Status:** `active`
**Tier:** 1 (sub-feature of `features/agents/`)
**Last updated:** `2026-04-22`

> Read [`features/agents/FEATURE.md`](../FEATURE.md) first. This doc drills into the Builder surface specifically.

---

## Purpose

The Builder is the forge where engineers craft an agent's identity — instructions, model, settings, tools, variables, context slots, permissions. **It is the only surface that ships the full agent definition in the API payload.** Every other surface (Runner, Chat, Shortcut, App) sends only the agent ID and lets the server hydrate the definition from cache.

Permanent content is configured separately under **Agent Resources**. The
Builder stores only the durable `resource → agent` association; execution reads
those associations server-side, so Runner, Chat, workflows, and agent-to-agent
calls receive the same resources without copying IDs into every payload.

This payload difference is the Builder's reason to exist: it lets engineers test an agent exactly as it will run, with zero dependence on server cache state.

---

## Entry points

**Route**
- `app/(authenticated)/agents/[id]/build/page.tsx`

**API endpoint**
- `POST /prompts` — `apiEndpointMode: "manual"`

**Key thunks & selectors**
- Builder routes through the same unified `launchConversation` thunk — the Builder invocation sets `routing.apiEndpointMode = "manual"` and carries a full agent definition snapshot in `builder.*`
- `features/agents/redux/agent-definition/` — master definition slice with field-level undo and dirty tracking

---

## What gets tuned here

- System prompt / instructions (including `useStructuredSystemInstruction` + `structuredInstruction`)
- Model choice + settings (temperature, thinking budget, token limits)
- Tool access — which tools are exposed to the agent
- Variable definitions — name, default UI component, help text, required/optional
- Context slot definitions — name, source hints, whether the slot is exposed to consumers
- Permissions — whether consumers may see or override model settings
- Advanced settings (`BuilderAdvancedSettings`): `debug`, `store`, `maxIterations`, `maxRetriesPerIteration`

These advanced settings travel on `ConversationInvocation.builder` — they are Builder-only and do not apply to Runner / Chat.

---

## Why the Builder payload is different

Every other surface hands the server a minimal payload:

```
POST /ai/agents/{id}
{ variables, scope, overrides, userInput }
```

The Builder hands the server the **entire agent** inline:

```
POST /prompts
{
  // full agent definition snapshot — system prompt, model, settings, tools, variables,
  // context slots, permissions, advanced settings — nothing comes from server cache
  definition: {...},
  // plus the usual invocation inputs
  variables, scope, overrides, userInput
}
```

**Why:** The engineer is mid-edit. The "live" definition row may be dirty, not saved, or diverged from what's in server cache. Sending the full snapshot guarantees the server runs the exact bytes the engineer is staring at — no mystery, no caching layer, no cache invalidation race.

This is also why **Builder-specific settings** (`maxIterations`, `maxRetriesPerIteration`, `debug`, `store`) live in a dedicated `builder.*` sub-object on the invocation: they don't apply when an agent is consumed through normal surfaces.

---

## Key flows

### Flow 1 — Create / edit an agent definition

1. Engineer lands on `/agents/[id]/build` (or `/agents/new` for a fresh draft).
2. `agentDefinition` slice hydrates via `AgentHydrator` server components.
3. Engineer edits any field. Each edit dispatches a granular action → slice updates → `isDirty` set; undo stack pushes.
4. Save → thunk writes to Supabase → new version row created (see [`AGENT_VERSIONING.md`](./AGENT_VERSIONING.md)) → current pointer updated → `isDirty` cleared.

### Flow 2 — Manual test call

1. Engineer types a prompt in the Builder chat, optionally supplies variable values and scope.
2. `launchConversation` is dispatched with `routing.apiEndpointMode: "manual"` and `builder.*` settings attached.
3. Payload body is assembled with the **full definition** inline — not just the ID.
4. Fetch hits `POST /prompts`. Server validates the bundled definition and runs it.
5. Response streams back through the standard NDJSON pipeline (see [`STREAMING_SYSTEM.md`](./STREAMING_SYSTEM.md)).
6. Nothing is persisted unless `builder.store = true`.

### Flow 3 — Variable / context slot declaration

1. Engineer defines a variable `X` with default UI component `TextInput` and help text.
2. When any consumer surface loads this agent, the agent-load response includes variable + slot definitions — **but never system prompt or instructions**. Those are server-owned secrets.
3. Consumer surface renders the declared UI components; the user fills them in; values come back to the server via `invocation.inputs.variables`.

### Flow 3b — Agent access on a context slot ("can the agent edit this?")

Every context slot declares whether the agent may CHANGE its value or only READ it. The wire shape is `mutable` + `persist` on `ContextSlot`, but **the word "mutable" never reaches the UI** — users see `Read-only` (lock) vs `Agent can edit` (pencil), and, for an editable slot, "Where the agent's edits go": *This conversation only* (`persist:"never"`) / *Save to the source* (`"auto"`) / *The app saves it* (`"client"`).

- **One primitive owns this everywhere:** `components/context-slots-management/AgentEditAccessControl.tsx` — `AgentEditAccessControl` (slot editor), `AgentEditAccessToggle` (dense table rows), `AgentEditAccessBadge` (read-only surfaces), plus `decodeAgentEditAccess` / `applyAgentEditAccess` / `agentEditAccessChanged`. Never re-derive `mutable`/`persist` by hand; never reintroduce the word.
- **Read-only stores NO flags.** `applyAgentEditAccess` deletes `mutable`/`persist` rather than writing `mutable:false` — absent is the server's own default.
- **`persist:"auto"` only works where aidream has a writeback handler** registered for the slot's `source.kind` (`context_writeback.py`: `note`, `studio_document`, `working_document`, `canvas_item`, `cx_ai_data_records`, `ctx_item`). **A kind with no handler is a SILENT server-side no-op** — the agent's edit is dropped with only a debug line. Before making a new `source.kind` agent-editable + auto, confirm a handler exists; if it doesn't, write the handler — never just hide the option.
- **Scope-bound slots DO write back** (2026-07-12). An agent-editable `ctx_item` slot defaults to "Save to the source": the edit lands on the exact `(context_item_id, scope_id)` cell it was read from, through the `set_context_value` RPC — append-only (new version, previous `is_current` flipped), stamped `source_type='ai_enriched'` + `authored_by`, and re-checked against the user's write access to that scope. **`scope_id` is never authored on the slot** — it depends on the caller's active scope set, so aidream's `scope_binding_resolution` attaches it at run time; without it the writeback refuses rather than guess a scope.
- **The batch importer edits access on slots that already exist.** Rows already bound to a context item stay checked+disabled in the *Context slot* column (a re-run can't double-add) but their **Agent access stays live** and submitting patches the stored slot in place. Disabling it was a real bug: it made an already-added slot's access unreachable from batch.

### Flow 4 — Variable help and option picklists

1. The Edit Variable modal writes each field directly to `agentDefinition` Redux.
2. Help Text is a `ProTextarea` on `matrx-user/agent-builder`; its live scope includes the full agent snapshot plus the focused variable (`variable_name`, `variable_help_text`, `variable_json`, and editable-target metadata).
3. Static option variables can be converted into a user picklist: existing option text seeds both the public label and the hidden injected text, the variable is immediately rebound to the new picklist, and the picklist editor link opens `/lists/{id}` for refinement.

---

## Invariants & gotchas

- **The Builder is the ONLY surface that can send the full agent definition in the request body.** Runner is read-only on the agent — same runtime, but agent-id-only invocation.
- **Advanced settings live only on `builder.*`.** Putting `maxIterations` on a Runner invocation has no effect; those limits are enforced only in Builder mode.
- **Client never sees the system prompt.** Even in the Builder, the system prompt is sent from the client *to* the server — it is not echoed back on agent load for non-Builder surfaces.
- **Every save creates a new version.** There is no in-place overwrite. See `AGENT_VERSIONING.md`.
- **Dirty tracking is per-field.** An unsaved edit blocks navigation away; the undo stack is maintained per-field.
- **Agent Settings UI is part of Builder.** The `features/agent-settings/` directory contains scaffolding (not yet fully wired) for the advanced-settings surface. Extend it there, not in Builder components directly.
- **Output Schema binds to registered kinds.** The Model Settings → Output Schema tab's "Bind to a kind" picker writes a kind's canonical strict `__kind`-injected schema (`{name, strict, schema}`) into `output_schema` through the normal apply path — the one-click form of the proven aidream channel (`output_schema` → `agent_output_contract` → `response_format_for_kind`). Logic + eligibility rules + fingerprint matching: `features/agents/components/settings-management/output-schema/kindBinding.ts` (golden-tested byte-equal to the kind's live `emitted_block_schema`). Never hand-build a kind schema for an agent — bind it.

---

## Related

- [`AGENT_RUNNER.md`](./AGENT_RUNNER.md) — the sibling surface; read both together
- [`AGENT_VERSIONING.md`](./AGENT_VERSIONING.md) — what "save" does
- [`AGENT_INVOCATION_LIFECYCLE.md`](./AGENT_INVOCATION_LIFECYCLE.md) — endpoint routing contrasted against Runner
- `features/agent-settings/FEATURE.md` — *(to be written once wired)*

---

## Change log

- `2026-07-17` — claude: Output Schema tab gains "Bind to a kind" (Content IR registry picker), live "Matches kind X" indicator + drift note; same apply/save path.
- `2026-06-23` — codex: Edit Variable modal Help Text now uses agent-aware `ProTextarea`; long default option text wraps; static options can convert to a linked picklist.
- `2026-04-22` — claude: initial doc extracted from `agent-system-mental-model.md` §1 and related sources.

---

> **Keep-docs-live:** any change to the Builder payload shape, advanced settings enum, or `/prompts` contract must update this doc AND `AGENT_INVOCATION_LIFECYCLE.md`.
