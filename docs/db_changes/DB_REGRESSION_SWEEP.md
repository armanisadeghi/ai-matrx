# Database regression sweep — started 2026-08-13

**What this is.** A working task list for the breakage caused by the big database
reorganization (roughly 160 migrations applied 2026-08-11 → 2026-08-13). It exists
so nothing gets forgotten between sessions. It is not a report and not an archive:
when a line is fixed and verified, delete it or move it to Fixed with one line.

**How to use it.** Work top to bottom. Everything here is either FIXED (verified
live) or OPEN with the exact next step. If you find new breakage from the same
reorg, add it here — not to `FOUND_DEFECTS.md`, which is for unrelated one-offs.

---

## The lesson that matters most

**A migration file on disk changes nothing.** The project-references bug below had
a correct, complete fix sitting in `migrations/project_reference_invoker_boundary_probe.sql`
that was never applied to the live database. The next agent read the file, saw the
fix, and reported the problem solved — while every project page in production kept
throwing a red error. The database is the only source of truth. Before believing any
"this is fixed", query the live function or table.

**A second trap: the static checker is mostly noise right now.** `audit.broken_functions`
holds 101 rows across 79 functions, and nearly all of them are false alarms —
temp tables the checker cannot see, table names built from arrays at runtime, and
functions checked under a search path they never actually run with. Two of the 101
were real. So a clean-looking dashboard proves nothing, and a scary-looking one is
mostly noise. Verify by running the thing.

---

## FIXED — verified live on 2026-08-13

- **Every project page threw a red error.** `public.get_project_references` walks
  every foreign key pointing at `workspace.projects` and counts rows in each table
  it finds, running as the signed-in user. Retired tables keep their foreign keys
  when they are moved into the `graveyard` schema, and normal users deliberately
  cannot read that schema — so the walk hit `graveyard.education_flashcard_data`
  and the whole call died with "permission denied for schema graveyard". Both this
  function and `get_project_references_detailed` now skip any table the caller
  cannot actually read. That is privilege-driven, so a future protected schema is
  handled automatically instead of breaking a page. Verified as a real signed-in
  user against the exact project from the error report: 13 rows, no error.

- **78 foreign keys still pointed from retired tables into live ones.** The cleanup
  migration `drop_graveyard_to_live_fks.sql` was a one-time sweep run on 2026-07-28,
  so every table retired after that date recreated the problem. Re-run and now zero.
  **This must be re-run after every graveyard move** — the migration is idempotent
  for exactly that reason (`drop_graveyard_to_live_fks_rerun_2026_08_13.sql`).

- **The access planner could not save a nested relationship.** Both
  `admin_configure_entity_access` and `admin_set_containment_edge` (shipped
  2026-08-12) tried to upsert on `(child_type, parent_type, kind)`, but the only
  unique key on `platform.entity_relationships` is `(child_type, parent_type,
  fk_column)`. Any admin configuring containment got a hard error. Fixed by
  deleting the existing edge and inserting, which matches what the code meant.
  Deliberately did **not** add a unique index on `(child_type, parent_type, kind)`:
  that would forbid the multi-parent shape `iam.apply_rls` supports on purpose.

- **Four entity registrations pointed at tables that no longer exist**
  (`agent_user_kv`, `component_group`, `field_component`, `prompt`). An active
  registration whose table is gone is a silent liar — every access check on it
  denies with no error anywhere. Deactivated.

- **Component tables could not do insert-and-return.** Covered separately; the
  component read policy now leads with the owner check, matching entity tables.

---

## OPEN — with the next step

- **Some tables still cannot do insert-and-return as a signed-in user.**
  21 component tables have a `created_by` column but no trigger to fill it, and 12
  have no `created_by` column at all. All are written by the server today, so
  nothing user-facing is known broken — but any new frontend write to one of them
  will fail. Next step: attach the standard trigger set per table. Full list in
  `FOUND_DEFECTS.md` (search "Component-RLS remainder").

- **A 13-million-row table is unreadable to any signed-in user.** The access
  kernel builds a list of every row id you are allowed to see, so reading
  `seo.search_performance_daily` times out. This is a design decision for Arman,
  not an agent fix: the policy needs to become a condition rather than a row list.
  Details in `FOUND_DEFECTS.md` (search "RLS kernel materializes").

- **One migration file drifted from what was applied**: `seo_gsc_dig_class.sql` is
  recorded as applied but the file changed afterwards. Someone edited the file
  after the fact. Next step: diff it against live and either re-apply or restore
  the file so the record is honest.

- **The conformance dashboard's own numbers disagree.** `audit.refresh_log` reports
  29 broken functions while `audit.broken_functions` holds 101 rows across 79
  distinct functions. One of the two counts is wrong, so the dashboard cannot be
  trusted at a glance. Next step: reconcile the count in `audit.refresh()`, and
  separately teach the checker to stop reporting temp tables and runtime-built
  table names as missing relations — the noise is what let two real bugs hide.

---

## Fixed elsewhere, do not re-investigate

- `context.ensure_slug`, `web.reject_immutable_fact_mutation`,
  `seo.change_record_scope_guard`, `folders_set_is_system`, the guest-execution
  functions and the education study-data functions all appear in
  `audit.broken_functions` and are **fine** — tested with real writes on 2026-08-13.
  They are checker false positives (shared trigger functions, temp tables, runtime
  table names, restricted check-time search path).
