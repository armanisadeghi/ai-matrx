# Canonical Associations — Status Report (where we actually stand)

**Date:** 2026-06-29 · **Purpose:** A facts-only snapshot. No decisions executed beyond what's noted. Companion to [`WORK-QUEUE.md`](./WORK-QUEUE.md) and [`SKILL.md`](./SKILL.md).

---

## 1. Migration status — nothing is migrated-and-confirmed yet

| Relationship | State | Reads + writes confirmed canonical *everywhere*? |
|---|---|---|
| `get_task_associations` / `get_tasks_for_entity` (task association reads) | **Agent in flight** (FE read-swap to `assoc_for_entity` / `assoc_for_targets`; writes were already on `associationsService` from a prior session) | **NOT confirmed.** DB sweep shows the only functions referencing these names are the two RPCs themselves (the path being replaced). Final confirmation pending agent return + a full FE caller grep. |
| `tool.bundle_member` | **HALTED — blocked on decision.** Agent made **zero edits** (`git diff` empty). | **No — and it must not be done FE-only** (see §2). |
| `research.rs_source_tag` | Not started | n/a — re-triaged to MIGRATE (see §3) |
| `research.rs_keyword_source` | Not started | n/a — re-triaged to MIGRATE (see §3) |

**Bottom line:** zero relationships are fully cut over and verified. Treating anything as "done" before all reads AND writes (FE + DB RPCs + Python consumers) are on `platform.associations` would create silent desync bugs, which is exactly the failure mode we're avoiding.

---

## 2. Critical finding — `bundle_member` is NOT a FE-only migration

A database-wide sweep (`pg_proc` / `pg_get_functiondef`) found **4 server-side Postgres functions** that read/write `tool.bundle_member`, in addition to the FE:

| Function | Op | Notes |
|---|---|---|
| `create_bundle_with_lister` | **write** | Inserts members. |
| `get_tool_detail` | read | |
| `tool_resolve_bundle` | read | |
| `tool_resolve_for_request` | read | **Runtime tool-resolution path — called by the Python backend when an agent runs.** |

Plus **9 FE callsites** (6 read / 3 write) across 5 files (`bundles.service.ts`, `dimensions.service.ts`, `surfaces.service.ts`, and the two `app/api/admin/bundles/[id]/members/**` admin routes).

**Why FE-only would break the product:** if the FE writes edges into `platform.associations` while these RPCs still read `tool.bundle_member`, runtime tool resolution silently returns the wrong tools — no error surfaced. A correct migration must rewrite all 4 RPCs + backfill + repoint the 9 FE callsites **atomically**, preserving the edge attributes `local_alias` (text) and `sort_order` (int — every member-list read orders by it).

---

## 3. Corrected cardinality triage (evidence-based)

The right test is **"is this an M2M between two table-backed rows (both uuid FKs)?"** — not "is the token registered." If yes → MIGRATE (registering a missing endpoint entity is the *root fix*, not a reason to skip). If it's a 1:many FK, a definition table, or a config object keyed by a **text name** (not an entity row) → KEEP. Columns verified live via `information_schema`.

> Correction: an earlier triage table wrongly marked the two `research` junctions as KEEP on the basis that "tag/keyword aren't registered entities." That was backwards — they are real uuid-FK M2M tables, so they migrate (and the endpoint entities get registered). Fixed below.

| Table | Live cardinality | Verdict | Rationale |
|---|---|---|---|
| `tool.bundle_member` | **M2M** `bundle_id`↔`tool_id` (both uuid FK; tokens `tool_bundle`,`tool` ✅) + `local_alias`,`sort_order` | **MIGRATE (coordinated FE+DB)** | See §2 — 4 RPCs incl. runtime path. |
| `research.rs_source_tag` | **M2M** `source_id`↔`tag_id` (both uuid FK) + `is_primary_source`,`confidence`,`assigned_by` | **MIGRATE (FE-only)** | `research_source` ✅; `tag` is a real row, just unregistered → register a `research_tag` entity, then migrate. No DB functions reference it. Carry the 3 attrs as edge metadata. |
| `research.rs_keyword_source` | **M2M** `keyword_id`↔`source_id` (both uuid FK) + `rank_for_keyword` | **MIGRATE (FE-only)** | Register a `research_keyword` entity, then migrate. No DB functions. Carry `rank_for_keyword` as metadata. |
| `agent.agent_surface` | `agent_id` (uuid entity) ↔ **`surface_name` TEXT** + `value_mappings` jsonb, `version`, `visibility`, scope cols | **KEEP** | Not entity↔entity. An agent bound to a *named* surface with a versioned config payload = a configuration object, not a content edge. Flips to MIGRATE only if surfaces become first-class uuid entities (product decision). |
| `ui.ui_surface_agent_role` | text-keyed (`surface_name`,`name`) **definition** row + single optional `default_agent_id` FK | **KEEP** | A surface-slot *definition* table, not a junction. |
| `ui.ui_surface_agent_pref` | `agent_id` (uuid) ↔ **(`surface_name`,`role_name`) TEXT slot** + `position`,`settings` jsonb, scope cols | **KEEP** | Per-context agent→slot preference/config; the slot is a text config identifier, not an entity row. |
| `scheduler.sch_agent_task` | **entity table** (`prompt`,`variables`,`auth_mode`,…) + single `agent_id` FK = **1:many** | **KEEP** | First-class entity (registered as its own token), not a junction. The lone `agent_id` is a plain FK. |
| `public.content_blocks` | entity table, genuinely in `public` | **KEEP** | `content_block` registered; table verified live in `public.content_blocks` — the bare `.from("content_blocks")` is correct, not a reorg miss. |

---

## 4. Open decisions (not yet made)

1. **research M2Ms** — register `research_tag` / `research_keyword` entities and migrate both (FE-only), or leave them as internal research-pipeline taxonomy?
2. **`bundle_member`** — do the full coordinated FE+DB migration (incl. Python consumer coordination on the `tool_resolve_*` contract), produce a detailed plan only, or hold until the backend owner is looped in?
3. **surfaces** (`agent_surface` / `ui_surface_*`) — keep as config bindings (current verdict), or promote surfaces to first-class entities (bigger change)?

---

## 5. Org workspace components — restored

During the association work, `OrgWorkspace.tsx` had its **"Resources by content role"** grid (`OrgResourceRoleSection` — the colored role-accent tiles, Utilities / Sources / Outputs / Workspaces, with the share-your-own contribute flow over `iam.permissions`) **replaced** by the plain `AssociationCardGrid`. That was wrong — the two serve different purposes (legacy sharing surface vs canonical `platform.associations` attach surface).

**Current state (restored 2026-06-29):** both render. The original role-bucketed grid is back unchanged under the **"Resources"** header (driven by `useOrgResourceInventory` + the catalogue); the canonical card grid sits below it under a renamed **"Associations"** header. No components were deleted at any point — `OrgResourceRoleSection.tsx`, `useOrgResourceInventory.ts`, and `resource-catalogue.ts` all remained on disk and are wired back in. Final disposition of the two surfaces is deferred (decision #3-adjacent — the sharing/permissions surface reconciliation).
