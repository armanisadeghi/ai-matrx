# Database Base Standards & Architecture Decisions

_Status: working draft — best-practices design agreed before mapping to the real schema. Multi-tenant, vector-heavy, enterprise app._

---

## 1. Base tiers — 3 bases + composable traits

Three bases cover ~99% of tables; their **lifecycles** differ enough to justify separation. Optional traits add consistency only where it's meaningful.

### Base 1 — Standard Entity (the workhorse, ~80% of tables)
Real business objects (users, orders, documents, agents, conversations…).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` (UUIDv7 preferred) | Sequential-ish UUIDs avoid index fragmentation at scale. |
| `org_id` | `uuid NOT NULL` (FK→org) | **The single tenancy key.** See §2. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | Always `timestamptz`. Trigger-enforced. |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | Trigger-enforced, never trusted from app. |
| `created_by` | `uuid` (FK→user), nullable | Actor. Null = system/migration. |
| `updated_by` | `uuid` (FK→user), nullable | Last actor. |
| `deleted_at` | `timestamptz` null | **Soft delete (hard requirement).** Null = live. Partial index `WHERE deleted_at IS NULL`. |
| `version` | `int NOT NULL DEFAULT 1` | **Optimistic lock + versioning anchor (hard requirement).** Trigger-incremented. |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | Unstructured extension escape hatch. |

Composite PKs allowed where a natural key fits; single surrogate `id` is the default.

### Base 2 — Join / Association (lean + audit)
Pure M2M links (project_id/task_id relationships are becoming M2M and live here).

| Column | Include | Notes |
|---|---|---|
| `id` | optional (lean toward keeping) | Makes links API/ORM-addressable & log-friendly. |
| `a_id`, `b_id` | yes | Two FKs + UNIQUE on the pair. |
| `org_id` | yes | Carries tenancy for uniform RLS. |
| `created_at` | yes | "When was the link made" is always asked later. |
| `created_by` | yes | "Who linked these" — audit/permissions. |
| `metadata` | optional | Only if the relationship carries data. |
| _omit_ | `updated_at`, `updated_by`, `version`, `deleted_at` | A link exists or is deleted; mutating it is a smell (delete+insert). |

**Rule:** a "join" table with real attributes + lifecycle (e.g. `membership` with a `role`) is **not** a join — it's a Base 1 entity with two FKs. Treat as Base 1.

### Base 3 — Append-only / Event / Ledger (immutable)
Audit logs, events, webhook deliveries, state transitions, ledger entries — and the **version history table itself**.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` identity or UUIDv7 | Insert-heavy; ordering matters. |
| `org_id` | `uuid NOT NULL` | Tenancy + retention scoping. |
| `occurred_at` | `timestamptz` | When the event happened. |
| `recorded_at` | `timestamptz DEFAULT now()` | When we wrote it. |
| `actor_id` | `uuid` | Who/what caused it. |
| `event_type` | `text`/enum | Discriminator. |
| `payload` | `jsonb` | Event body. |
| _omit_ | `updated_at`, `updated_by`, `version`, `deleted_at` | Immutable by definition. Never versioned. Often **partitioned by time**. |

### Composable traits (opt-in, on top of Base 1)
Add consistency only where semantically meaningful — keeps the base lean.
- `_trait_nameable` → `name` (primary human label), `description`, optional `slug`.
- `_trait_searchable` → generated `search_tsv tsvector` (for hybrid search).
- `_trait_ownable` → `owner_id` (responsible user, distinct from `created_by`).

**Naming convention:** standardize on `name` + `description`. Reserve `label` for short tag/badge use only (avoids `name` vs `label` ambiguity). Do **not** force name/description onto every table (joins/events have no meaningful label).

---

## 2. Identity hierarchy decision — RESOLVED

**Decision: user-first for identity & UX; org-first for data ownership. `org_id` is the single tenancy key.**

Separate three concepts that were being collapsed:
- **Principal/identity** = user (the actor).
- **Tenancy boundary** = org (the data-ownership container).
- **UX surface** = the "home for the user" feeling.

Rules:
- Every Base 1 / Base 3 / join row carries **one** tenant column: `org_id NOT NULL`.
- An org is **any** tenancy boundary: `org.type ∈ {personal, business}`. Personal signup auto-provisions a personal org (org-of-one — the Notion/Slack/Linear/GitHub pattern). _Already done today — keep it._
- **No separate `tenant_id`.** `org_id` *is* the tenant key. One column → one uniform RLS predicate (`org_id ∈ my memberships`).
- **User is never the tenancy key.** It breaks on sharing, transfer, and offboarding. User appears as `created_by`/`updated_by` (actor) and optionally `owner_id` (responsible human).
- The "home for the user" feeling is a **view-layer** truth: UX aggregates across all orgs a user belongs to (personal + business). Storage stays org-scoped.
- Membership stays user→many-orgs via a membership table (also gives small-business owners multi-org management for free).

---

## 3. Versioning — RESOLVED (hard requirement, always on for Base 1)

**Decision: generic JSONB history table + capture-on-every-write (including first insert), via one shared trigger. Reject the typed shadow schema.**

Rationale across the three considered options:
- **Generic JSONB table + every-write discipline (CHOSEN):** the classic universal audit-trigger pattern (`history.row_versions`). One trigger function, one line per table, `to_jsonb(NEW)` snapshots. Schema drift is a non-event (jsonb absorbs new columns). Matches the "never fails" experience.
- **Typed shadow schema (REJECTED):** clean until the first `ALTER TABLE` — every schema change must be mirrored or the trigger breaks. Fails the "never think about it again" goal.
- **Capture-on-every-write is the discipline, not a storage choice** — folded into the chosen approach (the first INSERT is versioned, which most setups get wrong).

History table (this is a Base 3 table):
```sql
CREATE TABLE history.row_versions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  text        NOT NULL,
  row_id      uuid        NOT NULL,
  org_id      uuid        NOT NULL,      -- RLS + targeted retention/erasure
  version     int         NOT NULL,      -- mirrors main row's version column
  operation   text        NOT NULL,      -- INSERT | UPDATE | DELETE/SOFT_DELETE
  row_data    jsonb       NOT NULL,      -- full snapshot of NEW (minus heavy cols)
  actor_id    uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (occurred_at);
```

Rules:
- **Full snapshots, not diffs** (store-too-much-and-prune preference). Trivial point-in-time reconstruction; prune via partition drops.
- **Main row `version` is source of truth;** `_touch` trigger increments it, history records the same number → lockstep.
- **One generic trigger handles INSERT/UPDATE/DELETE** (`TG_OP`, `TG_TABLE_NAME`).
- **Exclude heavy/derived columns from snapshots:** `row_data := to_jsonb(NEW) - 'embedding' - 'search_tsv'` (and other generated cols). Critical with vectors.
- **Versioning scope:** Base 1 = always on; Base 3 = never (it *is* the log); joins = optional/off by default.
- **Partition by time** for cheap retention and a small hot index.
- **Per-table opt-out switch** for extreme-churn tables (write amplification).
- **GDPR / right-to-erasure:** history retains deleted PII by design → retention policy + targeted purge by `org_id`/user on erasure request.

---

## 4. Vectors — embedding sidecar pattern (NOT a base column)

**Do not put a raw `vector` column in the universal base** (dims vary by model, bloats every row + every history snapshot, not all entities are embedded, re-embedding on model change). Standardize a sidecar instead:

```sql
CREATE TABLE embeddings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  source_table text NOT NULL,
  source_id    uuid NOT NULL,
  chunk_index  int  NOT NULL DEFAULT 0,   -- long content → many chunks
  content_hash text NOT NULL,             -- skip re-embedding unchanged content
  model        text NOT NULL,             -- name + version
  dim          int  NOT NULL,
  embedding    vector NOT NULL,           -- or halfvec at scale
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

Why sidecar: multiple embeddings per row (multi-model, multi-field, chunked content); `content_hash` avoids re-embedding; `model`/`dim` enable side-by-side model migration & cutover.

Considerations:
- **HNSW over IVFFlat** (pgvector ≥0.5): better recall/latency, no training. Match op-class to distance (`vector_cosine_ops`, etc.).
- **Hybrid search (vector + lexical)** is best practice → standardize optional generated `search_tsv` (the `_trait_searchable` trait); combine via RRF/weighting at query time.
- **`halfvec`/quantization** ~halves storage at volume.
- **HNSW dim limit ~2000** — large-model embeddings may need dimensionality reduction to stay indexable.
- **Keep embeddings out of version history** (see §3 exclusion rule).

---

## 5. Implementation pattern — making the base enforceable

`CREATE TABLE x (LIKE _base_entity INCLUDING ALL)` copies columns/defaults/constraints/indexes — **but NOT triggers or RLS policies.** So "create a Base 1 entity" = four steps:
1. `LIKE _base_entity INCLUDING ALL`
2. Attach `_touch` trigger (`updated_at`, `version++`)
3. Attach `_version_capture` trigger (writes to `history.row_versions`)
4. Enable RLS + standard org policy (`USING (org_id ∈ my memberships AND deleted_at IS NULL)`)

Wrap in a `create_entity_table()` helper proc / migration template, **plus a CI lint** that fails any new entity table missing the four. That combo — `LIKE` + shared triggers + RLS template + CI check — is what makes the base enforceable rather than aspirational.

Shared trigger sketches:
```sql
-- updated_at + version
CREATE OR REPLACE FUNCTION _touch_row() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.version := OLD.version + 1; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```
`created_by`/`updated_by` sourced from a session var (`current_setting('app.user_id')`) set by the connection layer — same source that feeds RLS.

Avoid Postgres true table `INHERITS` (leaky: FKs/uniques/PKs don't propagate). Only legit use = declarative partitioning for Base 3.

---

## 6. Schema organization & the "table bloat" problem — RESOLVED

### Root cause: bloat is a genericity problem first, a schema problem second
A feature's "satellites" (versions, associations, invitations) must **not** be per-feature tables:
- **Versions** → already one generic `history.row_versions` for the whole system (§3). No `*_versions` tables exist.
- **Associations** → universal M2M = one generic association table (today `ctx_associations`). Not one per entity.
- **Invitations** → make it generic too: one `iam.invitations` keyed by `(org_id, target_type, target_id, role)`. No `project_invitations`/`task_invitations`/etc.

Result: a 4-core-table feature stays ~4 tables. The ballooning stops at the source. The big boys run a few universal cross-cutting tables serving every feature, not 5 tables per feature.

### Move from prefixes (`ctx_`) to real schemas, organized by bounded context
Prefixes are a poor-man's namespace (cosmetic). Schemas add hard boundaries: cleaner names, per-schema grants, per-schema API exposure, `search_path`, movable domains.

**Organize by domain (bounded context), NOT by table type.** Proposed map:
```
iam        → orgs, memberships, profiles, invitations, roles        (identity/access)
knowledge  → scope_types, scopes, attributes, attribute_values      (today's ctx_* core)
work       → projects, tasks, boards
platform   → associations (universal M2M)              ← cross-cutting infra
history    → row_versions (generic)                    ← infra, NOT API-exposed
internal   → system config, feature flags              ← NOT API-exposed
```
Rules:
1. Domain schemas hold the **core entities you want to see**. Clean names, clear ownership, future service-split path.
2. Cross-cutting infra gets its own schemas; the non-client ones (`history`, `internal`) are simply **not added to Supabase's exposed-schema list** → invisible to API *and* out of the working table list. Security win = bloat win, one action.
- Target ~5–9 schemas total. Don't over-fragment (schema-per-table just recreates the prefix mess).

### Supabase-specific tradeoffs (eyes-open, all manageable)
- PostgREST exposure is per-schema; `public` exposed by default, others must be added. This is a *feature* for `history`/`internal`. If a custom API tier fronts the DB, moot.
- Realtime/Storage/dashboard support non-`public` schemas but `public` is the trodden path — occasional "set the schema" friction.
- Cross-schema FKs + RLS work fine. Leave `auth`/`storage`/`realtime`/`vault` (Supabase-managed) alone.

### Ties into unified RLS (the tasks-table policy, universalized)
One canonical, org-first policy applied identically across every domain schema, via a single cached membership function:
```sql
create function iam.has_org_access(target_org uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from iam.memberships m
    where m.org_id = target_org and m.user_id = (select auth.uid())
  );
$$;
-- canonical policy on every Base 1 table, every schema:
using ( iam.has_org_access(org_id) and deleted_at is null )
```
Perf rules at scale: wrap `auth.uid()` in `(select …)` for init-plan caching; keep membership a `stable security definer` function. Org-first by construction → kills the legacy user-first RLS problem.

---

## 7. UUIDv7 — DEFERRED
Out of scope for this migration (not worth another wrinkle while rebuilding the core). Stay on `gen_random_uuid()` (v4). Revisit when Supabase ships PG18 (native `uuidv7()`); if adopted later, wrap in an `app_id()` function so the swap is one line.

---

## Open items / to confirm against real schema
- [ ] Map existing tables → Base 1 / 2 / 3 (flag Base 3 masquerading as Base 1, and "joins" that are really entities).
- [ ] Confirm org/membership model matches §2; introduce `org.type` if absent.
- [ ] Confirm prefix→schema migration: map every `ctx_*`/prefixed table to a bounded-context schema; identify legacy tables to drop.
- [ ] Make invitations generic (`iam.invitations`), matching generic versioning + universal M2M.
- [ ] Audit user-first vs org-first: which tables lack `org_id`, which use `user_id` for ownership, which RLS policies key on `auth.uid()` directly.
- [ ] Inventory embedding models/dims in use → finalize `embeddings` sidecar + index strategy.
- [ ] Migration path for adding base columns + triggers + RLS to existing tables.
