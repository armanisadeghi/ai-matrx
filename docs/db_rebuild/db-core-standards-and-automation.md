# DB Core Standards & Automation — Canonical Spec

> The master spec. Finalizes the column standards, the **unified RLS system**, the **unified versioning/history system**, the **entity_types registry**, and the **automation** (triggers + cron) that makes all of it run untouched. Grounded in the real engine already in your DB (`permissions` + `has_permission`, the task RLS, `organization_members`, `ctx_project_members`). Companion: `db-staging-and-cutover-plan.md` (how we ship it).

---

## 0. Finalized decisions (locked this session)
- ✅ **`entity_types` registry** — yes, build it. The keystone for every polymorphic pointer.
- ✅ **`metadata` and `updated_at` are universal on Base 1, not opt-in.** Decision: always present, consistent, empty if unused. ("Metadata always ends up handy; I'd rather have it sit empty but consistent.") This overrides the earlier opt-in suggestion.
- ✅ **One unified RLS system** generalized from the task policies (the current best version) + org-first.
- ✅ **One unified versioning/history system** (generic JSONB).
- ✅ **One shared automation layer** — consolidate the many per-table `*_touch_updated_at` functions into single shared triggers; schedule maintenance via cron.

---

## 1. The base column contract

### Base 1 — Standard Entity (most tables)
Every Base-1 table has **exactly** these, always:
| Column | Type | Set by |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | default |
| `org_id` | `uuid NOT NULL` → org | app/session |
| `created_at` | `timestamptz NOT NULL default now()` | default (never trusted from app) |
| `updated_at` | `timestamptz NOT NULL default now()` | **`_touch_row` trigger** |
| `created_by` | `uuid` null | **`_stamp_actor` trigger** (session) |
| `updated_by` | `uuid` null | **`_stamp_actor` trigger** (session) |
| `deleted_at` | `timestamptz` null | soft delete; null = live |
| `version` | `int NOT NULL default 1` | **`_touch_row` trigger** (history anchor) |
| `metadata` | `jsonb NOT NULL default '{}'` | app — *display hints / provenance only, never queryable business data* |

Traits (opt-in, on top): `_trait_nameable` (`name`,`description`,`slug?`), `_trait_searchable` (`search_tsv`), `_trait_ownable` (`owner_id` ≠ creator), `_trait_assignable` (`assignee_id`), `_trait_publishable` (`is_public bool default false`).

### Base 2 — Join / Association (e.g. `platform.associations`)
`id`, `org_id NOT NULL`, `source_*`/`target_*` (+ UNIQUE on the pair/tuple), `created_at`, `created_by`, optional `metadata`. **Omit** `updated_at`/`updated_by`/`version`/`deleted_at` — a link exists or is deleted (delete+insert, never mutate).

### Base 3 — Append-only / Event / Ledger (incl. `history.row_versions`)
`id` (bigint identity or uuidv7), `org_id NOT NULL`, `occurred_at`, `recorded_at default now()`, `actor_id`, `event_type`, `payload jsonb`. Immutable: no `updated_at`/`version`/`deleted_at`. Time-partitioned.

> **Rule:** a "join" with its own role/lifecycle (e.g. memberships) is a **Base 1 entity**, not a join. Memberships stay per-domain; they are NOT folded into `platform.associations`.

---

## 2. `entity_types` registry — the keystone
Single source of truth for every polymorphic token (used by associations `source_type`/`target_type`, `history.row_versions.table_name`, `embeddings.source_table`, generic invitations `target_type`).
```sql
CREATE TABLE platform.entity_types (
  token         text PRIMARY KEY,          -- canonical: 'note','agent','file','scope','project','task',...
  schema_name   text NOT NULL,
  table_name    text NOT NULL,
  label         text NOT NULL,
  base_tier     smallint NOT NULL DEFAULT 1,   -- 1|2|3
  is_versioned  boolean NOT NULL DEFAULT true,
  has_soft_delete boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (schema_name, table_name)
);
```
- Polymorphic columns reference this (FK or trigger-validated) so tokens are **validated, not free text**. Resolves existing drift (`message` vs `cx_message`).
- Seed it during Wave 0; everything downstream reads from it.
- The CI lint cross-checks: every Base-1 table has a registry row; every token used in a polymorphic column exists here.

---

## 3. Unified RLS system (generalized from the task policies)

### 3.1 The two helper functions
```sql
-- (A) Org boundary — the cheap, uniform predicate. STABLE SECURITY DEFINER, cached.
CREATE OR REPLACE FUNCTION iam.has_org_access(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = p_org AND m.user_id = (SELECT auth.uid())
  );
$$;

-- (B) Per-entity grant — the within-org sharing layer. ALREADY EXISTS, keep as-is:
--   has_permission(resource_type text, resource_id uuid, required permission_level)
--   checks the `permissions` table (direct user grant OR org grant), level hierarchy admin>editor>viewer.
```
`(select auth.uid())` is wrapped for init-plan caching (perf at scale). Both helpers are `stable security definer`.

### 3.2 The canonical access ladder (one pattern, every Base-1 table)
Derived from `ctx_tasks` (the best version), generalized and **org-first**:

| Command | Allowed when ANY is true |
|---|---|
| **SELECT** | `iam.has_org_access(org_id)` · OR `created_by = auth.uid()` · OR (`assignee_id = auth.uid()` if trait) · OR (`is_public` if trait) · OR `has_permission(<token>, id, 'viewer')` — **AND `deleted_at IS NULL`** |
| **INSERT** | `WITH CHECK (iam.has_org_access(org_id) AND created_by = auth.uid())` |
| **UPDATE** | `created_by = auth.uid()` · OR `iam.has_org_access(org_id)` · OR `has_permission(<token>, id, 'editor')` — AND `deleted_at IS NULL` |
| **DELETE** | `created_by = auth.uid()` · OR `has_permission(<token>, id, 'admin')` *(prefer soft delete via UPDATE `deleted_at`; hard DELETE rare)* |

- **Org-first by construction** (kills the legacy user-first-only problem) while preserving the finer ladders (assignee, project membership, grants) the task system proved out.
- **Within-org visibility** (hiding a colleague's junk agents) layers on later by tightening SELECT from `has_org_access(org_id)` to `has_org_access(org_id) AND (created_by=auth.uid() OR has_permission(...,'viewer'))` per table that wants it. The hook is already here.
- Generated by the `create_entity_table()` helper from a template, so every table gets the identical policy. CI lint fails any Base-1 table with no RLS or a divergent policy.

### 3.3 Base 2 / Base 3 RLS
- **Base 2 (associations):** `USING (iam.has_org_access(org_id))` for SELECT/DELETE; INSERT `WITH CHECK (iam.has_org_access(org_id) AND created_by = auth.uid())`. No polymorphic helper needed — the edge carries `org_id`.
- **Base 3 (history/events):** SELECT `USING (iam.has_org_access(org_id))`; **no INSERT/UPDATE/DELETE policy for end users** — writes come only from `SECURITY DEFINER` triggers / service role. Immutable.

---

## 4. Unified versioning & history system

### 4.1 Generic history table (Base 3, partitioned)
```sql
CREATE TABLE history.row_versions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text        NOT NULL REFERENCES platform.entity_types(token),
  row_id      uuid        NOT NULL,
  org_id      uuid        NOT NULL,
  version     int         NOT NULL,          -- mirrors the row's version column
  operation   text        NOT NULL,          -- INSERT | UPDATE | SOFT_DELETE | DELETE
  row_data    jsonb       NOT NULL,          -- full snapshot of NEW, minus heavy cols
  actor_id    uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (occurred_at);
```
- **Full snapshots, not diffs** (cheap point-in-time reconstruction; prune by dropping partitions).
- **Captured on every write including the first INSERT.** Main-row `version` is the source of truth; history mirrors it → lockstep.
- **Exclude heavy/derived cols:** `row_data := to_jsonb(NEW) - 'search_tsv' - 'embedding'` (+ any generated cols).
- **Scope:** Base 1 = always on; Base 3 = never (it *is* the log); Base 2 = off by default. Per-table opt-out for extreme-churn tables.

### 4.2 Two versioning systems coexist — DO NOT merge them
- `history.row_versions` = **audit/recovery** (forensics, rollback, "who changed this row").
- `knowledge.attribute_values.is_current` cell history = **domain timeline** (a first-class, queryable "what was the settlement posture last month"). Keep it. It is NOT redundant with audit history; collapsing it breaks the queryable timeline.

### 4.3 `version` = anchor now, optimistic-lock later
The trigger increments `version` on every write (history anchor — always safe). Optimistic-lock *enforcement* (reject writes with a stale version) is enabled per-table later when the app sends the version. Don't conflate.

---

## 5. Automation — triggers + cron (so nobody hand-touches this)

### 5.1 Shared row triggers (replace all the per-table copies)
**Consolidation finding:** today there are many near-identical functions (`_fn_kg_sweep_touch_updated_at`, `_shareable_resource_registry_touch`, `_fn_auto_ingest_batch_touch_updated_at`, …). Replace every one with these three shared functions, attached uniformly.
```sql
-- (1) touch: updated_at + version anchor
CREATE OR REPLACE FUNCTION _touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.version := OLD.version + 1; END IF;
  RETURN NEW;
END $$;

-- (2) stamp actor: created_by/updated_by from the session var the connection layer sets
CREATE OR REPLACE FUNCTION _stamp_actor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.created_by := COALESCE(NEW.created_by, uid); END IF;
  NEW.updated_by := uid;
  RETURN NEW;
END $$;

-- (3) version capture: write the snapshot to history.row_versions
CREATE OR REPLACE FUNCTION _version_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec jsonb; op text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := to_jsonb(OLD); op := 'DELETE';
  ELSE
    rec := to_jsonb(NEW) - 'search_tsv' - 'embedding';
    op := CASE WHEN TG_OP='INSERT' THEN 'INSERT'
               WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'SOFT_DELETE'
               ELSE 'UPDATE' END;
  END IF;
  INSERT INTO history.row_versions(entity_type, row_id, org_id, version, operation, row_data, actor_id)
  VALUES (TG_ARGV[0], COALESCE((rec->>'id')::uuid, NULL), (rec->>'org_id')::uuid,
          COALESCE((rec->>'version')::int, 1), op, rec,
          NULLIF(current_setting('app.user_id', true), '')::uuid);
  RETURN COALESCE(NEW, OLD);
END $$;
```
Trigger order per Base-1 table: `BEFORE INSERT/UPDATE` → `_stamp_actor`, `_touch_row`; `AFTER INSERT/UPDATE/DELETE` → `_version_capture('<token>')`.

### 5.2 The 4-step "create a Base 1 table" (helper proc + CI lint)
1. `CREATE TABLE x (LIKE _base_entity INCLUDING ALL);` (+ chosen traits)
2. attach `_stamp_actor` + `_touch_row`
3. attach `_version_capture('<token>')`
4. enable RLS + apply the canonical policy template (§3.2); insert the `platform.entity_types` row
Wrap in `create_entity_table(schema, name, token, traits[])`. **CI lint** fails any new entity table missing any of the four (this is what makes the standard enforceable, not aspirational).

### 5.3 Cron (pg_cron) — scheduled maintenance, set-and-forget
| Job | Cadence | Does |
|---|---|---|
| `history_create_partitions` | weekly | pre-create next month's `row_versions` partitions |
| `history_prune` | daily | drop partitions older than the retention window (per-org GDPR purge runs here too) |
| `assoc_integrity_sweep` | daily | flag/clean `platform.associations` edges whose source/target is missing or `deleted_at` (ghost edges) |
| `entity_types_drift_check` | daily | assert every polymorphic token in use exists in `platform.entity_types`; alert on drift |
| `embeddings_reindex_check` | as needed | surface rows whose `content_hash` changed and need re-embedding |

(Requires the `pg_cron` extension enabled.)

### 5.4 Soft-delete propagation
On `SOFT_DELETE` of a source/target entity, its `platform.associations` edges are treated as dead — filtered on read by joining live entities, and swept by `assoc_integrity_sweep`. Unique constraints are partial (`WHERE deleted_at IS NULL`) so names are reusable after soft delete.

---

## 6. What runs automatically (the "don't touch it" summary)
- **Per row:** `_stamp_actor` (created_by/updated_by), `_touch_row` (updated_at + version), `_version_capture` (full history snapshot). Uniform across every Base-1 table.
- **Per access:** the canonical RLS policy via `iam.has_org_access` (boundary) + `has_permission` (grants). Identical everywhere.
- **Scheduled:** partition rotation, retention prune, association integrity, token-drift, embedding checks.
- **At build time:** `create_entity_table()` + CI lint guarantee new tables are born compliant.

---

## 7. Still open (need your calls; none block documentation)
- ⚠️ Reference cardinality (single vs multi) for attribute reference-values; reconcile with `max_assignments_per_entity`.
- ⚠️ Required-slot enforcement: surface-as-gaps (leaning) vs block-on-write.
- ⚠️ Judgment-case FK columns (`code_*`, `wc_claim`, `skl_skill_projects`, `ai_*`) — keep vs convert.
- ⚠️ History retention window + per-table version opt-outs (extreme-churn tables).
- ⚠️ Whether to enforce `entity_types` tokens via hard FK vs trigger-validate (FK is stricter; trigger is more flexible for cross-schema).

## 8. Decision log
- *2026-06-07* — `entity_types` registry confirmed; `metadata`+`updated_at` universal (not opt-in); unified RLS generalized from task policies (org-first + `has_permission` grants + ownership/assignee/public, soft-delete-aware); unified history (generic JSONB, partitioned, every-write, heavy-col exclusion); shared triggers (`_touch_row`/`_stamp_actor`/`_version_capture`) replacing the per-table touch-function sprawl; cron maintenance jobs; 4-step create + CI lint. Coexisting domain timeline (`attribute_values`) preserved.
