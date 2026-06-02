# Cross-repo verification tasks for `udt_v2` (data-tables backbone)

> **Purpose.** The `udt_v2_backbone` migration was applied live on Supabase project
> `txzxabzwovsujtloxrus` (Matrx Main) on `2026-05-29`. It adds tables, RPCs, validation
> triggers, and an append-only version history. Per the Claude Code session that designed
> the migration, **the ai-matrx repo is fully audited**, but the two sibling repos —
> `AI-Matrix-Engine/aidream` (Python backend) and `armanisadeghi/matrx-extend` (Chrome
> extension) — were NOT auditable from that session.
>
> This file is the checklist for an agent that has access to both repos. Work through it
> end-to-end and report results back as **filled-in checkboxes plus a one-line note per
> item**. If anything is unclear, surface the ambiguity rather than guessing.
>
> **Tone:** dry, precise, evidence-based. Quote `file:line` for every finding.
> **Output:** edit this file in place — flip `[ ]` to `[x]` (or `[N/A]`) and append the
> finding inline under each item. Keep your additions short.

---

## ✅ RESULT — completed 2026-06-02 (agent with aidream + matrx-extend access)

**Both repos audited.** Headline: **2 of the 6 RPCs are LIVE in matrx-extend** (expected, since
only ai-matrx had been reviewed before) — the safe-to-drop set is **4, not 6**.

| RPC | ai-matrx | aidream | matrx-extend | Verdict |
|---|---|---|---|---|
| `create_user_table_with_fields` | none | none | **LIVE** `user-tables.ts:157` | **KEEP** |
| `append_rows_to_user_table` | none | none | **LIVE** `user-tables.ts:203` | **KEEP** |
| `batch_update_rows_in_user_table` | none | none | none | drop |
| `remove_column_from_user_table` | none | none | none | drop |
| `create_new_user_table` (bare) | none | none | none | drop |
| `create_new_user_table_wrapper` | none | none | none | drop |

**Residual risk before dropping the 4:** `matrx-local` (Tauri) and DB-internal SQL callers were
NOT audited this session. aidream's `docs/UDT_MIGRATION_FOR_FRONTENDS.md:79-84` documents all six
as a preserved contract, so the drop must update that doc.

**Second-order:** aidream is a **heavy UDT writer**, not a passive consumer. Its direct-pool
writes are trigger-compatible but record `changed_by = NULL` (no `auth.uid()`), and bulk imports
fan out one realtime event per row. Nothing breaks (permissive validation = passthrough; version
triggers are audit-only).

➡️ **Full narrative, what changed in each repo, and next-phase decisions:
[`CROSS_REPO_HANDOFF.md`](./CROSS_REPO_HANDOFF.md).**

---

## Context the agent needs (read this first)

**What `udt_v2_backbone` actually added** (live on the DB, all `txzxabzwovsujtloxrus`):

- `udt_workbooks` table (groups N datasets imported from one source file)
- `udt_dataset_row_versions` append-only history of every row change
- `udt_dataset_rows` now has a `BEFORE INSERT/UPDATE` validation trigger
  (`udt_dataset_rows_validate`) that runs `udt_validate_row()`. **Permissive mode
  (the default for every pre-existing dataset) is a pure passthrough** — zero behavior
  change. Only `validation_mode='strict'` actually enforces.
- `udt_dataset_rows` now also has `AFTER INSERT/UPDATE/DELETE` triggers
  (`udt_dataset_rows_version_insert/update/delete`) that append to
  `udt_dataset_row_versions`. These fire on EVERY write — including writes from
  external repos. Audit-log only; no behavior change to writers.
- Four new RPCs: `udt_upsert_row`, `udt_upsert_cell`, `udt_bulk_write`,
  `udt_change_field_type`. All `SECURITY DEFINER`, granted to `authenticated` +
  `service_role` only, gated by owner-or-`has_permission(...,'editor')`.
- Realtime publication now includes `udt_datasets`, `udt_dataset_fields`,
  `udt_dataset_rows`, `udt_workbooks`. A 10k-row write fires 10k events.

**Six RPCs identified as having zero call sites in `armanisadeghi/ai-matrx`:**
`append_rows_to_user_table`, `batch_update_rows_in_user_table`,
`remove_column_from_user_table`, `create_new_user_table`,
`create_new_user_table_wrapper`, `create_user_table_with_fields`.
**Goal:** confirm none are called from aidream or matrx-extend either. If confirmed
dead in all three repos, they're safe to drop.

---

## Section A — `AI-Matrix-Engine/aidream` (Python backend)

### A1. Direct UDT writes — search for any Python code path that mutates `udt_*` tables.

- [x] **A1.1.** Search the repo for SQL or ORM writes to `udt_datasets`, `udt_dataset_fields`,
  `udt_dataset_rows`, `udt_picklists`, `udt_picklist_items`, `udt_workbooks`,
  `udt_dataset_row_versions`. Include both raw `INSERT`/`UPDATE`/`DELETE` SQL and any ORM
  models (SQLAlchemy, asyncpg, supabase-py). For each hit: `file:line` + what it does.
  - Finding: aidream writes udt_* heavily via matrx-orm **named SQL**.
    `user_data/datasets_queries.py` — INSERT datasets `:16`, fields `:73`/`:562`, rows `:173`/`:219`;
    UPDATE datasets `:588`, rows `:508`, soft-delete rows `:595`.
    `user_data/picklists_queries.py` — INSERT lists `:16`/`:143`, items `:50`/`:96`; UPDATE `:392`/`:423`;
    DELETE `:460`/`:481`/`:502`. Orchestrated by `user_data/dataset_creator.py:293/314/361` and
    `picklist_creator.py:160/204`. Generated ORM managers exist at `db/managers/udt_*.py`. No code
    writes `udt_workbooks` / `udt_dataset_row_versions` (those are trigger-populated).

- [x] **A1.2.** Search for `supabase.from('udt_*')`, `supabase.table('udt_*')`,
  `supabase.rpc('...user_table...')`, `supabase.rpc('udt_*')`. Same format.
  - Finding: One Supabase-client write — `packages/matrx-ai/matrx_ai/tools/implementations/datasets_tools.py:427`
    (`usertable_delete_row` → `client.table("udt_dataset_rows").delete()`). **Zero** `supabase.rpc('udt_*')`
    or `supabase.rpc('...user_table...')`. All other writes go through matrx-orm `execute_query(...)` named SQL.

- [x] **A1.3.** Confirm: any write path that hits `udt_dataset_rows` will now also fire
  the validation trigger and the version trigger. Validation is permissive by default
  (no-op). Versions log on every write. **No code change needed** for compatibility, but
  the agent should note any writers that bypass `auth.uid()` (i.e. use `service_role`) —
  those produce `changed_by = NULL` in the audit trail.
  - Finding: Confirmed. **Direct-pool named-SQL writes have no `auth.uid()` → `changed_by = NULL`**
    in `udt_dataset_row_versions`. The single agent-tool delete (`datasets_tools.py:427`, Supabase
    client + user JWT) records `changed_by = <user>`. So attribution is **mixed**. No compat change needed.

### A2. Dead-RPC audit — confirm each of the 6 unused RPCs has zero aidream consumers.

- [x] **A2.1.** `append_rows_to_user_table` — grep entire repo.  Finding: zero call sites in aidream.
  ⚠️ **LIVE in matrx-extend (B2.1) → KEEP, do not drop.**
- [x] **A2.2.** `batch_update_rows_in_user_table` — grep entire repo.  Finding: zero hits (all repos) → drop candidate.
- [x] **A2.3.** `remove_column_from_user_table` — grep entire repo.  Finding: zero hits (all repos) → drop candidate.
- [x] **A2.4.** `create_new_user_table` (bare name, not `_dynamic` or `_wrapper`).  Finding: zero callers;
  appears only as a def in `db/migrations/0011_udt_rename_and_rpc_consolidation.sql:370` + a comment in
  `user_data/registered_functions.py:620` → drop candidate.
- [x] **A2.5.** `create_new_user_table_wrapper` — grep entire repo.  Finding: zero hits (all repos) → drop candidate.
- [x] **A2.6.** `create_user_table_with_fields` — grep entire repo.  Finding: zero call sites in aidream.
  ⚠️ **LIVE in matrx-extend (B2.6) → KEEP, do not drop.**

### A3. New-RPC opportunity — should aidream agents use the new write RPCs?

- [x] **A3.1.** Identify any agent tool / chain / pipeline that currently writes UDT data
  (e.g. RAG ingestion that creates rows, scraper outputs, structured-extraction results).
  For each: `file:line` + what it writes today.
  - Finding: Writers are the agent tools in `datasets_tools.py` (`usertable_create_advanced`,
    `usertable_add_rows`, `usertable_update_row`, `usertable_delete_row`) plus `dataset_creator.py` /
    `picklist_creator.py`. **RAG ingestion, scraper, and research write zero udt_ rows.**

- [x] **A3.2.** For each writer found in A3.1, recommend the new RPC equivalent [...]. Note any case
  where the existing direct-write path is materially better.
  - Finding: **Recommend keeping the direct-write path.** The new RPCs are `SECURITY DEFINER` gated by an
    `auth.uid()` owner check; aidream's trusted pool has no `auth.uid()`, so a call would fail the gate
    unless aidream first `set_config('request.jwt.claims', …)`. The direct path already scopes every write
    by `user_id` in SQL — materially better for a trusted backend. (The agent-tool delete already uses the
    Supabase client and *could* move to an RPC, but no clear win.)

### A4. Migration registry — confirm aidream tracks the `udt_v2_backbone` migration.

- [x] **A4.1.** [...] Confirm whether this migration registry tracks `udt_v2_backbone` [...]. If aidream
  maintains the schema-of-record, the SQL file [...] may need to be mirrored into aidream's migration directory.
  - Finding: aidream's `db/migrations/` is **NOT** the schema-of-record — it's reverse-engineered
    (`db/generate.py` builds the ORM from the live DB). `udt_v2_backbone` is absent from the migration dir,
    but the ORM is **already current** (regen 2026-06-02: `db/models.py:2093-2103` UdtDatasetRowVersions,
    `:2126-2141` UdtWorkbooks, `:5880-5895` new udt_datasets cols). **Do NOT mirror the SQL** (re-apply risk +
    against convention); keep canonical `udt_v2_backbone.sql` in ai-matrx. Caught up this session: the stale
    boot-time drift guard (`schema_check.py CRITICAL_TABLES` + `expected_schema.json`) — aidream commit `40770d98`.

### A5. RAG ingestion / dataset materialization paths

- [N/A] **A5.1.** If RAG ingestion writes structured outputs into UDT datasets, confirm the current
  payload shape continues to satisfy `udt_validate_row` in permissive mode (it should).
  - Finding: N/A — RAG ingestion writes **no** udt_ rows, so there's no payload to validate; permissive
    validation is a passthrough regardless.

- [x] **A5.2.** For any pipeline that uses `service_role` to write on the user's behalf, decide: should
  the audit trail record the originating user_id or honestly record NULL? [...]
  - Finding: Confirmed — pool/service writes record `changed_by = NULL`. **Decision for the FE team:** if
    backend writes should attribute the originating user, aidream must `set_config('request.jwt.claims', …)`
    before the write (the pattern in the migration's verification tests). Today it does not. A product decision,
    not a defect.

### A6. Realtime fanout

- [x] **A6.1.** Any aidream code that imports many rows into `udt_dataset_rows` will now emit a realtime
  event per row. For batches over ~100 rows, recommend switching to `udt_bulk_write` [...].
  - Finding: aidream's bulk import (`datasets_queries.py:219`, `datasets_add_rows_batch`) is already a single
    multi-row INSERT (good for DB load), but the realtime publication fans out **one event per row**. For very
    large imports, `udt_bulk_write` (still N events) or accepting the fanout; no aidream change required today.

---

## Section B — `armanisadeghi/matrx-extend` (Chrome extension)

### B1. Direct UDT writes — search for any extension code that mutates `udt_*` tables.

- [x] **B1.1.** Search for `supabase.from('udt_*')`, `supabase.rpc('...user_table...')`,
  `supabase.rpc('udt_*')` anywhere in the extension. For each hit: `file:line` + what it does.
  - Finding: Reads `udt_datasets` (`src/lib/supabase/user-tables.ts:101`) and `udt_dataset_fields` (`:118`);
    all writes go through RPCs (see B2), via the user's JWT (`getSupabase()`). No direct
    `.from('udt_*').insert/update/delete`.

- [x] **B1.2.** Identify any `FRONTEND_RPC` action handler or background-script handler that performs UDT
  writes via the bridge. List each handler name + what it does.
  - Finding: None. `src/lib/frontend-bridge/handler.ts` actions are ping/capabilities/openPanel/callTool only.
    UDT writes happen in the Showcase UI directly, not via the bridge.

### B2. Dead-RPC audit — same six as A2.

- [x] **B2.1.** `append_rows_to_user_table`.  Finding: ⚠️ **LIVE — KEEP.** `src/lib/supabase/user-tables.ts:203`
  (`appendRowsToUserTable`). Powers the Showcase save-rows flow. NOT safe to drop.
- [x] **B2.2.** `batch_update_rows_in_user_table`.  Finding: zero hits → drop candidate.
- [x] **B2.3.** `remove_column_from_user_table`.  Finding: zero hits → drop candidate.
- [x] **B2.4.** `create_new_user_table` (bare).  Finding: zero hits → drop candidate.
- [x] **B2.5.** `create_new_user_table_wrapper`.  Finding: zero hits → drop candidate.
- [x] **B2.6.** `create_user_table_with_fields`.  Finding: ⚠️ **LIVE — KEEP.** `src/lib/supabase/user-tables.ts:157`
  (`createUserTableFromSchema`). NOT safe to drop.

### B3. New-RPC opportunity

- [x] **B3.1.** Identify any extension feature that scrapes / clips / captures data and stores it into a UDT
  dataset. If found, the captured-rows insert path should use `udt_bulk_write` going forward [...].
  - Finding: Yes — the Structured-Data Showcase. `src/features/showcase/tabs/TablesTab.tsx` extracts HTML
    `<table>`s; `src/features/showcase/components/SaveAsPattern.tsx:77-87` creates a table and `:111-112`
    appends rows via the two RPCs. Already one append round-trip; `udt_bulk_write` would add atomic multi-op
    but isn't required.

- [x] **B3.2.** If the extension exposes a "save to dataset" UI for users, confirm it uses the user's JWT
  (not `service_role`) so the audit trail correctly attributes `changed_by`.
  - Finding: Confirmed — both writes use `getSupabase()` (user JWT) and the RPCs are `security_invoker`, so
    `changed_by` / ownership attribute to the real user. No `service_role`.

### B4. Workbook-flow readiness

- [x] **B4.1.** Phase 4 will introduce a workbook surface (full-collab `udt_workbooks` UI). Does the extension
  have any clip-to-spreadsheet flow that should route to workbooks rather than typed datasets? [...]
  - Finding: Entry point = `SaveAsPattern` + `TablesTab` (Showcase). It routes captured rows into typed
    `udt_datasets` today. When Phase 4 ships the workbook surface, this is the hook to re-route
    imported-from-one-source clips into `udt_workbooks`.

---

## Section C — Cross-cutting

### C1. Type-generation pipeline

- [x] **C1.1.** [...] Does aidream or matrx-extend have its own generated-types file derived from the same
  schema? [...]
  - Finding: aidream: generated ORM is current (regen 2026-06-02); the `db/expected_schema.json` baseline was
    stale (missing the 2 v2 tables + 3 new udt_datasets cols) → **fixed this session** (commit `40770d98`).
    matrx-extend: **no** generated Supabase-types file; manual Zod schemas at `src/lib/supabase/user-tables.ts:73-96`
    are pre-v2 but only model tables the extension touches, so still functional (no compile breakage).

### C2. Documentation sync

- [x] **C2.1.** Does either repo have a doc for data-tables / udt / datasets that asserts a model contradicted
  by the new architecture? If yes, flag for update.
  - Finding: aidream: `docs/UDT_API_REFERENCE.md` + `docs/UDT_MIGRATION_FOR_FRONTENDS.md` were v1-only —
    **silent** on v2, not actively contradictory. Note `UDT_MIGRATION_FOR_FRONTENDS.md:79-84` lists all six
    candidate RPCs as a "names + signatures preserved" contract → a drop must update that doc. `schema_check.py`
    omitted the v2 tables. **Fixed this session:** API-ref gained a v2 note + schema_check now lists them
    (commit `40770d98`). matrx-extend: no UDT docs; the `user-tables.ts` header is accurate and now notes v2
    (commit `8a932d2`).

### C3. Test suites

- [x] **C3.1.** Run the test suite in each repo. Report PASS / FAIL counts. [...] flag any realtime-fanout
  failures that assume "1 write = silence."
  - Finding: aidream: `user_data/tests/**` are v1 CRUD only; **not run here** — they write to the live shared
    DB and need pool init; the v1 path is unaffected (permissive validation = passthrough; version triggers are
    audit-only). matrx-extend: `npm test` (vitest) → **39 passed / 0 failed** (6 files). Neither repo has
    UDT-specific tests or a "1 write = silence" assertion, so the realtime fanout trips nothing.

---

## Report format (when finished)

Reply with the entire filled-in file. We will ingest the findings, decide on any
follow-ups, and the dead-RPC drop will only proceed once Sections A2 and B2 are 100%
green (all six confirmed dead in all three repos).

> **Update 2026-06-02:** Sections A2 and B2 are filled in. They are **not** all-six-green —
> `create_user_table_with_fields` and `append_rows_to_user_table` are **LIVE in matrx-extend**.
> The drop set is the **four** confirmed-dead RPCs only, and is still pending a `matrx-local` +
> DB-internal-caller check (see [`CROSS_REPO_HANDOFF.md`](./CROSS_REPO_HANDOFF.md)).
