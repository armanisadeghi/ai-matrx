-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- lane: LEDGER-LANE
--
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- LEDGER-LANE — A LEDGER ROW NAMES WHO APPLIED IT.
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- THE INCIDENT, 2026-09-23. At 11:51:47Z and 11:52:06Z two production migrations,
-- `hubfix_each_table_says_who_can_see_it_and_whose_it_is.sql` and its grant
-- `hubfix_the_table_facts_door_can_be_reached.sql` (the second with --confirm-chair-step),
-- landed outside the 1–4 AM Pacific window. The ledger kept source, filename, checksum,
-- applied_at, duration_ms, chair_step and rebase_receipts — and NOT the --lane the runner had
-- just required, nor the machine, the user, the session or the commit. The chair could not ask
-- anyone about it, because nothing said who "anyone" was.
--
-- WHAT THIS FILE ADDS: seven nullable columns, no defaults, no constraint, no index. The two
-- runners (`scripts/apply-migration.ts` via `scripts/lib/ledger-attribution.ts`, and
-- `aidream/db/apply_migrations.py` via `db/ledger_attribution.py`) write them on every apply:
--   applied_by_lane       the --lane flag (else MATRX_LANE)
--   applied_by_os_user    the OS user that ran the runner
--   applied_by_host       the machine
--   applied_by_session    the agent session id when the environment carries one
--   applied_by_process    the redacted ancestor process chain
--   applied_from_git_head the checkout's HEAD SHA, and whether the file was committed there
--   applied_in_window     computed by the database at apply time, America/Los_Angeles 01:00–04:00
-- A runner that finds the columns absent writes the row without them and SAYS SO in one sentence.
-- Nothing is backfilled: a row written before this file has no attribution and says nothing.
--
-- WHY A MIGRATION MAY TOUCH THE LEDGER HERE. Both runners refuse any file that writes
-- `public._schema_migrations`. They admit exactly the statements below — ADD COLUMN IF NOT EXISTS
-- of these seven columns at these types (and, in the inverse, DROP COLUMN IF EXISTS of them) —
-- by a closed list in the runners (`stripLedgerShapeStatements` / `strip_ledger_shape_statements`).
-- Any other ledger statement is still refused. Corpus: `migrations/judgment-corpus/lg-0*.sql`.
--
-- LOCKS. Each ALTER takes ACCESS EXCLUSIVE on the ledger for a catalog-only change (nullable, no
-- default: no rewrite). The ledger is read by runners, not by users; the whole file is milliseconds.
-- It goes to production in the 1–4 AM Pacific window anyway, by the chair.
--
-- Inverse: migrations/inverse/ledgerlane_a_ledger_row_names_who_applied_it_down.sql

alter table public._schema_migrations add column if not exists applied_by_lane text;
alter table public._schema_migrations add column if not exists applied_by_os_user text;
alter table public._schema_migrations add column if not exists applied_by_host text;
alter table public._schema_migrations add column if not exists applied_by_session text;
alter table public._schema_migrations add column if not exists applied_by_process text;
alter table public._schema_migrations add column if not exists applied_from_git_head text;
alter table public._schema_migrations add column if not exists applied_in_window boolean;

comment on column public._schema_migrations.applied_by_lane is
  'The lane flag (else MATRX_LANE) of the runner that applied this row. Null on rows applied before 2026-09-23 (LEDGER-LANE); never backfilled.';
comment on column public._schema_migrations.applied_by_os_user is
  'OS user that ran the runner for this apply (LEDGER-LANE).';
comment on column public._schema_migrations.applied_by_host is
  'Hostname of the machine that ran the runner for this apply (LEDGER-LANE).';
comment on column public._schema_migrations.applied_by_session is
  'Agent session id from the environment when one was present, e.g. claude:<id> or codex:<id> (LEDGER-LANE).';
comment on column public._schema_migrations.applied_by_process is
  'Redacted ancestor process chain of the runner, pid + command, up to six levels (LEDGER-LANE).';
comment on column public._schema_migrations.applied_from_git_head is
  'HEAD SHA of the checkout the migration file sat in, and whether the file was committed, modified or untracked there (LEDGER-LANE).';
comment on column public._schema_migrations.applied_in_window is
  'True when the apply transaction started 01:00-04:00 America/Los_Angeles; computed by the database at apply time (LEDGER-LANE).';
