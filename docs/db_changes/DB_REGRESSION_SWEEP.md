# Database regression sweep — 2026-08-13

**What this is.** The working list for breakage caused by the big database
reorganization (~160 migrations applied 2026-08-11 → 2026-08-13). **Delete this
file when the Still open section is empty** — everything above it is kept only as
the two lessons worth carrying forward.

---

## The two lessons

**1. A migration file on disk changes nothing.** The fix for the project-page
outage below was sitting complete and correct in
`migrations/project_reference_invoker_boundary_probe.sql` and had never been
applied to the live database. The next agent read the file, saw the fix, and
reported it solved — while every project page in production kept throwing a red
error. The database is the only source of truth. Before believing any "this is
fixed", query the live object.

**2. The static checker is ~97% noise, which is how two real bugs hid.**
`audit.broken_functions` held 101 rows across 79 functions; individually tested,
nearly all were false alarms — temp tables the checker cannot see, table names
built from arrays at runtime, shared trigger functions checked against tables
they do not apply to, and functions checked under a search path they never run
with. Exactly two were real. A clean dashboard proves nothing and a scary one is
mostly noise: verify by running the thing. (Being fixed under its own chip.)

---

## Still open

- **A 13-million-row table is unreadable to any signed-in user.** The access
  kernel builds a list of every row id you may see, so reads of
  `seo.search_performance_daily` time out. The fix is to make the policy a
  *condition* (`site_id IN (SELECT id FROM <parent>)`, the platform's own
  documented reference model) instead of a row-id list — but it changes a live
  security policy, so it needs Arman's approval and a proven row-set match
  before/after. **Chip fired 2026-08-13** with the full brief, including the
  instruction to audit every other large table with the same policy shape.

---

## Fixed and verified live — 2026-08-13

- **Every project page threw a red error.** `get_project_references` walks the
  foreign keys pointing at `workspace.projects` and counts rows in each table it
  finds, as the signed-in user. Retiring a table into `graveyard` *carries its
  foreign keys along*, and users deliberately cannot read that schema — so the
  walk hit a retired flashcard table and the call died with "permission denied
  for schema graveyard". Both reference RPCs now skip any relation the caller
  cannot read (privilege-driven, so future protected schemas are handled too).
  Verified as a real signed-in user on the reported project: 13 rows, no error.

- **78 foreign keys still pointed from retired tables into live ones.** The
  cleanup migration ran once (2026-07-28) and was treated as done, so every table
  retired afterwards recreated the problem. Re-run; zero remain; retired data
  untouched. It is now documented as a **post-condition of every graveyard move**
  in `.claude/skills/db-graveyard-table/SKILL.md` step 3, not a one-time job.

- **The access planner could not save a nested relationship.** Both
  `admin_configure_entity_access` and `admin_set_containment_edge` (shipped
  2026-08-12) upserted on `(child_type, parent_type, kind)` while the only unique
  key is `(child_type, parent_type, fk_column)` — a hard error for any admin who
  used it. Fixed by delete-then-insert, which is what the code meant. Deliberately
  did *not* add the "obvious" unique index: it would forbid the multi-parent shape
  `iam.apply_rls` supports on purpose.

- **Four entity registrations pointed at tables that no longer exist**
  (`agent_user_kv`, `component_group`, `field_component`, `prompt`). Every access
  check on such a token denies silently, with no error anywhere. Deactivated; zero
  active registrations now point at a missing table.

- **Component tables could not do insert-and-return.** The component read policy
  now leads with the owner check, matching entity tables. 126 policies repaired.

- **One migration file had drifted from what was applied** (`seo_gsc_dig_class.sql`).
  The change was comment-only — a record of a live `plan_cache_mode` setting — so
  the ledger checksum was re-recorded. `pnpm check:migrations` is clean.

---

## Checked and NOT broken — do not re-investigate

- **The 33 tables that "cannot insert-and-return"** are latent, not broken.
  Verified live: with `created_by` supplied the insert-and-return succeeds; only
  without it does it fail. All five real frontend callsites
  (`gsc_dig_rule`, `keyword_class_rule`, `change_event`) pass `created_by`
  explicitly, and everything else on those tables is server-written where RLS does
  not apply. **The rule for anyone adding a new write to them: pass `created_by`,
  or attach the `_stamp_actor` trigger first.** Deliberately did not bulk-attach
  triggers — several are high-volume ingest tables where a per-row trigger is a
  real cost for no current benefit.

- **`context.ensure_slug`, `web.reject_immutable_fact_mutation`,
  `seo.change_record_scope_guard`, `folders_set_is_system`, the guest-execution
  functions, the education study-data functions** all appear in
  `audit.broken_functions` and are fine — proven with real writes (rolled back).
  Checker false positives, per lesson 2.

- **The frontend does not reference any column dropped by the owner-column sweep**
  — `pnpm type-check` is green.
