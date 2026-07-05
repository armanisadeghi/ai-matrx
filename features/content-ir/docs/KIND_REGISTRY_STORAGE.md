# Kind Registry — Storage Design (v4 — anchor LIVE)

**Status:** all three SQL surfaces are LIVE and canonical — `content_ir.kind_definition` (table), `content_ir.kind_definition_version` (view over `history.row_versions`), `content_ir.kind_edge` (table) — provisioned via `platform.create_entity_table` (passed `verify_canonical`). Column shapes verified live against this doc + Agent A's transform/harness (they mate 1:1). Naming: **`kind_definition`**, not `definition` (a bare `definition` collides with `agent.definition` in the `shareable_resource_registry` verify check). `flexible_data` is untouched (Agent A's transform). Remaining (non-SQL, db-agent lane): PostgREST exposure of `content_ir`, db-types regen, aidream `db/generate.py`. Agent A's pure pieces are landed + tested: the `flexible_data → {data[], kind_edge[]}` transform (`registry/kind-storage-transform.ts`, round-trip proven) and the dual-gate harness (`registry/kind-dual-gate.ts`). Next: the migration driver + the `schema-source-kind-tables.ts` read adapter (both now unblocked).

**Two canonical corrections from the DB build (better than v3's assumptions):**
1. **Versioning is central, not per-table.** `platform.create_entity_table` wires a `_version_capture` trigger that snapshots the whole row (incl. `emitted_*`, `sample_data`, `is_active`) into **`history.row_versions`** on every change. There is **no** hand-built `kind_definition_version` table — the version surface is a **view** over `history.row_versions` scoped to the token. No dual-write; append-only is inherent (moots v3's "append-only grants" concern).
2. **`definition` is an unusable table name here** → `kind_definition` (token stays `content_ir_kind`; `kind_definition.kind` also reads better).

Decision unchanged: **Option B** — jsonb ordered-array `data` document + relational edge table; emission stays in the TS emitter; DB stores SSOT + caches emitted output. Registry scope, dual-gate law, and the real `data` vocabulary (§2/§4) are unaffected by the versioning correction.

**The load-bearing law (Arman):** *a kind is only real if it passes BOTH systems.* Every kind — whatever its authoring owner — must (1) validate structurally against Pydantic (strict) and (2) render correctly through the UI. Fail either and it is caught, flagged (Error Inspector, `content-ir` source), and blocked from production. Owner = who authors; the **dual gate** = what makes a row live. Both necessary, neither sufficient alone. This subsumes the parity screamer and is the real anti-drift guarantee (see §2).

---

## 1. What's now resolved

| Q | Resolution |
|---|---|
| Q1 emission reachability | Reframed: anti-drift law = **one authoring *owner* per kind + parity screamer**, not one language. Two catalogs (see §2). |
| Q2 re-emit cascade | Frozen-closure emitted artifacts + **cascade-refresh through unpinned edges** (see §3). Recommended; Arman deferred. |
| Q3 runtime pinning | **Required.** Old consumers keep old behavior. Two pin locations, both real (see §3). |
| Q4 version.edges snapshot | Keep it — records which children/pins were in force at version-cut time. |
| Q5 schema name | Agent A's call. `content_ir` proposed. |
| Q6 category | `category_id` was only a "this-row-is-content_ir" tag inside shared `flexible_data`. **Dropped.** The meaningful discriminator is `authoring_owner` (§2). Soft grouping categories can be added later if ever needed. |

---

## 2. Authoring ownership + the dual gate (the anti-drift model)

Two orthogonal rules, both enforced:

**Rule 1 — one authoring owner per kind.** Not "one language emits everything." Two catalogs:
- **Display/render kinds** (flashcard, quiz, rendered results): **TS/content-ir owns.** SSOT is the ordered `data` array; `emitted_*` is derived by the one TS emitter (`kind-to-json-schema.ts`). Python **reads** the materialized surface and never authors these via a parallel path.
- **Workflow node I/O kinds:** **Python owns.** SSOT is the Pydantic model (upstream). content_ir holds the materialized `emitted_*` mirror for TS to read; Python **publishes** that mirror from its own native emit (it does **not** round-trip through Next.js to emit a node schema — that would invert the truth).

Mechanism: an `authoring_owner` column (`'ts' | 'python'`) on `kind_definition`. Arman's "Python could call Next.js" stays a **rare escape hatch** for the case where Python ever authors a *display* kind — it must never become the node-schema path.

**Rule 2 — the dual gate makes a kind live (Arman's law).** Ownership decides who writes; it does NOT decide validity. A row becomes `is_active` only when its canonical `sample_data` passes **both**:
- **Structural (Pydantic):** the emitted schema is expressible as a strict Pydantic model AND the sample validates under it. Catches shapes Python can't represent.
- **Render (UI):** the sample, fed `content-ir parse → kind-route → component`, renders through its real component — never the raw/fallback path.

This is why "each owns and validates their own" and "nothing works unless it passes both systems" are not in tension: the owner authors + validates natively (necessary), and the *other* system's gate is also required (necessary). The dual gate replaces the old one-sided parity screamer:
- `ts`-owned: `emitted_* == TS-emit(data, edges)` (and `== compiled system-kinds.ts` for system kinds) **AND** the dual gate passes.
- `python`-owned: `emitted_* == Pydantic-emit(model)` **AND** the dual gate passes.

Any failure is loud (Error Inspector, `content-ir` source) — the row stays/returns `is_active = false` and never ships. Enforced continuously (CI parity job + on every author write), not just at creation.

Key asymmetry: content_ir is the **authoring SSOT** only for `ts`-owned rows; for `python`-owned rows it is a **materialized read mirror** (SSOT upstream in Pydantic), so those rows may have `data = null` with populated `emitted_*` + `sample_data`.

---

## 3. Emission, versioning & pinning (recommended — resolves Q2/Q3/Q4)

Emitted schemas are **frozen, self-contained closures** (matches the current sample, which inlines children under `$defs`). This is forced by Q3: a pinned consumer must be able to read a fully self-contained old shape.

- **`kind_definition.version`** tracks a kind's **own** shape edits (its `data` + its own edges). Writing the row fires the canonical `_version_capture` trigger, which snapshots the full row into **`history.row_versions`** — the immutable version record (no separate snapshot table, no dual-write).
- **`kind_definition.emitted_*`** is a **derived cache** on the LIVE row: the kind's current shape resolved against its children — current children through **unpinned** edges, pinned versions through **pinned** edges.
- **The frozen closure** = the `emitted_*` captured in `history.row_versions` at the moment a version was cut. Immutable by construction (history is append-only). Pinned consumers read it through the `content_ir.kind_definition_version` **view** over that store.

**Harness implication (Agent A):** the dual gate cannot "validate at cut-time and write the result onto a frozen version row" — history rows are immutable. Instead: run the gate, set `is_active` (+ any validation state) on the **LIVE** `kind_definition` row; the `_version_capture` trigger snapshots *that* state into `history.row_versions`. Pin resolution then reads the frozen `emitted_*` from the version view. Correct ordering: emit → gate → write live row (trigger snapshots) — never a post-hoc history mutation.

**Cascade (Q2 — confirmed, Agent A):** when kind C's own shape is edited (new version cut), walk `content_ir.kind_edge` **in reverse (parents) through unpinned edges only**, refreshing each ancestor's `emitted_*` cache **in place — no version bump**. A pinned edge terminates the walk (it stays frozen to its pinned child version). A child change never bumps ancestors' versions; it only refreshes their derived cache. Registry is small → cheap.

Two constraints on the cascade (emitter territory):
- **The cascade IS the emitter, re-run.** Refreshing an ancestor = re-running the *same* TS emitter through unpinned edges — never a second resolution code path (that would be a parallel emitter, the exact drift the design forbids). "Cascade" is just `for each unpinned ancestor: emitted_* = TS-emit(data, edges)`.
- **Visited-set termination.** The reverse walk carries a visited `definition_id` set so a self-loop (`flashcard→flashcard`) or any cycle terminates. (Indirect cycles are already blocked at write time by the recursive-CTE guard in §4; the visited-set is the belt-and-suspenders at emit time.)

Note: an ancestor's **live** `emitted_fingerprint` is *expected* to change when a floating child moves — the resolved closure genuinely changed. Fingerprint stability is not a goal for live rows; consumers who need a stable shape **pin** and read the frozen `emitted_*` via the version view.

**Two pin locations, both real (Q3):**
- **Kind→kind:** `kind_edge.pinned_child_version`. E.g. a user's kind embeds system `flashcard_set@3` and doesn't break when `@4` ships. Cascade skips these.
- **Consumer→kind:** an agent/skill *outside* content_ir stores `kind@version` and reads the frozen `emitted_*` from the `kind_definition_version` view. This is Arman's case (agents with old instructions keep old behavior). Lives on the consumer side, not in content_ir. *(v1: the version view is `service_role`-only — client-facing, org-scoped version reads are a later RPC; v1 harness reads the live `emitted_*` only, pinning deferred.)*

---

## 4. Schema & tables

Schema `content_ir`. Provisioned through the canonical `platform.create_entity_table` (variant `system`) — NOT hand-rolled DDL — so base/audit columns (`organization_id`, `created_at/by`, `updated_at/by`, `deleted_at`, `metadata`, `version`, `visibility`), GIN indexes, `entity_types` token registration, the actor/touch/`_version_capture` triggers, and `iam.apply_rls` all come for free and self-verify via `verify_canonical`. Only the design-bearing columns are listed.

### `content_ir.kind_definition` — live kind (LIVE) — token `content_ir_kind`
```
kind          text  not null         -- the __kind token (was slug)
label         text  not null
authoring_owner text not null default 'ts' check (authoring_owner in ('ts','python'))
data          jsonb                   -- ordered array; SSOT for ts-owned. NULL allowed for python-owned
sample_data   jsonb                   -- canonical instance; the fixture BOTH dual-gate checks consume (migrated from the old "Sample Block Data")
emitted_block_schema jsonb            -- materialized read surface (with __kind)
emitted_json_schema  jsonb            -- materialized read surface (plain, no __kind)
emitted_fingerprint  text             -- drives parity/drift screamer
is_active     boolean not null default false  -- the dual gate: TRUE only once sample passes Pydantic + render (Arman's law)
-- + canonical base: id, organization_id, version, visibility (default 'private'), created/updated/deleted, metadata
unique (organization_id, kind)
check (authoring_owner <> 'ts' or data is not null)
```
*Validation detail (which gate failed) is NOT an on-row column in v1 — it lives in the Error Inspector (`content-ir` source) + the harness; `is_active` is the single production gate. If the admin surface later wants on-row detail, add `validation_status`/`validated_at` then.*

### `content_ir.kind_definition_version` — version surface (VIEW, not a table)
A **view** over `history.row_versions` filtered to the `content_ir_kind` token. The `_version_capture` trigger snapshots the full `kind_definition` row (incl. `data`, `sample_data`, `emitted_*`, `is_active`) on every INSERT/UPDATE/DELETE — so history is automatic, immutable, and append-only with no separate table and no dual-write. Pinned consumers read frozen `emitted_*` here. v1 grant: `service_role` only (client-facing org-scoped reads = later RPC).

### `content_ir.kind_edge` — kind→kind reference graph (LIVE; relational, FK-enforced)
```
id                   uuid pk
parent_definition_id uuid not null -> content_ir.kind_definition(id) on delete cascade
field_name           text not null   -- the ref field PATH in parent.data (dot-notation into inline_objects)
child_definition_id  uuid not null -> content_ir.kind_definition(id) on delete restrict
pinned_child_version int             -- nullable; null = float to current. Cascade skips when set.
position             int             -- nullable; union (anyOf) ordering on one field
unique (parent_definition_id, field_name, child_definition_id)
```
RLS intent: an edge is a derived projection of its parent kind's `data` (no independent secret), so it should be readable/writable exactly when its parent kind is — the `component` variant deferring to the parent via `platform.entity_relationships` if that path is clean, else mirror the parent's org/visibility under variant `system`. DB agent's call.

Self-reference (`flashcard.children → flashcard`) = a row where parent and child resolve to the same kind; FK satisfied because the row already exists. Direct self-loops allowed; a recursive-CTE guard flags indirect cycles (`A→B→C→A`).

### `data` element shape — the REAL vocabulary (locked to `FieldSchema`)

The `data` array element is exactly the consumed `FieldSchema` (`core/kind-schema.types.ts`) **plus `name`, minus any ref target** (targets externalize to `edge`). This is the "one shape" win of Option B: storage ≈ the type the emitter/parser already consume, so the adapter just re-orders + re-attaches targets. **Do NOT invent a `ref`/`cardinality` vocabulary** — the earlier draft's `ref` was illustrative and would diverge from the emitter.

```json
{ "name": "title",     "type": "string",   "required": true }
{ "name": "resources", "type": "string[]", "nullable": true }
{ "name": "difficulty","type": "enum",     "values": ["easy","hard"] }
{ "name": "author",    "type": "object",   "required": true }        // SINGLE ref → target in `edge`
{ "name": "solutions", "type": "array",    "required": true }        // ref ARRAY → target(s) in `edge`, ordered by edge.position
{ "name": "problem_statement", "type": "inline_object", "required": true, "fields": [ … ordered … ] }
```

Full `FieldSchema` type set is preserved verbatim: scalars (`string|number|boolean`), scalar arrays (`string[]|number[]|boolean[]`), `record`+`values`, `enum`+`values`, `union`+`scalars`, `inline_object`+`fields`, and the two **ref** carriers — `object` (single) and `array` (many). Rules:
- **Refs carry NO target in `data`.** `object`→ one `edge` row `(parent, path, child)`; `array`→ N `edge` rows (union) ordered by `edge.position`. The adapter re-attaches `object.kind` / `array.itemKinds` from `edge` on read. `edge` is the single source of truth for the ref graph (so cascade/pinning see every dependency).
- **`inline_object` is structural** — its `fields` is an ordered array, it never gets `__kind`, never becomes a registry row. But a ref *inside* an inline_object is still a real kind→kind dependency, so it still gets an `edge` (see path note below).
- Order is intrinsic to the jsonb array (fixes the key-reorder bug); the emitter walks fields in this order, so both `properties` and the `required` array emit in field order.
- `nullable`→ emitter renders `type:[x,"null"]` / nullable `anyOf`; `__kind` is injected by the emitter, never stored.

---

## 5. Locked principles (unchanged from v1)

1. **One TS emitter** for `ts`-owned kinds; DB never emits (no SQL-view emission). The cascade reuses this emitter — never a second resolver. 2. **Materialize** `emitted_*` on write, not per-read. 3. **Dual gate = production admission (Arman's law):** `is_active` flips true only when `sample_data` passes both Pydantic-strict AND UI-render; failure is loud (Error Inspector, `content-ir`) and holds the row out of production. Runs continuously (CI + on author write), for both owners. 4. **Loud consistency guard:** every `type:"ref"` field has ≥1 matching `edge`, and vice-versa. 5. **Visibility:** `unique(organization_id, kind)`; system kinds under `iam.system_orgs.global_readable = true`. Provisioned via `platform.create_entity_table` variant `system` (the `ai_model`/`ai_provider` catalog posture: versioned, cross-org-readable) — which auto-registers the `content_ir_kind` token in `platform.entity_types` and applies `iam.has_access`-backed RLS; no hand-wired policies. 6. **Bootstrap tier stays:** compiled `system-kinds.ts` = offline floor; tables = warm source behind `schema-source-kind-tables.ts`; facets stay in code. 7. **Leash is storage-agnostic:** the screamer validates compiled schemas regardless of storage.

---

## 6. Agent A decisions (LOCKED)

**A. Registry scope — one registry, two owners (as the target shape; phased).** content_ir physically holds **both** catalogs in `content_ir.kind_definition`, split by `authoring_owner` — one read surface, one dual gate, one resolution path (Agent B's "one shared read surface"). *Phasing:* **v1 provisions the full shape but populates `ts`-owned display kinds only** (the flexible_data graduation). `python`-owned node-I/O mirroring is **Phase 2, Agent B-driven** — Python *publishes* its Pydantic-emitted schema into the mirror; it never round-trips through Next.js to emit. The column + contract exist from day one, so Phase 2 is data, not a migration. This commits to the unified endgame without blocking on the workflow catalog.

**B. Schema name — `content_ir` (dedicated).** Confirmed. Cohesive namespace, clean PostgREST exposure control, won't crowd `platform`. Provision carries the full reorg checklist: `GRANT USAGE` on the schema to the app roles, add to `pgrst.db_schemas`, add to the db-types schema list (`pnpm db-types`), and every access goes through `.schema('content_ir')` (+ the `schema-source-kind-tables.ts` chokepoint).

**C. Emission/cascade — confirmed** (see §3, now with the two emitter constraints: cascade reuses the one emitter; visited-set cycle termination; live fingerprints float, pinned consumers read frozen versions).

---

## 7. Migration

1. **Provision** `content_ir` (3 tables + RLS via `iam.apply_rls` + `entity_types` `kind` token) — PostgREST checklist per §6B; ledger + `pnpm db-types` + aidream `db/generate.py`.
2. **Adapter** `schema-source-kind-tables.ts` behind the existing lint-enforced seam.
3. **Data-migrate `flexible_data`** — Block Schemas → ordered `data` array + edge extraction; **Sample Block Data → `sample_data`** (the two old category rows fuse into one kind row); `authoring_owner='ts'`.
4. **Run the dual gate** on every migrated row → set `validation_status` + flip `is_active` only on pass. Any legacy row that fails is surfaced loudly, not silently shipped (expected: the flashcard_set slug collision + the `additionalDetails`-less quiz rows noted in UNIFICATION_STATUS get caught here).
5. **Parity-verify** (DB defs == compiled `system-kinds.ts`; full suite green) → **cut over** the registry source → **drop** the `flexible_data` category usage. Idempotent + reversible until the drop.

`python`-owned rows are **not** part of this migration — that catalog lands in Phase 2 (§6A).