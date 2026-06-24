# First-Cut Execution Plan — Non-Destructive Foundation → Per-Item Transition → Cleanup

> Three movements. Movement 1 is **applied** (additive only, reversible). Movement 2 happens per-table as its code is updated, ideally within days. Movement 3 (destructive) is last. Nothing existing was renamed, altered, or dropped.

## Movement 1 — Non-destructive foundation — ✅ APPLIED (live on prod)
All pure addition; old tables/columns remain live and authoritative until each feature transitions.

**Created:**
- Schemas: `iam`, `knowledge`, `work`, `platform`, `history`, `internal`.
- `platform.entity_types` — the registry, seeded with 10 canonical tokens (scope, scope_type, context_item, project, task, note, agent, file, conversation, prompt). *Completion of the full token set is pending the audit.*
- `history.row_versions` — Base 3, RANGE-partitioned by month (2026-06, 2026-07 created), index on (entity_type,row_id,version).
- Shared functions (defined, **not yet attached to any existing table**): `platform._touch_row`, `platform._stamp_actor`, `platform._version_capture`, `iam.has_org_access(uuid)`.
- `platform._base_entity` — the Base-1 column template.
- `platform.associations` — the unified edge table: `(source_type, source_id, target_type, target_id, org_id, label, metadata, created_by, created_at)`, unique on the tuple, indexes on source/target/org, RLS ON with the canonical org-first policy. **Backfilled: 131 edges** (86 scope, 28 task, 17 project) from the live `ctx_scope_assignments`, `ctx_task_associations`, and uuid-typed litter FKs.

**Deliberately deferred (and why):**
- Did **not** attach `_touch_row`/`_stamp_actor`/`_version_capture` to existing tables — that changes behavior → per-item (Movement 2).
- Did **not** rename old tables or add compat views — we **coexist** (duplicate-then-transition) instead, exactly as designed.
- `platform.associations.org_id` left **nullable**; 15 legacy task edges have no org (their tasks lack one). They're RLS-invisible (safe) until org backfill. Tighten to `NOT NULL` in Movement 3.
- `entity_types` **not yet FK-enforced** on associations (registry not fully seeded) — validate in Movement 3.
- Text-typed litter `project_id`/`task_id` columns skipped (type landmines) → handled per-item.
- No base-column retrofit on existing tables yet → per-item.

**Reversibility:** every object above is new; `DROP SCHEMA … CASCADE` on the six schemas fully reverts Movement 1 with zero impact on the live app.

## Movement 2 — Per-item transition (over the next few days, as each feature's code is touched)
Per table/feature, in this order — do the association-consuming features first:
1. **Repoint reads/writes to `platform.associations`** (server + client) for that entity's relationships. Briefly **dual-write** (new path first, old FK/M2M second) so a missed code path still lands somewhere.
2. **Reconcile** (nightly job, below) until new and old agree for that entity, then **stop writing the old path**.
3. **While you're in that table anyway**, bring it onto Base standards in one pass: add any missing base columns (`created_by`,`updated_by`,`deleted_at`,`version`,`metadata`,`org_id`), backfill `org_id`, attach the three shared triggers (`_stamp_actor`,`_touch_row`,`_version_capture('<token>')`), flip its RLS to the canonical policy, and register it in `platform.entity_types`.
4. Mark the entity `verified` in the ledger.

Because base columns are *added* (they didn't exist), there's no duplicate-`created_at` collision; the only care point is attaching the new `_touch_row` alongside any pre-existing `updated_at` trigger briefly, confirming they agree, then dropping the old per-table touch function.

## Movement 3 — Cleanup (last, destructive, gated)
Once every consumer is `verified`: drop litter `project_id`/`task_id` columns (Phase-2 drops SQL), retire `ctx_scope_assignments`/`ctx_task_associations`, set `platform.associations.org_id NOT NULL`, add the `entity_types` FK/validation, drop the per-table touch-function sprawl, and enable the cron jobs (partition rotation, retention prune, association integrity sweep, token-drift check).

## Cross-cutting
- **Reconciliation job** (run on a branch first): compare `platform.associations` against the still-live old tables/columns; flag divergence during the dual-write window.
- **Snapshot**: take a restore point before each Movement-2 batch and before Movement 3.
- **10-agent internals audit**: run after the foundation and after each batch to catch silent references.
- **Complete `entity_types`**: add the remaining source tokens (message, agent_template, shortcut, broker_value, etc.) against the audit before enforcing the FK.

## Status snapshot (now)
Foundation live and coexisting. App still runs entirely on the old paths. Next action: point one feature's association reads/writes at `platform.associations` + stand up the reconciliation job; optionally attach `_version_capture('task')` to `ctx_tasks` as the history proof-of-concept.

---

## UPDATE LOG — additional non-destructive work applied since first write
- **War-room/thread unification:** `platform.associations.target_type` widened to include `thread`, `war_room`; registry tokens added (`thread`, `war_room`, `studio_session`, `transcript`); all FIVE legacy war-room relationship mechanisms backfilled into `platform.associations` (~103 thread/room edges). Old war-room tables remain live. ("thread" is the canonical word; table rename later.)
- **Litter mirror triggers LIVE:** one generic `platform._mirror_fk_to_assoc` drives **33 triggers** (`_mirror_proj` ×21, `_mirror_task` ×12) on the litter tables — project/task FK writes now auto-sync into `platform.associations` (one-directional, org auto-derived, proven by POC). Teams can now read project/task relationships exclusively from `platform.associations`. **`org` is intentionally NOT mirrored** — it is the tenancy owner column, not an association.
- **`user_files` DROPPED** (empty, no FKs). `get_task_associations` repointed off it; `file` token now → `cld_files` (canonical, 10,712 rows). File standard: our files = `cld_files` id, never a path; external = clearly-named `*_url` checked against our domains; CDN assets = own column.
- **Naming note:** the live unified table is `platform.associations` (created directly in the `platform` schema, coexisting with old tables) — NOT the `public.ctx_associations` + compat-view rename described in the earlier `ctx-association-migration-phase1.sql`. That SQL is a superseded reference, not the implemented path.

This doc + `db-handover-notes.md` are the accurate "what's live" record.
