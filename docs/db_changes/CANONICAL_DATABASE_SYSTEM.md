# AI Matrx — Canonical Database System

**Authoritative reference.** Postgres project `txzxabzwovsujtloxrus`. This is the single source of truth for how tables, access, versioning, associations, and conformance work. If code disagrees with this document, the code is wrong. Last verified 2026-07-03.

---

## 0. Non-negotiables

1. **One token ↔ one table.** Every entity is registered in `platform.entity_types` with a stable `token`. Reference entities by **token**, never by `schema.table`. Tables and schemas can move; the token never changes.
2. **Every entity table carries the base contract** (§1). No exceptions.
3. **Relationships are rows in `platform.associations`** (§7). *A new `x_y` junction table is a bug.*
4. **Growing vocabularies are FKs into a registry** (`platform.categories` via `category_id`), never enums or `CHECK` arrays. Fixed, code-level vocab may be an enum.
5. **Access is RLS applied by `iam.apply_rls`, keyed on the token** (§4). Never hand-write policies.
6. **Nothing is "done" until `iam.canonical_certify_ok(schema, table, token)` is `true`** (§8). No partial passes.
7. **Never `DROP`.** Retire to the `graveyard` schema (rename). Migrated rows carry `metadata.legacy_table` + `metadata.legacy_id`; log the change in `platform.deprecated_relations`.
8. **Don't hand-build tables.** Use `platform.create_entity_table` (§3). Don't hand-write version/soft-delete/association logic. Use the generic RPCs (§5–§7).

---

## 1. The base entity contract

Every entity table has these columns, in this order at the **front** of the table (custom fields go between `id` and `organization_id`):

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK, `DEFAULT gen_random_uuid()` |
| *…custom fields…* | | | placed right after `id` for sensible default views |
| `organization_id` | uuid | **NOT NULL** | FK → `iam.organizations(id)` |
| `created_by` | uuid | null | FK → `auth.users(id)` |
| `updated_by` | uuid | null | FK → `auth.users(id)` |
| `created_at` | timestamptz | NOT NULL | `DEFAULT now()` |
| `updated_at` | timestamptz | NOT NULL | `DEFAULT now()` |
| `deleted_at` | timestamptz | null | soft-delete marker; NULL = live (present when `has_soft_delete`) |
| `version` | integer | NOT NULL | `DEFAULT 1` |
| `metadata` | jsonb | NOT NULL | `DEFAULT '{}'` |
| `visibility` | `platform.visibility` | NOT NULL | enum; the access driver (present on entity/system variants) |

**Trigger trio** (attached by the provisioner; identified by function name):
- `_stamp_actor` — `platform._stamp_actor()` BEFORE INSERT/UPDATE — stamps `created_by`/`updated_by`.
- `_stamp_org_default` — `public._stamp_org_default()` BEFORE INSERT — defaults `organization_id` (optional).
- `_touch_row` — `platform._touch_row()` BEFORE INSERT/UPDATE — sets `updated_at`, and on UPDATE bumps `version := OLD.version + 1`.
- `_version_capture` — `platform._version_capture('<token>')` AFTER INSERT/DELETE/UPDATE — writes a full snapshot to `history.row_versions` (only when `is_versioned`).

**Kill list** (must not exist on a canonical table): `user_id`/`owner_id`/`author_id`/`creator_id` (owner is `created_by`), `org_id` (use `organization_id`), `is_deleted`/`status='deleted'` (use `deleted_at`), `is_public` (use `visibility`). A legitimate toggle is `is_active`.

---

## 2. `platform.entity_types` — the identity registry

One row per entity. Key columns:

- `token` (PK) · `schema_name` · `table_name` · `table_ref` (regclass) · `label`.
- `is_versioned` (→ `_version_capture` + history), `has_soft_delete` (→ `deleted_at` required), `is_component` (access defers to a composition parent), `is_listed`, `default_visibility`, `rls_variant`, `is_active`.
- Group/vocab flags: `base_tier`, `is_module`, `default_scopeable`, `default_members_can_add`, `default_needs_approval`, `default_auto_ingest`, `category`, `notes`.

A token whose `table_ref` no longer resolves is a **stale registry** row (see `audit.stale_registry`).

---

## 3. Creating a table — always the provisioner

```sql
platform.create_entity_table(
  p_schema      text,       p_table   text,      p_token   text,
  p_label       text,       p_fields  text[],    -- raw column defs, placed right after id
  p_variant     text,       -- 'entity' | 'component' | 'ledger' | 'system'
  p_versioned   boolean,    p_soft_delete boolean,
  p_visibility  text,       -- 'none' | a platform.visibility value (e.g. 'personal','public','link')
  p_category    boolean,    -- adds category_id → platform.categories(id)
  p_listed      boolean,    p_org_default boolean,
  p_gin_jsonb   boolean     -- auto-GIN each jsonb custom field
) RETURNS text
```

**All parameters are required** — agents must state every choice, so nothing is enabled by accident. Only the base contract (always present) is implicit.

It runs, in order: builds `id` + custom fields + base columns → indexes (`organization_id`, `created_by`, `category_id`, GIN on jsonb customs if requested) → registers in `entity_types` → attaches the trigger trio (+`_stamp_org_default`, +`_version_capture` when versioned) → `iam.apply_rls` → **`iam.verify_canonical` and RAISEs on any FAIL**. The whole thing is one transaction: you get a certified-canonical table or nothing.

Example — the entire `flexible_data` table:

```sql
SELECT platform.create_entity_table('public','flexible_data','flexible_data','Flexible Data',
  ARRAY['label text NOT NULL','data jsonb NOT NULL DEFAULT ''{}''::jsonb'],
  'entity', true, true, 'personal', true, false, true, true);
```

Result column order: `id → label → data → organization_id → created_by → updated_by → created_at → updated_at → deleted_at → version → metadata → visibility → category_id`.

---

## 4. Access model

Applied by `iam.apply_rls(schema, table, token, variant)`; enforced by `iam.has_access(token, id, level)` where `level ∈ {viewer, editor, admin}`.

- **Owner short-circuit:** `created_by = auth.uid()` returns true for any level.
- **Policies** (canonical set): `svc_all` (service_role), `std_select`/`std_insert`/`std_update`/`std_delete` (authenticated, owner + `has_access`), `pub_read` (anon, `visibility='public'` + `deleted_at IS NULL`) when a visibility column exists.
- **Authenticated policies gate on AUTHORIZATION only — never `deleted_at`.** `deleted_at IS NULL` lives ONLY on the anon `pub_read` policy (the public web must never see deleted content). It must NOT appear in any authenticated `std_select`/`std_update` USING or WITH CHECK: Postgres re-checks the SELECT policy against the *post-UPDATE* row, so a `deleted_at`-gated `std_select` makes a direct soft-delete `UPDATE` fail `42501` ("new row violates row-level security policy") and makes restore a silent 0-row no-op. Soft-delete visibility is the app's job (`.is('deleted_at', null)` in queries), not RLS's. Enforced platform-wide by `iam_apply_rls_v2_soft_delete_select_fix.sql` (2026-07-04) — the generator emits it only on `pub_read`.
- **Variants:** `entity` (standard), `component` (access defers to a composition parent in `platform.entity_relationships`), `ledger` (read-only select via org access), `system` (adds public-visibility read).
- **`has_access` returns `false` when `auth.uid()` is NULL.** All the generic RPCs below enforce `has_access`, so calling them from a trusted server context requires a JWT/`app.user_id`, or use `service_role`.

---

## 5. Versioning

**Store:** `history.row_versions(id bigint, entity_type text /*token*/, row_id uuid, organization_id uuid, version int, operation text, row_data jsonb, actor_id uuid, occurred_at timestamptz)`. Append-only. Fed by `platform._version_capture(token)`; `version` is bumped by `_touch_row` on every UPDATE. `operation ∈ {INSERT, UPDATE, SOFT_DELETE, DELETE}`. `row_data` is the full row minus `search_tsv`/`embedding`.

**Canonical RPCs (in `public`, generic over any versioned token, access-checked):**

| RPC | returns | purpose |
|---|---|---|
| `version_list(token, id, limit=50, offset=0)` | `(version, operation, actor_id, occurred_at, is_current)` | timeline |
| `version_snapshot(token, id, version)` | jsonb | full row at a version |
| `version_current(token, id)` | jsonb | live row |
| `version_diff(token, id, from, to)` | jsonb `{changed:{field:{from,to}}, total_changes}` | diff two versions |
| `version_diff_current(token, id, from)` | jsonb | diff a version vs live |
| `version_restore(token, id, version)` | int (new version) | **promote/copy an old version into live** — content columns only; bumps version; captures a new snapshot; non-destructive |
| `version_prune(token, id, keep=20)` | int | drop old snapshots (keeps v1 + newest N) |

Diffs exclude noise (`version`, `updated_at`, `updated_by`). Restore never touches identity/ownership/lineage (`id`, `organization_id`, `created_by`, `created_at`, `version`, `updated_*`, `deleted_at`) or generated columns.

React: `supabase.rpc('version_list', { p_token: 'fc_card', p_id })`, `supabase.rpc('version_diff', { p_token, p_id, p_from, p_to })`, `supabase.rpc('version_restore', { p_token, p_id, p_version })`.

> **DRIFT TO RETIRE.** `public.get_version_history/_snapshot/_diff`, `promote_version`, `restore_version`, `purge_old_versions` are legacy hardcoded `IF token='prompt'… ELSIF 'note'…` switches over bespoke per-entity `*_versions` tables (prompt/builtin/prompt_app/tool/note/agent/code_file). They do **not** read `history.row_versions`. Migrate callers to the generic `version_*` family; drop the per-entity version tables + `trg_*_snapshot_version` triggers as each entity moves onto `history.row_versions`.

---

## 6. Soft delete

`deleted_at IS NULL` = live. **RLS does NOT hide soft-deleted rows from authenticated readers** — that would break direct soft-delete/restore `UPDATE`s (§4). The app filters them in its own queries (`.is('deleted_at', null)` — the FE does this at 100+ read sites); only anon `pub_read` hides them from the public web.

Two equivalent paths — both work:
- **Direct RLS-authorized write** (canonical FE path per CLAUDE.md, React → Supabase directly): `.update({ deleted_at: new Date().toISOString() })` / `.update({ deleted_at: null })` to restore. Now works because authenticated policies no longer gate `deleted_at` (§4).
- **Generic SECURITY-DEFINER RPCs** (for consumers without direct table access; bypass RLS): `public.entity_soft_delete(token, id)` → boolean, requires **admin** (owner qualifies), sets `deleted_at=now()`; `public.entity_undelete(token, id)` → boolean, requires **editor**, clears `deleted_at`.

Both RPCs are generic over any token with `deleted_at`; versioned tables record a `SOFT_DELETE` history row via the `_version_capture` trigger on the underlying UPDATE.

---

## 7. Associations (relationships)

**Table:** `platform.associations(id uuid PK, source_type, source_id, target_type, target_id, role, label, position, metadata jsonb, organization_id, created_by, created_at)`. `source_type`/`target_type` are FKs to `entity_types.token`.

**Direction convention:** an edge reads **`source → target` = "source belongs-to / is-filed-under / attached-to target."** Source = subject/child/member; target = container/parent/classifier. (E.g. `fc_card → fc_set` role `member`.)

**Identity (unique, `NULLS NOT DISTINCT`):** `(source_type, source_id, target_type, target_id, role)`. Linking is idempotent on this key.

**Canonical RPCs (in `public`, access-checked):**

| RPC | returns | notes |
|---|---|---|
| `assoc_link(source_type, source_id, target_type, target_id, role=null, label=null, position=null, metadata='{}')` | uuid (edge id) | idempotent (upserts label/position/metadata). Requires editor on source + viewer on target. `organization_id` derived from source. |
| `assoc_unlink(source_type, source_id, target_type, target_id, role=null)` | int (rows removed) | editor on source |
| `assoc_list(type, id, direction='out', role=null)` | `(assoc_id, direction, role, label, edge_position, other_type, other_id, metadata, created_at)` | `out`=its targets, `in`=its members, `both`. viewer on entity. |

React: `supabase.rpc('assoc_link', { p_source_type:'fc_card', p_source_id, p_target_type:'fc_set', p_target_id, p_role:'member' })`, `supabase.rpc('assoc_list', { p_type:'fc_set', p_id, p_direction:'in' })`.

---

## 8. Conformance toolkit

**The gate (single source of truth) — `iam.verify_canonical(schema, table, token [, variant])`** returns `(check_name, status, detail)`. It checks the *entire* contract: registration; all base columns with type + nullability; FK targets (`organization_id`→`iam.organizations`, `created_by`/`updated_by`→`auth.users`); `deleted_at` vs `has_soft_delete`; the trigger trio vs `is_versioned`; `visibility` is the `platform.visibility` enum NOT NULL (required when listed/shareable; skipped for components); legacy kills; RLS enabled + canonical policy set + owner short-circuit + `has_access(token)` + `pub_read`; sharing-token match; component composition.

- Severity: **FAIL** = structural contract violations (block everything). **WARN** = advisory/transitional (legacy owner col, `is_public`/`is_deleted`, missing visibility on an unlisted entity). **SKIP** = N/A.
- `iam.verify_canonical_ok(...)` → boolean (no FAIL).
- `iam.canonical_certify(schema, table, token)` → blocking rows = conformance FAIL/WARN **plus any currently-broken dependent function**. Empty = perfect.
- `iam.canonical_certify_ok(...)` → boolean. **This is the "done" gate.**

**The audit store — `SELECT audit.refresh();` rebuilds every snapshot** (drives the gate over all registered live tables + runs `plpgsql_check` over every plpgsql function). Exclusions read from `meta.excluded_schema`.

| object | what it gives |
|---|---|
| `audit.summary` (view) | per table `fails` / `warns` / `certified`. `WHERE NOT certified ORDER BY fails DESC` = the hit list |
| `audit.canonical_findings` | every FAIL/WARN with `check_name` + `detail` |
| `audit.broken_functions` | `plpgsql_check` errors: `level` / `sqlstate` / `message` (catches dangling column/table refs after renames) |
| `audit.function_deps` | precise function → object dependency map |
| `audit.table_impact(schema, table)` | **preflight**: every function touching a table · `dependency` (precise\|text) · `currently_broken` · exact `referenced_columns[]` — run before any rename/drop |
| `audit.m2m_candidates` | tables with ≥2 FKs to non-org/user targets (junction-collapse candidates) |
| `audit.unregistered_candidates` | live tables not in `entity_types` (`base_col_score` ≥4 ≈ real entity) |
| `audit.stale_registry` | tokens whose table no longer exists |
| `audit.refresh_log` | run history + counts |

---

## 9. Workflows

**New table** → §3 (`create_entity_table`). Done.

**Canonicalize an existing table (the flip loop) — touch once, never return:**
1. `SELECT * FROM iam.verify_canonical(s,t,tok);` → the full fix list.
2. `SELECT * FROM audit.table_impact(s,t);` → every dependent function + the exact columns each touches → the blast radius, *before* editing.
3. **One migration:** canonicalize the table (columns/FKs/triggers; RLS via `iam.apply_rls`) **and repoint every function from step 2** in the same migration.
4. `SELECT audit.refresh();`
5. `SELECT iam.canonical_certify_ok(s,t,tok);` must be `true`. If not, `SELECT * FROM iam.canonical_certify(s,t,tok);` and fix.
6. *Only then* touch application/client code. Log the change in `platform.deprecated_relations`.

**Collapse an M2M junction into associations:**
1. Ensure both endpoint tokens are registered + active.
2. `INSERT INTO platform.associations` (set source/target tokens+ids, `organization_id` from source, `role`/`position`/`label`/`metadata`, plus `metadata.legacy_table` + `legacy_id`).
3. Verify `count(new edges) == count(*) junction`.
4. Repoint dependent functions (use `audit.table_impact`).
5. Rename the junction into `graveyard`.
6. `INSERT INTO platform.deprecated_relations(old_ref, new_ref, reason)`.

**Retiring anything:** rename into `graveyard` (never DROP). `SET SCHEMA` is metadata-only — FKs/RLS/indexes/triggers follow the table automatically; **only function bodies break**, so repoint them.

---

## 10. Function catalog (quick reference)

**Create/verify:** `platform.create_entity_table(...)` · `iam.verify_canonical(s,t,tok)` · `iam.verify_canonical_ok(s,t,tok)` · `iam.canonical_certify(s,t,tok)` · `iam.canonical_certify_ok(s,t,tok)` · `iam.apply_rls(s,t,tok,variant)`.
**Audit:** `audit.refresh()` · views/tables in §8 · `audit.table_impact(s,t)`.
**Versioning:** `version_list` · `version_snapshot` · `version_current` · `version_diff` · `version_diff_current` · `version_restore` · `version_prune`.
**Soft delete:** `entity_soft_delete(token,id)` · `entity_undelete(token,id)`.
**Associations:** `assoc_link(...)` · `assoc_unlink(...)` · `assoc_list(type,id,direction,role)`.
**Access:** `iam.has_access(token,id,level)`.

---

## 11. Gotchas (learned the hard way)

- **Column renames do NOT propagate into function bodies.** Table/schema moves carry FKs/RLS/triggers by OID, but function *bodies* reference names as text and silently break. Always run `audit.table_impact` before a rename; `plpgsql_check` (via `audit.broken_functions`) catches the fallout. SQL-language functions are *not* covered by `plpgsql_check` — check them manually.
- **`pg_get_functiondef` throws on aggregate functions.** Filter `prokind='f'` when scanning function bodies.
- **A data-modifying function is not visible to sibling subqueries in the same statement.** After `assoc_link`/`version_restore`, read back in a *separate* statement.
- **`position` is a keyword** — alias it in `RETURNS TABLE` column lists (we use `edge_position`).
- **`has_access` needs `auth.uid()`.** From a server/service context, provide a JWT / `app.user_id`, or use `service_role`.
- **The gate is the truth, not intuition.** A table that "looks" canonical but isn't certified (`iam.canonical_certify_ok`) is not done. As of 2026-07-03: 199 registered live tables, only **9 fully certified** — the rest are the canonicalization backlog (query `audit.summary WHERE NOT certified ORDER BY fails DESC`).

---

## 12. Known drift / backlog (2026-07-03)

- **Version system:** legacy per-entity `*_versions` tables + hardcoded `get_version_*`/`promote_version`/`restore_version` → migrate to the generic `version_*` family over `history.row_versions` (§5).
- **Conformance:** 190 of 199 registered tables not yet certified; ~1039 gate FAILs. Work them via the flip loop (§9).
- **Registry:** 18 stale `entity_types` rows; ~205 unregistered live tables (~62 look like real entities).
- **M2M:** ~125 junction candidates to collapse into associations.
- **RLS:** disabled on `platform.entity_relationships` and `platform.deprecated_relations` (internal metadata; decide intentionally).
