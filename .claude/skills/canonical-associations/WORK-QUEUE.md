# Canonical Associations — Campaign Work Queue

The prioritized, file-anchored backlog for the canonicalization campaign. One subagent takes one item, applies the matching recipe in [`SKILL.md`](./SKILL.md), runs the checks, ticks the box. **Read `SKILL.md` first** — especially the load-bearing boundary (`platform.associations` vs `iam.permissions`/`iam.memberships`).

> **State of play (2026-06-29 inventory):** FE schema-qualification for the 2026-moved tables is **already done** — there are **zero** bare `supabase.from("<moved-table>")` calls; everything uses `workspaceDb`/`filesDb`/`transcriptsDb`/`.schema(...)`. `pnpm check:schema` is at **0 errors**. No live FE code reads `ctx_scope_assignments`. So the real remaining work is **(A) collapsing bespoke M2M tables + association-read RPCs into `platform.associations`/`assoc_*`**, then **(B) the soak-gated DB retirement**. The "fix bare refs" sub-campaign is reduced to registry hardening + stale-comment cleanup.

---

## Triage key

- **MIGRATE** → bespoke content↔content / content↔container relationship; fold into `platform.associations` (Recipe A).
- **KEEP** → not a content association (access-control, membership, parent-child containment, engagement, or a config binding with its own first-class semantics). Do **not** migrate. Listed so subagents don't "helpfully" break them.
- **EVALUATE** → judgment call; confirm the semantics with the user before migrating.

---

## A. Bespoke M2M / junction tables

> **Cardinality triage (2026-06-29, verified against live `information_schema` + `pg_proc`):** the test is NOT "is the token registered" — it's **"is this an M2M between two table-backed rows (both uuid FKs)?"** If yes → MIGRATE (register the endpoint entity if missing — that's the root fix, not a reason to skip). If it's a 1:many FK, a definition table, or a config object keyed by a text name (not an entity row) → KEEP. Each verdict below cites the actual columns.

| Pri | Status | Table | Cardinality (live columns) | Verdict |
|---|---|---|---|---|
| 1 | ⛔ BLOCKED — needs decision | `tool.bundle_member` | **M2M** `bundle_id`↔`tool_id` (both uuid FK, both registered: `tool_bundle`,`tool`) + edge attrs `local_alias`,`sort_order` | **MIGRATE — but COORDINATED FE+DB.** 9 FE callsites (6 read / 3 write) **AND 4 DB functions** read/write it: `create_bundle_with_lister` (write), `get_tool_detail`, `tool_resolve_bundle`, `tool_resolve_for_request` (reads — the last is the **runtime tool-resolution path** the Python backend calls). FE-only migration would silently break runtime tool resolution. Must rewrite all 4 RPCs + backfill + repoint FE atomically. Edge attrs `local_alias`/`sort_order` → association metadata + ordering. |
| 1 | ☐ MIGRATE | `research.rs_source_tag` | **M2M** `source_id`↔`tag_id` (both uuid FK) + edge attrs `is_primary_source`,`confidence`,`assigned_by` | **MIGRATE.** `research_source` registered ✅; `tag` is a real table row but NOT YET registered → **register a `research_tag` entity (root fix), then migrate**. No DB functions reference it → FE-only (`features/research/service.ts` 535,606,617,631,651,769). Carry the 3 edge attrs as association metadata. |
| 1 | ☐ MIGRATE | `research.rs_keyword_source` | **M2M** `keyword_id`↔`source_id` (both uuid FK) + edge attr `rank_for_keyword` | **MIGRATE.** Same shape: register a `research_keyword` entity, then migrate. No DB functions → FE-only (`features/research/service.ts` 270,678,787). Carry `rank_for_keyword` as metadata. |
| 4 | ☐ | `reg.scope_association_suggestions` | staging table (own entity `scope_association_suggestion`) | **EVALUATE** — staging is its own registered entity; the **accepted** edge already becomes a scope tag via `scopesService`. Confirm the accept path — likely nothing to migrate (staging stays, accept already canonical). |
| — | ☐ | `agent.agent_surface` | agent_id (uuid entity) ↔ **`surface_name` TEXT** (NOT an entity row) + `value_mappings` jsonb, `version`, `visibility`, scope cols | **KEEP** — not entity↔entity. An agent bound to a **named** surface with a versioned config payload = a configuration object, not a content edge. (Flips to MIGRATE only if surfaces become first-class uuid entities — a product decision.) |
| — | ☐ | `ui.ui_surface_agent_role` | text-keyed (`surface_name`,`name`) **definition** row + single optional `default_agent_id` FK | **KEEP** — a surface-slot *definition* table, not a junction. |
| — | ☐ | `ui.ui_surface_agent_pref` | agent_id (uuid) ↔ **(`surface_name`,`role_name`) TEXT slot** + `position`,`settings` jsonb, scope cols | **KEEP** — per-context agent→slot **preference/config**; the slot is a text config identifier, not an entity row. |
| — | ☐ | `scheduler.sch_agent_task` | **entity table** (`prompt`,`variables`,`auth_mode`,…) with a single `agent_id` FK = **1:many** | **KEEP** — it's a first-class entity, not a junction. The lone `agent_id` is a plain FK. |
| 8 | ☐ | `public.content_blocks` | entity table, genuinely in `public` | **KEEP** — `content_block` registered, table verified live in `public.content_blocks`; the bare `.from("content_blocks")` is **correct**. Only migrate if a block↔category linking table surfaces. |
| — | ☐ | `files.share_links` | `features/files/redux/thunks.ts` (428); `app/(core)/files/share/[token]/page.tsx` (26) | **KEEP** — sharing/access-control primitive, not a content edge. |
| — | ☐ | `canvas.canvas_likes` | `hooks/canvas/useCanvasLike.ts` (20,38,96) | **KEEP** — engagement counter, not a content association. |
| — | ☐ | `workbench.udt_picklist_items` | `features/user-lists/*`, `features/udt-picklist/*` | **KEEP** — parent→child containment, not M2M. |

## B. Bespoke association-read RPCs (outside `assoc_*`)

| Pri | Status | RPC | Files | Action |
|---|---|---|---|---|
| 2 | ✅ dispatched | `get_task_associations` | `features/tasks/services/taskService.ts` (215); `features/tasks/redux/taskAssociationsSlice.ts` (109) | Replace read with `assoc_for_entity` + hydration. **(writes already on `associationsService`.)** |
| 2 | ✅ dispatched | `get_tasks_for_entity` | `features/tasks/redux/taskAssociationsSlice.ts` (134) | Replace with `assoc_for_targets`/`assoc_for_sources`. |
| 9 | ☐ | `get_project_references` / `_detailed` | `features/projects/service.ts` (820, 837–838) | Replace with assoc-graph introspection where it's relationship data. |
| 11 | ☐ | `fetch_with_fk` / `fetch_with_ifk` / `fetch_all_fk_ifk` / `fetch_custom_rels` | `lib/redux/api.ts` (7,21,35,49) | **EVALUATE** — legacy app-builder generic joins; audit/retire. |

## C. Reference hardening (Recipe C / guards)

| Pri | Status | Item | Detail |
|---|---|---|---|
| 14 | ☐ | Add `dead-relations.json` entries | Only `notes`/`note_folders` are registered today; the rest (`tasks`,`projects`,`files`,`folders`,`conversation`,`transcripts`,`agent.definition`,`shortcut`,`quiz_sessions`,`flashcard_data`,`udt_*`) are caught only by `direct-from-schema` vs the live snapshot. Register them to lock the old names red. |
| 16 | ☐ | Extend ESLint ban (optional) | `eslint.config.mjs` has no rule for bare `.from("<moved>")` or non-`assoc_*` association RPC names. Add a `no-restricted-syntax` ban so the whole class fails fast in-editor. Pattern to mirror: `scopesChokepointSyntaxRestrictions` (lines 367–374). |
| — | ☐ | Stale-comment cleanup | The 35 `qualified-refs` **warnings** from `pnpm check:schema:warn --verbose` are all `public.<x>` strings **inside comments/docstrings** (prompts→graveyard, permissions→iam, shareable_resource_registry→platform). Cosmetic; fix opportunistically when editing the file. |

## D. DB retirement — SOAK-GATED, do LAST (Recipe A step 5 / `db-graveyard-table`)

> **DO NOT execute until the FE migrations above have soaked in production and a live `SELECT count(*)` confirms nothing reads the table.** Dropping is gated by the zero-data-loss law (CLAUDE.md). Verify live before every drop.

| Status | Item | Detail |
|---|---|---|
| ☐ | Repoint DB-side `ctx_scope_assignments` readers | `migrations/ctx_set_entity_scopes_auth.sql` (56,89,92,107); `ctx_resolve_full_context_cell_values_by_id.sql` (52,62); `ctx_resolve_full_context_scope_cells.sql` (74,84); `repoint_project_member_trio_to_iam.sql` (133). Repoint to `platform.associations`, then graveyard the table + mirror triggers. |
| ☐ | Drop graveyarded task-assoc RPCs | `associate_with_task` / `dissociate_from_task` / `create_task_with_association` already graveyarded; confirm zero callers (FE clean) then drop. |
| ☐ | Drop the legacy junction tables + mirror triggers | Only after every reader above is repointed AND soaked. `verify live before dropping.` |

---

## Reference patterns (copy these — they're already canonical)

- Chokepoint service: `features/scopes/service/associationsService.ts` (the ONLY caller of `assoc_*`).
- Scope-tag mapper: `features/agent-context/redux/scope/scopeAssignmentsSlice.ts` (entity→scope, fully migrated).
- War Room container edges: `features/war-room/service/associations.ts`.
- Content + edge split: `features/flashcards/data/fcService.ts`.
- Container cards (Recipe B): `features/organizations/components/OrgWorkspace.tsx` + `features/scopes/components/associations/AssociationCardGrid.tsx`.
- Schema helpers (Recipe C repoint targets): `utils/supabase/workspaceDb.ts`, `features/files/filesDb.ts`, `utils/supabase/appDb.ts`, `features/transcripts/service/transcriptsHubService.ts` (`transcriptsDb`).

## Per-item Definition of Done

1. Relationship reads/writes go through `associationsService` / `assoc_*` (or the table ref is schema-qualified for Recipe C). One canonical path only.
2. `pnpm check:schema` + `pnpm check:dead-relations` green; touched files pass `pnpm type-check` (no NEW errors — the repo has a pre-existing strictness-wave baseline).
3. The owning `FEATURE.md` + Change Log updated if behavior changed.
4. Box ticked here.
