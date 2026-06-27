# DB Change Toolkit — verified reality (Matrx Main)

> The shared reference for every `db-*` change skill. **Everything here was read live from the database** (`pg_get_functiondef`, `information_schema`) on 2026-06-27, not from design docs. Where a design doc (`docs/db_rebuild/db-core-standards-and-automation.md`) and the live DB disagree, **this file states what the DB actually does.** Re-verify a signature with `execute_sql` before betting a migration on it.

---

## 0. Constants (paste these, don't guess)

| Thing | Value |
|---|---|
| Supabase project name | **Matrx Main** |
| `project_id` (every MCP call) | **`txzxabzwovsujtloxrus`** (us-west-1, Postgres 17) — the ONLY DB this stack talks to |
| System org ("Matrx System") | **`39c38960-d30c-4840-b0c1-c9960de95582`** — the org you assign to ownerless / system rows |
| Apply DDL | Supabase MCP `apply_migration` (idempotent SQL) — NOT psql, NOT the app (no DDL path) |
| Run read SQL | Supabase MCP `execute_sql` |
| FE types regen | `pnpm db-types` → `types/database.types.ts` |
| FE full check | `pnpm sync-types` (DB types + Python API types + tsc) |
| Migration ledger | `public._schema_migrations` (key `(source, filename)`), `source='matrx-frontend'` |
| Ledger verifier | `pnpm check:migrations` (red box on unapplied/drifted) |

### The exposed-schema gotcha (easy to miss, breaks the FE silently)
`pnpm db-types` only pulls the schemas hardcoded in its `--schema` flags (package.json):
`public, context, files, workflow, workspace, app, skill, tool, agent, chat, ai, graveyard`.
**NOT pulled:** `platform, iam, history, scraper, rag, runtime, legal`.
→ If the FE will read a table **directly via supabase-js**, its schema MUST be in that flag list (and exposed to PostgREST). Tables the FE only reaches through `SECURITY DEFINER` RPCs (e.g. all of `platform.*`) do not need to be. When you move/create a table in a non-listed schema and the FE reads it directly, **add the schema to the `db-types` script AND to PostgREST's exposed schemas**, or the FE gets no types and 404s at runtime. ⛔ **PostgREST exposure is Supabase platform config — NOT reachable via the MCP** (it's not a role GUC; verified empty on `authenticator.rolconfig`). It must be set in the dashboard (Settings → API → Exposed schemas) or the management API. This **blocks** moving any FE-read table into a brand-new schema until the user/mgmt-API exposes it (see `db-move-table-schema`).

### Live schemas + table counts (2026-06-27)
`public 255` · `graveyard 76` · `chat 21` · `files 21` · `scraper 17` · `rag 14` · `tool 14` · `workflow 12` · `context 9` · `platform 9` · `agent 7` · `runtime 7` · `legal 7` · `app 6` · `skill 6` · `iam 5` · `workspace 4` · `ai 3` · `history 3`.
84 entities are registered in `platform.entity_types` (44 components, 45 versioned). **public still holds 255 tables** — the bulk of the canonicalization/reorg is still ahead.

---

## 1. The canonical base shape

`platform._base_entity` is the 9-column skeleton (verified columns/types):
```
id uuid pk default gen_random_uuid()
organization_id uuid NOT NULL          -- canonical name is organization_id (retrofit also accepts org_id)
created_at timestamptz NOT NULL now()
updated_at timestamptz NOT NULL now()  -- maintained by _touch_row
created_by uuid                        -- maintained by _stamp_actor; MUST be uuid (owner)
updated_by uuid                        -- maintained by _stamp_actor
deleted_at timestamptz                 -- soft delete; NULL = live
version int NOT NULL default 1         -- bumped by _touch_row
metadata jsonb NOT NULL default '{}'   -- display/provenance hints only, never queryable business data
```
**Plus, for anything shareable:** `visibility platform.visibility NOT NULL default 'private'` (NOT in `_base_entity` — add it per entity).
**Legacy → canonical normalizations the spec demands:** `user_id|owner_id|author_id|creator_id (owner) → created_by` · `is_public → visibility` · `is_deleted → deleted_at` · non-uuid `created_by → created_by_kind` (then add a real uuid `created_by`).

### Satellites are polymorphic by token — a table joins them by being *registered*, never by adding columns
All key off `(entity_type/source_type = '<token>', entity_id/_id = <row id>)`:
- `platform.activity_log` — `id bigint, organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata`
- `platform.comments` — base-shaped + `entity_type, entity_id, parent_id, body`
- `platform.associations` — `id, source_type, source_id, target_type, target_id, organization_id, label, metadata, created_by, created_at` (Base-2: no version/updated/deleted)
- `platform.categories` — base-shaped + `dimension, name, slug, parent_id, is_system, color, icon, position`
- `platform.user_entity_state` — `user_id, entity_type, entity_id, is_favorite, is_pinned, is_hidden, last_viewed_at, metadata` (favorites/pins/hidden/recents)
"Handling satellites" during canonicalization = migrate any per-feature comments/associations/categories/activity/favorites rows INTO these tables under the token, then graveyard the old per-feature tables.

---

## 2. The toolkit functions (exact live signatures)

### `platform.retrofit_entity(p_table, p_token, p_org_strategy='parent', p_owner_col='user_id', p_parent_table=NULL, p_parent_fk=NULL, p_legacy_trigger=NULL) → text`
SECURITY DEFINER, **hardcoded to `public` schema** (`format('public.%I', p_table)`). **Does a BOUNDED job:**
- ADDs (if missing): `organization_id` (or reuses existing `org_id`), `created_by`, `updated_by`, `updated_at`, `version`.
- Backfills `created_by` from `p_owner_col`; backfills org by strategy:
  - `personal` — owner's personal org (`organizations.is_personal AND created_by=owner`), else the system org.
  - `parent` — copies org from `p_parent_table` via `p_parent_fk` (needs both args).
  - `keep` — no org backfill, tolerates null org.
- Drops `p_legacy_trigger` (if given) + any `_touch_row`/`_stamp_actor`, then attaches fresh `_touch_row` + `_stamp_actor`.
- RAISES if `created_by` exists but isn't uuid ("rename to created_by_kind first"), or if a non-`keep` strategy leaves null-org rows.
- **Does NOT:** add `deleted_at` / `metadata` / `visibility`; register `entity_types`; attach `_history`; apply RLS. Those are separate steps.
- **Only works for `public.*`.** For a table already homed in a schema (`workflow.definition`, `chat.message`…), retrofit_entity is unusable — **hand-roll the column adds** (see canonicalize skill).

Real calls:
```sql
select platform.retrofit_entity('skl_categories','skill_category','personal','user_id',null,null,'trg_skl_categories_updated');
select platform.retrofit_entity('skl_render_components','render_component','parent',null,'skl_render_definitions','render_definition_id',null);
```

### `iam.apply_rls(p_schema, p_table, p_token, p_variant='entity') → void`
**The ONLY policy authority. Works on ANY schema.** ENABLEs RLS, **DROPS every existing policy** on the table, then creates the canonical set. Run it **after** columns + `entity_types` row (+ composition edge for components) exist.
- `entity` — requires `created_by` + `organization_id` (RAISES otherwise). Creates: `svc_all` (service_role), `std_select`/`std_insert`/`std_update`/`std_delete`, and `pub_read` (anon) **iff** a `visibility` column exists.
  - `std_select USING (deleted_at IS NULL AND (created_by = (select auth.uid()) OR iam.has_access('<token>', id, 'viewer')))` — the **owner short-circuit leads** (see §6 gotcha).
- `component` — for a child whose access IS its parent's. Requires a `kind='composition'` edge in `platform.entity_relationships` (RAISES otherwise). Policies defer to `iam.has_access(parent_type, fk_column, level)`. No org/created_by/visibility needed for access.
- `ledger` — append-only org log. Only `svc_all` + `std_select USING (… iam.has_org_access(organization_id))`. No user writes.

Real call: `select iam.apply_rls('public','wr_sessions','war_room','entity');`

> ⚠️ **Drift:** the older `db-table-retrofit` skill says variants are `entity|join|ledger`. **`'join'` is NOT a real variant** — the live function has no branch for it, so `apply_rls(...,'join')` falls into the standard-entity branch and RAISEs if the table lacks created_by/org. Use `component` or `ledger`. (Base-2 association tables are policied by hand or treated as `ledger`-like; there is no `join` generator.)

### `iam.verify_canonical(p_schema, p_table, p_token, p_variant=NULL) → TABLE(check_name, status, detail)` — the machine-checkable acceptance spec
Auto-detects variant from `entity_types.is_component` when `p_variant` is NULL. Returns one row per check with status `PASS|FAIL|WARN|SKIP`. Checks: `entity_registered`, `rls_enabled`, `policies_canonical` (exact set match — extra legacy policies FAIL it), and for `entity`: `col_created_by`, `col_organization_id`, `col_visibility` (WARN if absent), `soft_delete` (WARN if absent), `timestamps`, `legacy_owner_col`/`legacy_is_public` (WARN if present), `policy_owner_shortcircuit`, `policy_uses_has_access`, `pub_read_anon`, `sharing_token` (registry `resource_type` must equal the token).

### `iam.verify_canonical_ok(p_schema, p_table, p_token, p_variant=NULL) → boolean`
`true` ⇔ **no row has status `FAIL`**. **WARN does not fail it.** So `ok()=true` is the *floor*, not "fully canonical": a table missing `visibility` or `deleted_at`, or still carrying `user_id`/`is_public`, can still be `ok()`. **Full canonical bar = zero FAIL AND zero WARN you can't explicitly justify.** **Verified live (sandbox round-trip):** a correctly canonicalized entity that *keeps* legacy `user_id`+`is_public` (required through the soak) shows exactly **two permanent WARNs — `legacy_owner_col` + `legacy_is_public`** — which only clear when those columns are dropped (gated, later). Everything else (`col_visibility`, `soft_delete`, `timestamps`, the policy/registration checks) must reach PASS. So the realistic transition bar = **zero FAIL + at most those two legacy WARNs.** Always read the detail rows:
```sql
select * from iam.verify_canonical('public','notes','note');   -- inspect every PASS/WARN/FAIL
select iam.verify_canonical_ok('public','notes','note');        -- floor gate
```

---

## 3. Registry tables (the polymorphic backbone)

### `platform.entity_types` — register here or nothing works
Columns: `token` (PK), `schema_name`, `table_name`, `label`, `base_tier` (1), `is_versioned` (default true), `has_soft_delete` (default true), `is_active` (default true), `default_visibility`, `is_listed`, `is_component`, `category`, `is_module`, `default_*` module flags.
**Registration is a manual idempotent INSERT** (no helper fn). The real pattern:
```sql
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'workflow','workflow','definition','Workflow','private',false,true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='workflow');
```
**Token rules:** the token is the identity used EVERYWHERE — `entity_types.token` = `associations.source_type/target_type` = `permissions.resource_type` = `shareable_resource_registry.resource_type` = the `_version_capture('<token>')` / `apply_rls(...,'<token>')` argument. They must be **identical** strings. Tokens drift historically (`message` vs `cx_message`) — pick one, use it in every layer.

### `platform.entity_relationships` — two kinds, two meanings (don't conflate)
Columns: `child_type, parent_type, fk_column, kind, note`.
- **`kind='composition'`** — child's existence & access ARE the parent's, full depth (versions, events, checkpoints, line-items). Required for the `component` RLS variant and for `has_access` on a component. This is the one real migrations use.
- **`kind='containment'`** — a standalone entity that is also reachable *through* a container; `has_access` walks these as a **read cascade** only for rows with `visibility >= 'internal'`. Optional, additive.
Real composition insert:
```sql
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'workflow_definition_version','workflow','definition_id','composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships r WHERE r.child_type='workflow_definition_version' AND r.kind='composition');
```

### `public.shareable_resource_registry` — register iff the entity is user-shareable
Columns include `resource_type` (**must == the entity token**), `schema_name`, `table_name`, `id_column` ('id'), `owner_column` (canonical 'created_by'), `is_public_column`, `display_label`, `url_path_template`, `rls_uses_has_permission`, `is_active`, `content_role`, `is_scopeable`.
```sql
INSERT INTO public.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
VALUES ('note','public','notes','id','created_by','visibility','Note','/notes/{id}',true);
```
Mismatch between registry `resource_type` and the entity token → `has_access` silently ignores grants (and `verify_canonical` FAILs `sharing_token`).

### `public.permissions` — grants are ROWS, not a per-feature table
`resource_type` (=token), `resource_id`, `granted_to_user_id` / `granted_to_organization_id`, `permission_level`, `status`, `expires_at`, …. Any per-feature `<x>_permissions`/`_shares`/`_collaborators`/`_acl` table → migrate rows here, then graveyard the old table.

---

## 4. The access model — reality vs the conceptual tiers

**Two enums, verified:**
- `platform.visibility` (ordered): `private < internal < link < public`. The "make public" driver. (`link` ≈ the "shared by link / discoverable" idea.)
- `public.permission_level` (ordered): **`viewer < editor < admin`** — only **3** levels.

**The conceptual model the PM wrote (Viewer / Commenter / Editor / Owner) does NOT map 1:1 to the DB:**
| Concept | DB reality |
|---|---|
| Viewer | `permission_level='viewer'` |
| Commenter | **no DB level** — there is no `commenter` in `permission_level`. A real gap if/when commenter grants are needed. |
| Editor | `permission_level='editor'` (drives `std_update`) |
| Owner | **not a grant** — it's `created_by = auth.uid()` (the short-circuit), or org owner/admin via `is_org_admin`. `std_delete` uses `permission_level='admin'`. |

`iam.has_access(token, id, required permission_level='viewer')` is the resolver (SECURITY DEFINER). Order it checks: owner (`created_by`) → org-admin read oversight (viewer only) → public visibility (viewer) → explicit `public.has_permission` grant → org context for `visibility >= internal` (`has_org_access`) → `containment` cascade for `visibility >= internal`. `iam.has_org_access(org)` = membership in `iam.organization_member`.

---

## 5. Triggers & versioning — what's actually live

Canonical trigger names (function-named, attached by retrofit / by hand):
- `_touch_row` BEFORE INS/UPD → `platform._touch_row()` (updated_at + version++).
- `_stamp_actor` BEFORE INS/UPD → `platform._stamp_actor()` (created_by/updated_by from `current_setting('app.user_id')` else `auth.uid()`).
- `_history` AFTER INS/UPD/DEL → `platform._version_capture('<token>')` (snapshot to `history.row_versions`; strips `search_tsv`/`embedding`; ops INSERT/UPDATE/SOFT_DELETE/DELETE).
- `_gc` AFTER UPD/DEL → `platform._gc_entity_associations('<token>')` (deletes association edges on hard/soft delete). **Optional; not attached anywhere yet.**

**Versioning is REGISTERED but barely CAPTURING.** 45 entities have `is_versioned=true`, but **only 4 tables actually have a `_history` trigger** (`iam.invitations`, `iam.memberships`, `platform.categories`, `platform.comments`). The worked canonical tables `workflow.definition` and `chat.conversation` have `_touch_row`+`_stamp_actor` but **no `_history`** (decision-log "history deferred"). So: **`is_versioned=true` does nothing by itself — to actually capture history you must hand-attach `_history`:**
```sql
CREATE TRIGGER _history AFTER INSERT OR UPDATE OR DELETE ON <schema>.<table>
FOR EACH ROW EXECUTE FUNCTION platform._version_capture('<token>');
```
`history.row_versions` is monthly-partitioned (`row_versions_2026_06`, `_2026_07` exist). New months need partitions pre-created (cron `history_create_partitions` is the intended owner; verify the partition exists before relying on capture in a new month). **Verified:** capture begins only from when `_history` is attached — pre-existing rows are NOT backfilled; and any data-normalization UPDATE you run *after* the shared triggers are attached (e.g. `is_public→visibility`) fires `_touch_row` and bumps `version`/`updated_at` — sequence normalization before trigger attach to avoid churn on freshly-migrated rows.

**Service-role writes don't auto-stamp `created_by`.** The Python backend (service role) does not set `app.user_id`, so `_stamp_actor` can't fill `created_by` on engine writes. If a table is written by the backend, either have the engine write `created_by` explicitly, or keep a transition bridge `created_by := COALESCE(created_by, user_id)`.

**Leftover legacy triggers are real debt.** `workflow.definition` still carries a bespoke `wf_definition_set_updated_at` alongside `_touch_row` (double-fires). Hand-rolled retrofits must `DROP TRIGGER IF EXISTS <legacy_updated_at_trigger>` when attaching `_touch_row`.

**Mirror triggers** (`platform._mirror_fk_to_assoc('<token>','<fk_col>','<target_token>')`) keep a real FK column writing into `platform.associations` during the junction cutover (e.g. `chat.conversation._mirror_proj` mirrors `project_id`→`project`). Relevant when a feature's relationships move to associations.

---

## 6. Gotchas that have already bitten (encode these)

1. **`INSERT … RETURNING` 42501** — if `std_select` doesn't *lead* with `created_by = (select auth.uid())`, an insert's RETURNING clause evaluates SELECT against the in-flight row, the resolver can't see it, and the insert fails `42501`. `iam.apply_rls` builds it correctly; never hand-write a `has_access`-only SELECT policy.
2. **Org-first RLS before org backfill = rows vanish** — a NULL `organization_id` makes `has_org_access` false. Backfill org (0 nulls) BEFORE `apply_rls`, and before `SET NOT NULL`.
3. **`apply_rls` drops ALL existing policies** — anything not in the canonical set is gone. Inventory existing policies first if any are load-bearing outside the standard.
4. **`retrofit_entity` is public-only** — schema-homed tables hand-roll columns.
5. **`verify_canonical_ok` tolerates WARN** — don't report "canonical" off `ok()=true` alone; read the detail rows and clear the WARNs (visibility, deleted_at, legacy cols) that apply.
6. **Exposed-schema gotcha (§0)** — FE-read table in a non-listed schema = no types + runtime 404.
7. **A migration file is not applied** — a `.sql` in `migrations/` changes nothing until `apply_migration` runs AND you verify the object live AND record the ledger row. "Wrote the file" ≠ done.
8. **Supabase MCP behavior (learned the hard way)** — use `apply_migration` for DDL (transactional + named) and `execute_sql` for reads/verification. `execute_sql` returns **only the last statement's result set**, and a multi-statement batch is **atomic** — one syntax error rolls the whole batch back (so a trailing typo'd SELECT silently undoes your inserts). Put the verifying SELECT last and on its own; don't bundle independent mutations behind a SELECT that might error.

---

## 7. Graveyard vs the deprecated-rename monitor (two different things)

- **Graveyard** = retirement holding area. `ALTER TABLE public.<t> SET SCHEMA graveyard` (reversible; **never `DROP TABLE`** during the soak). 76 tables already there. No tracking-registry row is required by convention; the move itself is the record. PITR gates the eventual hard DROP.
- **`platform.v_deprecated_table_access`** = a `pg_stat_statements`-backed **monitor for RENAMED tables** (old→new name pairs like `file_*→cld_*`, `ctx_war_room_*→wr_*`). It counts lingering references to the OLD name so you know when a rename's consumers are fully repointed. It is **not** a graveyard registry and not about schema moves. Use it to confirm "0 calls to the old name" before dropping a compat view/old name.

---

## 8. Cross-repo apply order (the finalize SOP — same for every change type)

1. **DB** — apply idempotent DDL via Supabase MCP `apply_migration` (project `txzxabzwovsujtloxrus`). **Verify live** with `execute_sql` (column/policy/trigger exists). Write `migrations/<name>.sql`, sha256 it, insert `public._schema_migrations` (`source='matrx-frontend'`).
2. **Frontend (matrx-frontend)** — `pnpm db-types` (add the schema to the `--schema` list first if it's new & FE-read). Update every usage (`.from()/.schema()`, types, RPC names). `pnpm sync-types` at the end (DB + Python API types + tsc) → fix all TS errors.
3. **Python (aidream)** — `python db/generate.py` (regenerates `db/models*.py` + managers). New schema → add to `db/matrx_orm.yaml` `additional_schemas` + a generate block. Table consumed by a sub-package (matrx-ai/graph/rag/…) → wire it in `aidream/package_integration.py` (`configure_packages()`). Drift check `python db/detect_applied.py`. Update usages. Start `python run.py`, confirm a clean boot (`Local Link: http://localhost:8000`, no ERROR/CRITICAL).
4. **matrx-extend / matrx-local** — update references if any, but **never let them block production**.
5. **Commit + push `main`** on both primary repos.
