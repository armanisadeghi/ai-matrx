# Finish the Context Policy rename: the server-owned column + the runtime read

**Why this exists:** the `context slot` → **Context Policy** rename (Arman, 2026-08-17, Vocabulary
Law 4) is DONE in matrx-frontend for everything the client owns — every TS identifier, directory,
filename and UI string, plus the new `auto_context_disabled` kill switch live at the Agent AND
Mandate levels. Two things are deliberately NOT done, because they are the server's:

1. **The column rename.** `agent.definition.context_slots` (and `definition_version`, `template`)
   → `context_policies`, and `required_context_slots` → `required_context_policies` inside the
   mandate contract JSONB. This client reads `agent.definition` DIRECTLY with supabase-js, so
   renaming ahead of the server 404s every agent read.
2. **The runtime read.** `iam.runnable_agent_fields` / `iam.runnable_version_fields` do NOT project
   `auto_context_disabled`. **Until they do, the switch is stored, versioned, copied and displayed
   — but the server does not honour it.** That is the load-bearing gap; the rename is cosmetic
   next to it.

## What already exists (do not rebuild)

Applied live to Matrx Main (`txzxabzwovsujtloxrus`) on 2026-08-17:

- `agent.definition.auto_context_disabled boolean not null default false`, same on
  `agent.definition_version` and `agent.template`.
- `agent.mandate.auto_context_disabled` — the Mandate-level gate.
- The flag is carried through every function that already carried `tool_config`:
  `trg_agx_agent_snapshot_version` (**including its no-change guard**),
  `trg_agx_agent_create_v1_snapshot`, `agx_promote_version`, `agx_get_version_snapshot`,
  `agx_duplicate_agent`, `agx_duplicate_version`, `agx_create_agent_from_template`,
  `agx_sync_linked_agents_reviewed`, `agx_get_execution_full`, `agx_get_execution_minimal`.

## The semantics the server must implement

| Declared | Switch | Behaviour |
|---|---|---|
| nothing | on | all context flows, delivered normally |
| context policies | on | those govern their keys; undeclared extras still flow |
| anything | **off** | **ONLY** declared context policies deliver |

**A GATE MAY ONLY NARROW.** Effective value is
`agent.auto_context_disabled OR mandate.auto_context_disabled`. A Mandate can close what its Holder
would have accepted; it can never reopen what the Holder refused. Same rule `max_inline_chars`
already follows as `min(agent, surface)`, extended from *how much* to *whether at all*.

This is the exact mirror of `auto_tools_disabled` in `services/tooling/tool_merge.py` — read that
first and follow its shape rather than inventing a second one.

## Order (matters)

1. **aidream first:** project the flag in `iam.runnable_*_fields`, honour it in the context
   assembly path, and deploy. Adding a column to those TABLE-returning functions changes their
   shape — check whether anything unpacks them positionally before you do.
2. **Then the column rename**, in ONE change across the DB + aidream + this client, since the
   client reads the column directly. In this repo the flip is small and mechanical: the identifiers
   are already `contextPolicies`, so it is the snake_case strings only —
   `features/agents/redux/agent-definition/converters.ts` (4 sites),
   `features/agents/types/agent-definition.types.ts` (the 3 RPC shapes),
   `features/agents/mandates/overrides.ts` (`parseMandateContract`), and the `.select()` lists in
   `features/admin/mandates/service.ts`. Then `pnpm db-types` and `pnpm type-check`.
3. Same pass: `shared_context_slots` (`aga_apps`, agent apps) and the `agent_context_slots` RPC
   field are the same lineage and should move with it.

## Finish

`pnpm type-check`, `npx jest features/agents features/admin/mandates`, then browser-verify an agent
builder (the switch and the policy editor still save and reload) and
`/administration/agents/mandates` (the Context fact still toggles). Delete this handoff and its row
in `common-docs/operations/unassigned-handoffs.md` in the same commit.

Cross-repo system of record:
`/Users/armanisadeghi/code/common-docs/systems/mandates/FEATURE.md` § Context.
