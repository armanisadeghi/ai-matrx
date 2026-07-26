# DB Ticket — Provision `content_ir` kind registry (Wave 1: schema + wiring only)

> **Completed historical ticket. Do not execute this build order.** It predates the final singular table names and later Shape/workflow waves. Current live truth: `/Users/armanisadeghi/code/common-docs/systems/content-ir-system/FEATURE.md`.

**Owner:** DB agent · **Spec (authoritative):** [`KIND_REGISTRY_STORAGE.md`](./KIND_REGISTRY_STORAGE.md) (v3, LOCKED) · **Project:** `txzxabzwovsujtloxrus` (Matrx Main)

Read the spec first. This ticket is the *build order*; the spec is the *why*. Where they disagree, the spec wins — flag it, don't guess.

---

## Scope of THIS wave

Provision the empty `content_ir` schema + tables + RLS + wiring. **Do not populate any rows.** **Do not write the `flexible_data → content_ir` data-migration** — that transform (jsonb-object → ordered `data` array + edge extraction + `sample_data` fusion + dual-gate) is content-ir logic and belongs to Agent A. You deliver empty, correct, wired tables and hand back.

v1 admits `ts`-owned display kinds only, but **provision the full two-owner shape now** (the `authoring_owner` column + the nullable-`data` contract) so Phase 2 (Python node-I/O mirror) is data, not another migration.

### In scope
1. `content_ir` schema (dedicated).
2. Three tables: `definition`, `definition_version`, `edge` — columns exactly per spec §4, **plus** the canonical base/audit columns the spec omits by convention (`organization_id`, `created_at/by`, `updated_at/by`, `deleted_at`, `metadata`) using the standard base-entity set + shared triggers.
3. RLS via the canonical generator (`iam.apply_rls` + `iam.has_access`) — **never hand-write policies**. Model: mirror `workflow.definition`'s read/write posture; system kinds readable by all authed users via `iam.system_orgs.global_readable = true`.
4. Register a `kind` token in `platform.entity_types` (for kind↔component/category wiring through `platform.associations` later).
5. PostgREST exposure: `GRANT USAGE` on `content_ir` to the app roles, add `content_ir` to `pgrst.db_schemas` (in-DB override), add to the db-types schema list, reload the schema cache.
6. Ledger + regen: record in `public._schema_migrations` (`source='matrx-frontend'`), then `pnpm db-types` (frontend) + aidream `python db/generate.py`.

### Explicitly OUT of scope (Agent A owns)
- The `flexible_data → content_ir` transform / any row inserts.
- The TS emitter, the cascade, the dual-gate harness, the recursive-CTE cycle guard, the `type:"ref"` ↔ `edge` consistency guard (these are **app/TS-level**, not DDL — do not implement them as triggers).
- Populating `emitted_*`, `sample_data`, `validation_status`, `is_active`.

---

## Table shape (from spec §4 — reproduce exactly, add base columns)

**`content_ir.definition`** — live kind. Key columns:
`kind text not null`, `label text not null`, `authoring_owner text not null check (authoring_owner in ('ts','python'))`, `data jsonb`, `sample_data jsonb`, `emitted_block_schema jsonb`, `emitted_json_schema jsonb`, `emitted_fingerprint text`, `validation_status text not null default 'pending'`, `validated_at timestamptz`, `version int not null default 1`, `is_active boolean not null default false`, `visibility platform.visibility not null default 'private'`.
Constraints: `unique (organization_id, kind)`; `check (authoring_owner <> 'ts' or data is not null)`.

**`content_ir.definition_version`** — immutable snapshots (history + pin resolution). Key columns:
`definition_id uuid not null -> content_ir.definition(id)`, `version_number int not null`, `data jsonb`, `sample_data jsonb`, `edges jsonb`, `emitted_block_schema jsonb`, `emitted_json_schema jsonb`, `emitted_fingerprint text`, `change_note text`, `changed_by_user_id uuid`, `changed_at timestamptz not null default now()`.
Constraints: `unique (definition_id, version_number)`. **Append-only** — grants must forbid UPDATE/DELETE for app roles (insert + select only).

**`content_ir.edge`** — kind→kind reference graph (live, FK-enforced). Key columns:
`parent_definition_id uuid not null -> content_ir.definition(id) on delete cascade`, `field_name text not null`, `child_definition_id uuid not null -> content_ir.definition(id) on delete restrict`, `pinned_child_version int`, `position int`.
Constraints: `unique (parent_definition_id, field_name, child_definition_id)`. Direct self-reference rows are allowed (a kind embedding itself); indirect cycles are guarded at write time by Agent A's app-level recursive-CTE check — **not** a DB constraint.

---

## Discipline (per CLAUDE.md DB rules)
- Idempotent DDL (`IF NOT EXISTS`, `CREATE OR REPLACE`), applied via the Supabase MCP `apply_migration`.
- A migration is done only when **applied AND verified live** (query the tables/columns/policies exist) AND the ledger row is written AND types are regenerated. A `.sql` file alone is not "done."
- Run `pnpm check:schema` after — it must be clean.
- Report back: the applied migration name, a live-verification query result, and confirmation the two type-gen commands ran. Then Agent A takes over for the data-migration wave.

---

## Open questions to raise (don't guess)
- Confirm the exact canonical base-entity column set + shared trigger names currently in use for a fresh domain table (use the newest retrofit reference, not an older one).
- Confirm `workflow.definition`'s current RLS posture is the right mirror (it's the closest sibling: a versioned `definition` + `definition_version` pair).
