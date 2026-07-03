# Agent ↔ Surface → `platform.associations` — Cutover Status

**Date:** 2026-07-03 · **Branch:** `claude/agent-surface-associations-t4e3yp`

The agent↔surface binding (the "attach an agent to a specific UI" relationship)
was moved off the bespoke `agent.agent_surface` M2M onto the ONE association edge
`platform.associations`. This is the first of the surface system's associations to
canonicalize — surfaces are now a **first-class UUID entity**, so future source
types (tool↔surface, roles/prefs) attach the same way ("then take it from there").

## The model

- **Surface = first-class entity.** `ui.ui_surface` got a stable `id uuid`; the
  token `surface` is registered in `platform.entity_types` and added to
  `ASSOCIATION_TARGET_TYPES`.
- **Binding = association edge.** `source_type='agent'` (agent_id) →
  `target_type='surface'` (ui_surface.id).
  - **org tier** → edge `organization_id`. RLS via `iam.has_org_access`: a
    **personal** org keeps a user binding private; a **shared** org makes it
    member-visible — identical to the old table's RLS semantics.
  - **tier discriminator + uniqueness** → edge `role`, under
    `associations_unique(source_type, source_id, target_type, target_id, role)`:
    `binding:u:<user_id>` / `binding:o:<org_id>` / `binding:p:<project_id>` /
    `binding:t:<task_id>` / `binding:g`.
  - **value_mappings + tier bookkeeping** → edge `metadata`
    (`value_mappings`, `version`, `visibility`, `tier`, `user_id/project_id/task_id`).

Verified live before migrating: 30 bindings — 24 user-tier (all personal orgs),
6 org-tier (shared orgs), **0 project/task/global**, 0 role collisions.

## What is DONE (applied + verified live + ledgered)

| Stage | File | State |
|---|---|---|
| 1 — foundation + backfill | `migrations/agent_surface_to_associations.sql` | ✅ applied, count-verified (30 live = 30 edges), ledgered |
| 2 — repoint DB readers | `migrations/agent_surface_associations_repoint_reads.sql` | ✅ applied, ledgered — `agent.menu_surface` view + `create_shortcut_from_agent_surface` RPC now read associations (backward-compatible; proven set-equivalent to the old view) |
| FE — binding service | `features/surfaces/services/agent-surface-bindings.service.ts` | ✅ rewritten onto `associationsService`, public API preserved |
| FE — delete thunk | `features/surfaces/redux/thunks.ts` | ✅ reconstructs edge from binding in state |
| Types | `types/generated/entity-types.generated.ts`, `types/database.types.ts`, `features/scopes/types.ts` | ✅ `surface` token + `ui_surface.id` mirrored |

Because Stage 2 is backward-compatible (the view reads the fully-backfilled edge
set; the RPC still resolves a legacy `agent_surface.id`), the currently-deployed
FE keeps working after Stage 2 — the two halves need not deploy in lockstep.

## MUST DO in a DB-authorized dev session (blocked here)

`pnpm install` fails in the authoring sandbox (org egress policy 403 on a
GitHub-tarball dep), so these could not run — do them and commit any diff:

1. **`pnpm gen:entity-types`** — normalize `entity-types.generated.ts` (the
   `surface` token was hand-inserted to match the DB; regenerate to be exact).
2. **`pnpm db-types`** — normalize `database.types.ts` (`ui_surface.id`).
3. **`pnpm type-check`** — confirm the service rewrite + consumers compile.
4. **`pnpm check:schema` / `pnpm check:migrations`** — expect green (both
   migrations are ledgered).
5. **Runtime QA** the binding UI (`/agents/[id]/surfaces`, the batch editor), the
   context-menu "Bound Agents" submenu, and launch-time value-mapping resolution
   (`/transcripts/cleanup`, mermaid edit) — the paths that read/write bindings.

## Remaining before Stage 3 (graveyard `agent.agent_surface`)

`migrations/agent_surface_graveyard.sql` is authored but **NOT applied** (marked
`migrate: skip`). It retires the now-dormant table (reversible `SET SCHEMA`).
Apply ONLY after the FE deploy soaks AND these admin/maintenance readers (off the
binding hot path — they still read the frozen table, so new bindings undercount
in admin stats until then) are repointed to associations / `agent.menu_surface`:

- `features/surfaces/services/surfaces.service.ts` — `listSurfacesWithStats()`
  (agentCount), `getSurfaceUsage()`, `listAgentBindings()`.
- `features/surfaces/services/manifest-sync.service.ts` — scans/repairs
  `value_mappings` → operate on `associations.metadata->'value_mappings'`.
- `app/api/admin/surfaces/remediate-mapping/route.ts` — writes `value_mappings`.

Then confirm `select audit.table_impact('agent','agent_surface')` shows no live
dependent, and `select count(*)` confirms nothing reads it, before applying.

## Then "take it from there" (the rest of the surface system)

Same recipe, surface now being a real entity/container:
- **tool↔surface** (`tool.surface_defaults`) — per-surface tool inclusion set.
- **agent↔surface via roles** (`ui.ui_surface_agent_role` + `ui_surface_agent_pref`)
  — the newer role-slot M2M.
- Optionally add a surface **association card** (Recipe B) so a surface page shows
  its bound agents/tools via `AssociationCardGrid`.
