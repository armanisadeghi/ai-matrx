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

- [ ] **A1.1.** Search the repo for SQL or ORM writes to `udt_datasets`, `udt_dataset_fields`,
  `udt_dataset_rows`, `udt_picklists`, `udt_picklist_items`, `udt_workbooks`,
  `udt_dataset_row_versions`. Include both raw `INSERT`/`UPDATE`/`DELETE` SQL and any ORM
  models (SQLAlchemy, asyncpg, supabase-py). For each hit: `file:line` + what it does.
  - Finding: ____

- [ ] **A1.2.** Search for `supabase.from('udt_*')`, `supabase.table('udt_*')`,
  `supabase.rpc('...user_table...')`, `supabase.rpc('udt_*')`. Same format.
  - Finding: ____

- [ ] **A1.3.** Confirm: any write path that hits `udt_dataset_rows` will now also fire
  the validation trigger and the version trigger. Validation is permissive by default
  (no-op). Versions log on every write. **No code change needed** for compatibility, but
  the agent should note any writers that bypass `auth.uid()` (i.e. use `service_role`) —
  those produce `changed_by = NULL` in the audit trail.
  - Finding: ____

### A2. Dead-RPC audit — confirm each of the 6 unused RPCs has zero aidream consumers.

- [ ] **A2.1.** `append_rows_to_user_table` — grep entire repo.  Finding: ____
- [ ] **A2.2.** `batch_update_rows_in_user_table` — grep entire repo.  Finding: ____
- [ ] **A2.3.** `remove_column_from_user_table` — grep entire repo.  Finding: ____
- [ ] **A2.4.** `create_new_user_table` (bare name, not `_dynamic` or `_wrapper`).  Finding: ____
- [ ] **A2.5.** `create_new_user_table_wrapper` — grep entire repo.  Finding: ____
- [ ] **A2.6.** `create_user_table_with_fields` — grep entire repo.  Finding: ____

### A3. New-RPC opportunity — should aidream agents use the new write RPCs?

- [ ] **A3.1.** Identify any agent tool / chain / pipeline that currently writes UDT data
  (e.g. RAG ingestion that creates rows, scraper outputs, structured-extraction results).
  For each: `file:line` + what it writes today.
  - Finding: ____

- [ ] **A3.2.** For each writer found in A3.1, recommend the new RPC equivalent:
  - inserting one record → `udt_upsert_row(p_table_id, NULL, data)`
  - updating one record → `udt_upsert_row(p_table_id, row_id, data)`
  - inserting many records (bulk import) → `udt_bulk_write(p_table_id, [{op:'insert', data}, ...])`
  - touching one field → `udt_upsert_cell(p_table_id, row_id, field_name, value)`
  - Note any case where the existing direct-write path is materially better (e.g. needs
    server-side trust, can't go through RLS).
  - Finding: ____

### A4. Migration registry — confirm aidream tracks the `udt_v2_backbone` migration.

- [ ] **A4.1.** aidream historically owns `aidream/db/migrations/` (referenced in the
  ai-matrx note about migration `0011_udt_rename_and_rpc_consolidation`). Confirm whether
  this migration registry tracks `udt_v2_backbone`, `udt_v2_backbone_hardening`,
  `udt_v2_backbone_hardening_v2`, `udt_v2_upsert_row_default_null`. If aidream maintains
  the schema-of-record, the SQL file at
  [`migrations/udt_v2_backbone.sql`](./../../migrations/udt_v2_backbone.sql) in ai-matrx
  may need to be mirrored into aidream's migration directory.
  - Finding: ____

### A5. RAG ingestion / dataset materialization paths

- [ ] **A5.1.** If RAG ingestion writes structured outputs into UDT datasets, confirm the
  current payload shape continues to satisfy `udt_validate_row` in permissive mode
  (it should — permissive is a passthrough).
  - Finding: ____

- [ ] **A5.2.** For any pipeline that uses `service_role` to write on the user's behalf,
  decide: should the audit trail record the originating user_id or honestly record NULL?
  Today the trigger records `auth.uid()` (NULL for service_role writes). If aidream wants
  the originating user attributed, it must call `set_config('request.jwt.claims', ...)`
  before the write — same pattern as the verification tests in `udt_v2_backbone.sql`.
  - Finding: ____

### A6. Realtime fanout

- [ ] **A6.1.** Any aidream code that imports many rows into `udt_dataset_rows` will now
  emit a realtime event per row. For batches over ~100 rows, recommend switching to
  `udt_bulk_write` (still N events) and/or wrapping in a single SQL `INSERT ... SELECT`.
  - Finding: ____

---

## Section B — `armanisadeghi/matrx-extend` (Chrome extension)

### B1. Direct UDT writes — search for any extension code that mutates `udt_*` tables.

- [ ] **B1.1.** Search for `supabase.from('udt_*')`, `supabase.rpc('...user_table...')`,
  `supabase.rpc('udt_*')` anywhere in the extension. For each hit: `file:line` + what it does.
  - Finding: ____

- [ ] **B1.2.** Identify any `FRONTEND_RPC` action handler or background-script handler
  that performs UDT writes via the bridge. List each handler name + what it does.
  - Finding: ____

### B2. Dead-RPC audit — same six as A2.

- [ ] **B2.1.** `append_rows_to_user_table`.  Finding: ____
- [ ] **B2.2.** `batch_update_rows_in_user_table`.  Finding: ____
- [ ] **B2.3.** `remove_column_from_user_table`.  Finding: ____
- [ ] **B2.4.** `create_new_user_table` (bare).  Finding: ____
- [ ] **B2.5.** `create_new_user_table_wrapper`.  Finding: ____
- [ ] **B2.6.** `create_user_table_with_fields`.  Finding: ____

### B3. New-RPC opportunity

- [ ] **B3.1.** Identify any extension feature that scrapes / clips / captures data and
  stores it into a UDT dataset. If found, the captured-rows insert path should use
  `udt_bulk_write` going forward (one round-trip, validation runs once per row, one
  version log per row, atomic).
  - Finding: ____

- [ ] **B3.2.** If the extension exposes a "save to dataset" UI for users, confirm it
  uses the user's JWT (not `service_role`) so the audit trail correctly attributes
  `changed_by`.
  - Finding: ____

### B4. Workbook-flow readiness

- [ ] **B4.1.** Phase 4 will introduce a workbook surface (full-collab `udt_workbooks` UI).
  Does the extension have any clip-to-spreadsheet flow that should route to workbooks
  rather than typed datasets? If yes, note the entry point — Phase 4 will wire it.
  - Finding: ____

---

## Section C — Cross-cutting

### C1. Type-generation pipeline

- [ ] **C1.1.** ai-matrx regenerated `types/database.types.ts` via the
  `npx supabase gen types typescript --project-id txzxabzwovsujtloxrus --schema public`
  pipeline. Does aidream or matrx-extend have its own generated-types file derived from
  the same schema? If yes, identify it (`file:line`) and confirm whether it needs
  regeneration. Note: stale types are not a runtime risk (the SQL is live) but they
  surface friction at compile time.
  - Finding: aidream: ____ / matrx-extend: ____

### C2. Documentation sync

- [ ] **C2.1.** Does either repo have a `FEATURE.md` for data-tables / udt /
  user-tables / datasets that asserts a model contradicted by the new architecture
  (e.g. claims `udt_datasets` rows have no version history, or asserts no validation)?
  If yes, flag for update.
  - Finding: aidream: ____ / matrx-extend: ____

### C3. Test suites

- [ ] **C3.1.** Run the test suite in each repo. Report PASS / FAIL counts. The new
  triggers / RPCs should NOT cause regressions in either repo — but the realtime fanout
  on `udt_dataset_rows` writes could trip integration tests that assume "1 write =
  silence." Flag any such failures.
  - Finding: aidream: ____ / matrx-extend: ____

---

## Report format (when finished)

Reply with the entire filled-in file. We will ingest the findings, decide on any
follow-ups, and the dead-RPC drop will only proceed once Sections A2 and B2 are 100%
green (all six confirmed dead in all three repos).
