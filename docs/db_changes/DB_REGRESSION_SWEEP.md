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

**2. A checker that cries wolf hides real bugs — and ours did, for one reason.**
`audit.broken_functions` held 101 rows across 79 functions of which exactly two
were real. The cause was a single line: `audit.refresh_static()` ran
`plpgsql_check` under `search_path='pg_catalog'`, a path no function ever runs
with, so every unqualified reference to a perfectly real object was reported
missing. **Fixed 2026-08-13** — see "The conformance checker now means something"
below. The part that does not go away: a clean static report still proves nothing.
Only `audit.function_runtime_probe` proves a function runs.

---

## Still open

- **Three live `public.*` RPCs are genuinely broken** — the findings that survived
  the checker cleanup below, so these are now the entire actionable list:
  `execute_complex_save` (casts jsonb to `text[]`, and contains a bare `ROLLBACK`
  inside a function — `2D000` on every call that reaches it),
  `get_full_table` (missing GROUP BY on `tf.field_order`), and
  `get_table_info` (declared result type does not match its query). All three are
  legacy user-data-table (UDT) RPCs with **no frontend callsite** — only
  `types/database.types.ts` mentions them here — but `get_full_table` is still
  named in aidream's UDT docs, so "unused" is not proven. Next step: for each,
  decide *repair or graveyard* (do not guess — check aidream's
  `docs/udt_user_data_and_lists/` and `packages/matrx-ai/.../content_types/`
  first), then re-run `audit.refresh()` and confirm the real count returns to 0.
  Watch them at `/administration/database/canonicalization/broken-functions`
  (defaults to real breakage only).

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

- **The conformance checker now means something: 101 rows → 3 actionable
  functions.** Two defects, both in the tooling itself.
  *The counts disagreed:* `audit.refresh_log.broken_fn` said 29 while
  `audit.broken_functions` held 101 rows — two different measures shown side by
  side, and the runtime probes wrote their failures *after* the log row existed, so
  a probe failure could never appear in any count at all. The log row is now
  **derived from the table** by `audit.refresh_log_recount()` after every phase,
  with one explicit column per severity; it cannot drift by construction.
  *The noise:* checking under `search_path='pg_catalog'` invented every "does not
  exist" error — `public.guest_executions`, `is_system_path`, `get_user_limits`,
  `calculate_trending_score`, `org_role`, `extensions.gen_random_bytes` and the
  rest all exist. Each function is now checked under **its own effective search
  path** (`proconfig`, else the runtime default, always with `pg_temp`). That one
  change took errors from 40 rows / 29 signatures to 23 / 12 **and unmasked two
  real bugs the noise had buried** in `execute_complex_save`.
  Whatever a search path cannot fix is classified with a written reason rather
  than reported as breakage — self-created temp tables, relation names built from
  a `text[]` at runtime, shared trigger functions branching on the table they
  fired for (verified mechanically: suppressed only when the function has >1
  attachment *and* the field really exists on one of them), and cascades where
  plpgsql_check could not see into a `FOR` loop's source.
  **Read `severity`, never `level`** — `level='error'` still covers the artifacts.
  A fixed sqlstate floor (`42P10`, `42803`, `42804`, `42846`, `2D000`) can only
  ever be `real`, so the two ON CONFLICT bugs above cannot be classified away if
  reintroduced; the migrations assert this and RAISE if it stops holding.
  `audit.table_impact.currently_broken` now keys on `severity='real'` too — it
  keyed on `level='error'`, so 9 artifact functions were blocking
  `iam.canonical_certify` for every table they touch.
  New: **9 privilege-risk functions** flagged as `advisory` — invoker-rights
  functions that enumerate relations from the catalog and build dynamic SQL with
  no `has_table_privilege` filter. That is the *shape* of the
  `get_project_references` outage; no static checker could have caught the outage
  itself, since it was a runtime privilege error inside dynamic SQL.

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
  functions, the education study-data functions** are fine — proven with real
  writes (rolled back). The checker now agrees: the guest-execution and
  `folders_set_is_system` findings are **gone** (they were pure search-path
  artifacts), and the trigger-function ones are classified `suppressed` with the
  reason on the row. They no longer count as breakage anywhere, including in
  `iam.canonical_certify`.

- **The frontend does not reference any column dropped by the owner-column sweep**
  — `pnpm type-check` is green.
