# Canonicalization Worklog
Project `txzxabzwovsujtloxrus` · updated 2026-06-30

## 0. Conformance gate — ALL true or the table is NOT done
- Registered `token` in `platform.entity_types` (one token ↔ one table; never reference by schema.table).
- 9 base cols: `id` uuid · `organization_id` uuid NOT NULL→`iam.organizations` · `created_by`/`updated_by`→`auth.users` · `created_at` · `updated_at` · `deleted_at` · `version` int · `metadata` jsonb.
- Trigger trio: `_stamp`(`platform._stamp_actor`) · `_touch`(`platform._touch_row`) · `_history`(`platform._version_capture('<token>')`) + `is_versioned=true`.
- Soft delete = `deleted_at` (NULL=live). Toggle = `is_active`. KILL: `user_id`/`owner_id`/`org_id`/`is_deleted`/`status='deleted'`.
- Relationships = rows in `platform.associations`. A new `x_y` junction is a bug.
- Growing vocab = FK into registry (no enum/CHECK arrays). `category`/`role`/`type` → `platform.categories`.
- Visibility = `platform.visibility` enum. Grants = rows in `iam.permissions` keyed on the **token**. RLS via `iam.apply_rls(schema,table,token,variant)` — never hand-write.
- **GATE (complete):** `iam.canonical_certify_ok('<schema>','<table>','<token>')` = `true` (zero FAIL/WARN **and** no broken dependent fns). `iam.verify_canonical(...)` lists every failing check. See §5b.
- Migrated rows carry `metadata.legacy_table` + `metadata.legacy_id`. Retire → `graveyard` (rename, never DROP).
- `SET SCHEMA` is metadata-only: FKs/RLS/indexes/triggers follow; **only function bodies break** → repoint.

## 1. Association direction — CONFIRMED convention
Edge reads **`source → target` = "source belongs-to / is-filed-under / attached-to target"**.
`source` = subject/child/member · `target` = container/parent/classifier.
Verified vs live edges (`fc_card→fc_set`, `note→thread`, `agent→organization`).
"little→big" mostly agrees but is NOT the rule (`org→industry`: big org is source). Semantic belongs-to wins.
**Edge identity** = `(source_type, source_id, target_type, target_id, role)`.
`*_type` is FK-enforced to `entity_types.token` → both endpoints must be registered+active first.

## 2. SOP per M2M collapse
1. Ensure both endpoint tokens registered+active.
2. INSERT into `associations`: set source/target tokens+ids, `organization_id` from source endpoint, `role`/`position`/`label`/`metadata`, `created_by`, plus `metadata.legacy_table`+`legacy_id`.
3. Verify `count(new edges) == count(*) junction` (real `count(*)`, not planner stats).
4. Repoint listed functions (bodies only).
5. Rename junction → `graveyard.<name>`.
6. INSERT `platform.deprecated_relations(old_ref,new_ref,reason)`.
7. Emit team prompt (table dropped · new edge shape · column renames).

## 3. Decisions
| table | verdict | reason |
|---|---|---|
| `research.rs_source_tag` | **GO (T1)** | clean, 0 funcs |
| `research.rs_keyword_source` | **GO (T1)** | clean, 0 funcs, 3023 rows |
| `tool.bundle_member` | **GO (T1)** | 4 funcs |
| `iam.org_industries` | **GO** | 1 row; feeds access funcs (repoint carefully); needs `industry` token |
| `users.user_follows` | **GO (users sweep)** | 0 rows; needs `user` token; whole `users` schema near-empty |
| `tool.binding` | **BLOCKED** | `executor` not canonical (PK=`name`, no `id`, no base cols, unregistered) → canonicalize executor first |
| `public.applet_containers` / `container_fields` | **SKIP** | applet subsystem being phased out |
| `education.flashcard_set_relations` | **DEPRECATE** | legacy (`flashcard_data`/`flashcard_sets`); superseded by `fc_card`/`fc_set` (gate=true). Not a collapse. |
| `iam.industry_curators` / `memberships` / `permissions` | **KEEP** | access-bearing → `iam.permissions` model, never associations |

## 4. Ready specs (map = exact, incl. NULLs)

### 4.1 `research.rs_source_tag` → `research_source → research_tag`  (46 rows · funcs: none)
| assoc col | from | note |
|---|---|---|
| source_type | `'research_source'` | const |
| source_id | `source_id` | |
| target_type | `'research_tag'` | const |
| target_id | `tag_id` | |
| organization_id | `rs_source.organization_id` | lookup |
| role | NULL | |
| label | NULL | |
| position | NULL | |
| created_by | NULL | `assigned_by` is text, not a uuid |
| created_at | `created_at` | nullable→default now() |
| metadata | `{is_primary_source, confidence, assigned_by, legacy_table:'research.rs_source_tag', legacy_id:id}` | drop edge props with NULLs |
| — | drop `id` | surrogate, replaced by assoc id |

### 4.2 `research.rs_keyword_source` → `research_source → research_keyword`  (3023 rows · funcs: none)
| assoc col | from | note |
|---|---|---|
| source_type | `'research_source'` | const |
| source_id | `source_id` | |
| target_type | `'research_keyword'` | const |
| target_id | `keyword_id` | |
| organization_id | `rs_source.organization_id` | lookup |
| position | `rank_for_keyword` | nullable OK |
| role / label / created_by | NULL | |
| created_at | `created_at` | |
| metadata | `{legacy_table:'research.rs_keyword_source', legacy_id:id}` | |

### 4.3 `tool.bundle_member` → `tool → tool_bundle` role=`member`  (88 rows · funcs: create_bundle_with_lister, get_tool_detail, tool_resolve_bundle, tool_resolve_for_request)
| assoc col | from | note |
|---|---|---|
| source_type | `'tool'` | const |
| source_id | `tool_id` | |
| target_type | `'tool_bundle'` | const |
| target_id | `bundle_id` | |
| organization_id | `tool.bundle.organization_id` | lookup |
| role | `'member'` | const |
| position | `sort_order` | default 1000 |
| label / created_by | NULL | |
| created_at | `created_at` | |
| metadata | `{local_alias (if <>''), legacy_table:'tool.bundle_member', legacy_id:{bundle_id,tool_id}}` | composite PK → store both |

### 4.4 `iam.org_industries` → `organization → industry`  (1 row · needs token `industry`)
PREREQ: register token `industry`→`iam.industries`; confirm `industries` passes gate.
Funcs: can_read_processed_document, industry_assign_org, industry_unassign_org, rag_source_has_library_grant.
| assoc col | from | note |
|---|---|---|
| source_type | `'organization'` | const (token exists) |
| source_id | `organization_id` | |
| target_type | `'industry'` | const (REGISTER FIRST) |
| target_id | `industry_id` | |
| organization_id | `organization_id` | |
| role | `'primary'` if `is_primary` else NULL | or `metadata.is_primary` |
| created_by | `assigned_by` | uuid, nullable |
| created_at | `created_at` | |
| metadata | `{legacy_table:'iam.org_industries', legacy_id:{organization_id,industry_id}}` | |
ACCESS CAVEAT: feeds grant resolution (`rag_source_has_library_grant`, `can_read_processed_document`). Repoint to read associations; preserve exact access semantics. Association web stays access-free — this is classification read BY access, not a grant.

### 4.5 `users.user_follows` → `user(follower) → user(following)` role=`follows`  (0 rows · needs token `user` · func: get_user_feed)
Do inside the `users`-schema sweep. 0 rows → no data move; register `user` token, rebuild `get_user_feed`, drop table.

## 5. Blocked / prereqs

### 5.1 `tool.executor` — canonicalize before `tool.binding` (262 rows · 5 funcs)
Base-entity delta (`new col | old col | notes`):
| new | old | notes |
|---|---|---|
| id | (none) | ADD uuid PK `gen_random_uuid()` |
| organization_id | (none) | ADD uuid NOT NULL; backfill `matrx-system` `39c38960-d30c-4840-b0c1-c9960de95582` |
| created_by | (none) | ADD → auth.users |
| updated_by | (none) | ADD → auth.users |
| created_at | created_at | keep |
| updated_at | updated_at | keep |
| deleted_at | (none) | ADD |
| version | (none) | ADD int default 1 |
| metadata | metadata | keep |
| name | name (PK) | DEMOTE to UNIQUE col |
Then: add `executor_id` uuid to `binding`, backfill from `name`, drop `executor_name`; register token `tool_executor`; collapse `binding` → `tool → tool_executor` (`metadata.is_active`, or drop inactive). Funcs to repoint: create_bundle_with_lister, get_tool_detail, tool_register, tool_register_mcp_discovered, tool_resolve_for_request.

## 5b. Toolkit (all re-runnable) — `iam.*` gate + `audit.*` store
**Gate is now COMPLETE — the single source of truth.** `iam.verify_canonical(schema,table,token)` → rows(check_name,status,detail). Checks EVERYTHING: registration; all 9 base cols with type+nullability (`id` uuid, `organization_id` NOT NULL, `created_at`/`updated_at` NOT NULL, `version` int NOT NULL, `metadata` jsonb NOT NULL, `created_by`/`updated_by`); FK targets (org→`iam.organizations`, created_by/updated_by→`auth.users`); `deleted_at` vs `has_soft_delete`; trigger trio (`_stamp_actor`/`_touch_row`/`_version_capture`) vs `is_versioned`; `visibility` = `platform.visibility` enum NOT NULL (conditional on listed/shareable; SKIP for components); legacy kills (`org_id`=FAIL; `user_id`/`is_public`/`is_deleted`=WARN); RLS enabled; canonical policy set; owner short-circuit + `has_access(token)`; sharing-token match; component composition.
- `iam.verify_canonical_ok(...)` → bool (no FAIL).
- `iam.canonical_certify(schema,table,token)` → blocking rows = conformance FAIL/WARN **+ currently-broken dependent fns**. Empty = perfect.
- `iam.canonical_certify_ok(...)` → bool. **The loop's "done" gate.**

**Audit store — `SELECT audit.refresh();` rebuilds every snapshot** (drives the complete gate over all registered live tables + `plpgsql_check` over every plpgsql fn; exclusions from `meta.excluded_schema`):
- `audit.summary` (view) — per table `fails`/`warns`/`certified`. `WHERE NOT certified ORDER BY fails DESC` = hit list.
- `audit.canonical_findings` — every FAIL/WARN (`check_name`,`detail`).
- `audit.broken_functions` — `plpgsql_check` errors (`level`/`sqlstate`/`message`). plpgsql only; SQL-lang not covered.
- `audit.function_deps` — precise fn→object dependency map (from `plpgsql_check`).
- `audit.table_impact(schema,table)` — **PREFLIGHT**: every fn touching the table · `dependency` (precise|text-qualified) · `currently_broken` · exact `referenced_columns[]`. Run before any rename/drop to get the blast radius.
- `audit.m2m_candidates` · `audit.unregistered_candidates` · `audit.stale_registry` · `audit.refresh_log`.
- **Admin UI:** `/administration/canonicalization` (super-admin) surfaces every view/RPC above with sticky-header, filter/sort tables — Overview, Summary, Findings, Broken functions, Function deps, Candidates, Table impact, Verify.

## 5c. Snapshot — 2026-07-01 (COMPLETE gate)
- 199 registered live tables → **9 fully certified · 190 not**. (Old partial gate falsely implied 63 OK — it never checked triggers/FKs/version/metadata/updated_by/org-NOT-NULL. ~800 hidden FAILs.)
- Gate: **1039 FAIL / 242 WARN**. Dependency edges mapped: **1731**.
- Broken fns: **242 distinct** error-level. `42703` column-gone (rename fallout) e.g. `model.class`, `system_function.public_name`. `42P01` table-not-found: 68 rels → 10 MOVED · 14 graveyard · 44 gone.
- M2M candidates: 125 (6 unregistered+payload≤3 = purest). Unregistered: 205 (62 look like entities). Stale registry: 18.
- `fc_card`/`fc_set` = certified true (reference stays perfect under the strict gate).

## 5d. Per-table flip loop — touch once, never return
1. `SELECT * FROM iam.verify_canonical(s,t,tok);` → full fix list.
2. `SELECT * FROM audit.table_impact(s,t);` → every dependent fn + exact columns → blast radius BEFORE editing.
3. ONE migration: canonicalize the table (cols/FKs/triggers, RLS via `iam.apply_rls`) **+ repoint every fn from step 2**.
4. `SELECT audit.refresh();`
5. `SELECT iam.canonical_certify_ok(s,t,tok);` must be `true`. If not → `iam.canonical_certify(s,t,tok)` and fix.
6. Only then touch app/client code. Log to `platform.deprecated_relations` + §6.

## 6. Done log (mirror of `platform.deprecated_relations`)
_none migrated yet_

## 7. Open flags
- RLS disabled on `platform.entity_relationships`, `platform.deprecated_relations` (internal metadata; anon-exposed — decide intentionally).
