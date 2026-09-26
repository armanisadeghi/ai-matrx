# `scripts/night/` — unattended jobs that run inside the maintenance window

> 🚨 **2026-09-21 (Claude Fable 5.1, release-automation session, on Arman's word):** the one-shot
> `com.aimatrx.night-sweep.suite-sweep` for 2026-09-22 01:35 was **unloaded** and its plist renamed
> `…plist.PAUSED-2026-09-21`. It runs ~190 suites serially against PRODUCTION, the class of Sunday
> night's lock incident; Arman ruled that nothing of that kind runs tonight. The two branch-refresh
> jobs were left loaded (branch-only writes). The way suites come back is against the nightly clone:
> `common-docs/projects/database-workload-safety/DEV-CLONE-AND-BACKUP.md`. Re-arm only on Arman's word.
>
> 🚨 **Identity trap (measured 2026-09-22) — CLOSED the same day.** A Supabase DATA branch
> (`with_data: true`) is a physical restore and reports the **same
> `pg_control_system().system_identifier` as production**, so a `night_assert_target` keyed on that
> number alone could not tell the nightly clone from production, in either direction.
> `night_assert_target` now identifies a target by **(system identifier, project ref) together** —
> the project ref comes from the CONNECTION (`postgres.<ref>` at the pooler, `db.<ref>.supabase.co`
> direct), read back from libpq — and takes a third target, `clone`, whose pair is read from the
> checked-in `common-docs/operations/clone/CLONE-REF` the way `branch` reads BRANCH-REF. An
> unreadable reference file is a refusal, never a fallback. The same change landed in
> `scripts/campaign-tests/_preamble.sql`, which now accepts MAIN, the rehearsal branch **or** the
> dev clone, and takes an optional `\set expect 'main|branch|clone'`.
> Proven RED then GREEN on live databases: production presented as the clone → refused; the clone
> presented as production → refused; the clone presented as the branch → refused; CLONE-REF
> unreadable → refused; each of the three accepted as itself.
>
> **The suite sweep is back, against the clone:** [`clone-suite-sweep.sh`](./clone-suite-sweep.sh).
> It has no production mode and no way to acquire one — `night_assert_target clone` is the only
> target it ever asks for. It is NOT a one-shot: no plist, no window guard (the clone is where
> heavy work belongs) and no branch `build_lock`.
>
> 🚨 **2026-09-22 ~00:10 PT (same session, on Arman's word):** `com.aimatrx.night.branch-refresh-nightly`
> (daily 01:05) and the one-shot `com.aimatrx.night-sweep.branch-refresh` (2026-09-23 01:05) were also
> **unloaded**, plists kept as `.PAUSED-2026-09-22`. They write only the branch, but each takes a
> ~7-minute `pg_dump --schema-only` of production (ACCESS SHARE on every table). Nothing of ours is
> loaded on the Mac now. When these return, take the schema from the nightly clone, not production.
>
> ✅ **SUPERSEDED the same day (2026-09-22, lane BRANCH-REFRESH-2). They took the schema from the
> clone, and they are back.** `branch-refresh.sh` no longer has a production code path — in any
> mode, under any variable. Its only source is `night_assert_target clone`, so **Arman's "no
> production reads tonight" ruling is honoured by construction, not by promise**: there is nothing
> to set, no flag to pass and no env var to export that would make this job read production. A
> production connection string handed to it is refused before the schema list is read, in live mode
> *and* in rehearsal mode, naming what the server actually is. Everything else is unchanged — the
> window guard (its reason restated: it now protects the **destructive branch write**, not a
> production read), the `campaign_watch.build_lock`, the self-deleting plist, the ten-minute dump
> cap, and the absence of any force switch.
>
> The clone's read is free, so `NIGHT_REHEARSE=1` now removes the **destruction** rather than the
> source: a rehearsal reads the real clone and narrows the drop set to its own probe schema.
>
> Measured against the clone on 2026-09-22: dump **354 s · 20 MB · 20,878 CREATE · 9,961 GRANT**
> (production's own dump was 409 s). Full run, refusals and numbers:
> [`v5/PROGRESS-BRANCH-REFRESH.md`](/projects/data-doctrine-adoption/v5/PROGRESS-BRANCH-REFRESH.md).
>
> 🚨 **A password passed as `argv` is public.** The same session measured the clone's database
> password sitting in `ps aux` for the whole ten minutes a dump ran, because the DSN was an
> argument. `night_dsn_args` splits a DSN into `-h/-p/-U/-d` and hands the password through
> `PGPASSWORD`; `branch-refresh.sh` uses it for the dump. **Every other night job still passes a DSN
> to `psql` as an argument** — sub-second windows, the same hole, and the next job to add a
> long-running command must use `night_dsn_args`.


> ## 🚨 THE CLONE IS A DAY OLD, AND ITS LEDGER LIES ABOUT IT (lane CLONE-CATCHUP, 2026-09-22)
>
> The nightly dev clone is a PHYSICAL RESTORE taken once a day, and it carries production's own
> `public._schema_migrations` **as it stood at the restore point** — so every migration
> production ledgers after the snapshot is missing from the clone *and the clone's ledger says it
> is applied*. There is no drift report, because nothing disagrees. That is how lane STORE-TXN's
> whole suite PASSED on the clone and FAILED on main on 2026-09-22: `custom._relation_halves_agree`,
> a DEFERRED trigger applied to production at 15:15:46Z, did not exist on a clone promoted at
> 06:20Z (VERIFIER-13 item 4). Two lanes, each correct on its own bytes; the pair did not work.
>
> **[`clone-catchup.sh`](./clone-catchup.sh) is the nightly's FIRST step after the refresh.** It
> reads both ledgers, computes the delta and applies it with the REAL runners at `--target clone`
> — it owns no apply path of its own. `--dry-run` prints the delta and changes nothing;
> `clone-catchup-plan.py --self-test` proves the delta rules on fixtures with no database.
>
> **The delta is three rules, not a timestamp** (`clone-catchup-plan.py`):
> 1. a `(source, filename)` production has and the clone does not;
> 2. the same pair with DIFFERENT checksums;
> 3. the same pair with the SAME checksum where **the clone applied that file's INVERSE after
>    it** — rule 27 is `up → inverse → up`, and a rehearsal interrupted after its inverse leaves
>    a ledger row claiming "applied" while the objects are gone. That was the other half of why
>    the item-4 trigger was missing, and it fired on live data again the same afternoon.
>
> And one subtraction: **a production inverse row that production itself superseded is HISTORY,
> not state.** Production's ledger carries rule 27's churn as well as its outcome; replaying the
> churn onto the clone is wrong, and the runner says so — an inverse's `-- based-on:` hash
> describes a body that was live on PRODUCTION at that moment and never on the clone. Measured on
> the first real run: `writeperf3b_a_standard_tables_fields_are_read_once_per_statement_down.sql`
> declared `0de1d32bc2f6` and the clone's body was `38aad156881b`.
>
> **The bytes are checked against `origin/main`, not the working tree** — these are shared
> checkouts — and a file whose committed bytes do not hash to production's ledgered checksum is
> REFUSED BY NAME with nothing applied for it.
>
> **It never writes production.** The production connection is asserted read-only by
> `night_assert_target_readonly`, which makes the SERVER refuse a write in the job's own
> transaction shape before the first row is read. (`PGOPTIONS='-c default_transaction_read_only=on'`
> is silently dropped by Supavisor in transaction mode — measured; `begin read only` is the proof.)
> That is what earns the window exemption: `night_window_guard` grants it only once every database
> the run can WRITE has been proven to be the clone. There is no flag here that removes the window.
>
> **PARITY IS THE CRITERION (chair ruling 2026-09-22).** The clone is the MIRROR; lanes may
> rehearse on it only because rule 27's third leg returns it to production parity, so a rehearsal
> that leaves a body moved is the defect, not the catch-up. Therefore:
> - **`pnpm db:rehearse … --target clone` asserts parity on exit.** After leg 3 every function
>   body the pair touches is hashed on the clone AND on production (SELECT-only, the server
>   proving it refuses a write), and a difference is printed by name and exits non-zero. No flag
>   skips it. Shown RED then GREEN by `pnpm check:clone-parity:self-test` (a body moved on the
>   clone is named; a body absent is named; putting it back is silent).
> - **The catch-up never bypasses DD-220.** On a `-- based-on:` refusal it compares the clone's
>   body with PRODUCTION'S, and there are exactly three answers: they DIFFER → the clone drifted,
>   so it finds the ledgered production file that owns that body (by the function name, on
>   `origin/main`, checksum-verified), re-applies it at `--target clone --reapply` newest-first
>   until the body hashes to what the delta file declares, then retries the file — and if no
>   ledgered file reproduces it, refuses by name. They AGREE → production has moved past the body
>   its own file declares, so the file is SUPERSEDED history, not state, and carrying it would
>   write an OLD body onto the clone. A failure that is not a based-on refusal (a plain
>   `create function` answering 42723 on a clone a lane already rehearsed onto) asks the same
>   question one step wider: if every body the file writes already matches production, it is
>   ALREADY LEVEL. Measured live the same day: `custom.portals` was drifted and was repaired from
>   `orgcleanup_a_portal_is_archived_never_deleted.sql`; `custom.read_records_archived` was NOT
>   drifted (clone and production both `0c08c11f…`, the file declaring `f3a603af…`) and was
>   correctly not carried.
>
> **A refusal is not a crash.** Both runners are transactional, so a refused file lands nothing
> and writes no ledger row; the job names it, continues with the rest of the delta and exits
> nonzero listing every one. Stopping at the first refusal carried 1 of 65 files, then 17 of 55.
> A DD-220 `-- based-on:` refusal here is the runner protecting a body a REHEARSAL moved on the
> clone (the clone is production's snapshot PLUS whatever lanes rehearsed on it) and is never
> bypassed by this job.
>
> **Real runs, 2026-09-22 16:23–16:58Z:** delta 65 → **58 files applied**, 1 parity repair, 2
> superseded/already-level, **0 failures, exit 0**, converging to a standing delta that is churn
> lanes create on the clone while the job runs. Armed as
> the one-shot `com.aimatrx.night-sweep.clone-catchup` (2026-09-23 01:45 PT, after
> `clone_refresh_nightly` at 01:00) plus `com.aimatrx.night.clone-catchup-nightly` (daily 01:45),
> **loaded but disabled** until the one-shot's log is clean — the same way branch-refresh is armed.

> 🚨 **THE POLICY-DDL WINDOW RULE (lane `POLICY-LOCK`, 2026-09-22) — it binds every job, every
> migration and every lane, not just this directory.**
>
> Every `CREATE`, `ALTER` or `DROP POLICY` run as `postgres` on this database takes ACCESS
> EXCLUSIVE on twenty-three relations that have nothing to do with it — sixteen `auth.*`, five
> `storage.*`, `realtime.messages` and `realtime.subscription` — and PostgreSQL **holds them
> until COMMIT**. While they are held nobody can sign in, refresh a token, read a file or receive
> a realtime message. It is **not one of our event triggers** (proven by suppressing all eighteen
> and watching the locks appear anyway); it is Supabase's own `supautils.policy_grants` hook,
> context `sighup`, read from their configuration file, and `SET`, `SET LOCAL` and
> `ALTER ROLE … SET` are each refused. **There is nothing of ours to turn off. The only lever we
> own is how long the transaction lasts.**
>
> So, from 2026-09-22:
>
> 1. **Policy DDL runs ONE TABLE PER TRANSACTION.** A loop that regenerates many tables inside one
>    transaction freezes sign-in for the whole loop. `iam.apply_rls` is one table; call it once per
>    transaction, never inside a `DO $$ … FOR … LOOP … END LOOP $$` that spans a schema.
> 2. **Policy DDL belongs in the 1–4 AM Pacific window** — unless it is ONE table and under a
>    second, which since this date it is: `iam._apply_rls_unchecked` now computes everything first,
>    does every non-policy side effect (RLS on, the anon grant or revoke, `iam.apply_table_grants`,
>    the governance guard) and issues the drop/create policy statements LAST, back to back, with
>    nothing between them and nothing after them but COMMIT. Measured on the dev clone on
>    `iam.api_keys`: **first policy DDL → COMMIT was 4,418 ms, and is now 89 ms.** Cross-checked on
>    the MAIN database the same day: while a full `iam.apply_rls` transaction was running, a second
>    connection read `auth.users` in 83 ms.
> 3. **A migration file that contains policy DDL is POLICY-ONLY** — policy statements, the grants
>    and comments that belong with them, `set local`, and a `platform.entity_types` declaration that
>    must be atomic with them. Nothing else. `pnpm db:apply` refuses a campaign file that mixes them,
>    by name, before a connection exists. Self-test: `pnpm check:migration-policy-only:self-test`.
> 4. **The lock set is watched, not assumed.** `scripts/campaign-tests/policylock_green.sql` asserts
>    that a `create policy` locks its own table plus exactly the `supautils.policy_grants` set and
>    nothing more — green today, red the day one of our triggers starts escalating or Supabase
>    changes the list. Its red twin (`policylock_red.sql`) plants an escalating event trigger and
>    proves the guard can fail. Both run in the nightly clone sweep; the green one is also a release
>    gate, `pnpm check:policy-lock-set`.

> ## 🚨 THE SECOND DOOR ONTO THE SAME CORRIDOR: TRIGGER DDL (lane TRIGGER-LOCK, 2026-09-22)
>
> A policy change is not the only statement that freezes this estate. Lane OLD-TABLES-1 hit the
> same freeze from a `drop trigger` on `custom.record` — ~810 ms with sign-in stopped — and
> believed it was our partitioning. It is not. **Measured on the dev clone, 2026-09-22, each probe
> inside a rolled-back transaction, from the measuring backend's own `pg_locks`:**
>
> | statement | strongest lock | its own relations | + supautils set | total ACCESS EXCLUSIVE | elapsed |
> |---|---|---|---|---|---|
> | `create trigger` on `custom.record` (16 partitions) | SHARE ROW EXCLUSIVE | 17 (parent + 16) | no | **0** | 3.7 ms |
> | `create trigger` on a 4-partition scratch table | SHARE ROW EXCLUSIVE | 5 | no | **0** | 1.2 ms |
> | `create trigger` on an unpartitioned table | SHARE ROW EXCLUSIVE | 1 | no | **0** | 0.7 ms |
> | `drop trigger` on `custom.record` | ACCESS EXCLUSIVE | 17 | **yes, 23** | **40** | 3.7 ms |
> | `drop trigger` on a 4-partition scratch table | ACCESS EXCLUSIVE | 5 | **yes, 23** | **28** | 1.3 ms |
> | `drop trigger` on an unpartitioned table | ACCESS EXCLUSIVE | 1 | **yes, 23** | **24** | 0.8 ms |
> | `alter table … disable trigger` on `custom.record` | SHARE ROW EXCLUSIVE | 17 | no | **0** | 13.1 ms |
> | `alter table … enable/disable trigger` on an unpartitioned table | SHARE ROW EXCLUSIVE | 1 | no | **0** | 10.0 ms |
> | `create or replace function` of a trigger function | none on any table | 0 | no | **0** | 72.8 ms |
> | `create policy` (the POLICY-LOCK baseline, same harness) | ACCESS EXCLUSIVE | 1 | **yes, 23** | **24** | 0.8 ms |
>
> **What the table says, and it corrects two beliefs:**
>
> 1. **`drop trigger` is the expensive one, and it freezes sign-in exactly like a policy change.**
>    The 23 `auth.*`/`storage.*`/`realtime.*` relations appear on a `drop trigger` against an
>    ORDINARY UNPARTITIONED table too, so Supabase's `supautils.policy_grants` hook is not
>    policy-specific: it fires on DDL. The partition count is simply the multiplier on top of it.
> 2. **`create trigger` and `alter table … enable/disable trigger` take SHARE ROW EXCLUSIVE, not
>    ACCESS EXCLUSIVE** (PostgreSQL 15 lowered the latter). They stop no reader and no sign-in —
>    they stop every WRITER to the table and all of its partitions for the length of the
>    transaction. That is still an outage of the record store; it is not an outage of the platform.
> 3. **The fan-out is PostgreSQL's, not ours.** A scratch hash-partitioned table this campaign never
>    touched behaves identically — 5 own relations where `custom.record` has 17. So the cost scales
>    with the partition count, and `history.row_versions` has **29**.
> 4. **Replacing a trigger function's body is free.** Trigger LOGIC can be fixed at midday; which
>    triggers EXIST cannot.
>
> So, from 2026-09-22:
>
> 1. **A migration file carrying trigger DDL on a partitioned parent (`custom.record`,
>    `history.row_versions`) is WINDOW-CLASS.** It declares itself with a header line —
>    `-- window-class: <why>` — at every target, and `pnpm db:apply --target production` REFUSES it
>    outside **01:00–04:00 Pacific**, on the bytes and the clock, before a connection exists. There
>    is no flag that removes the window; that switch was itself the defect on 2026-09-21.
> 2. **Its inverse is window-class too** — undoing a trigger is `drop trigger`, the expensive half —
>    so it carries the same declaration and the abort checklist can see the freeze coming.
> 3. **58 files predate the rule** (33 in `migrations/campaign/`, 25 in `migrations/inverse/`) and
>    are grandfathered BY NAME in `WINDOW_CLASS_GRANDFATHERED`. Adding a name there is not a fix.
> 4. **The lock set is watched, not assumed.** `scripts/campaign-tests/triggerlock_green.sql`
>    asserts, per statement kind, that trigger DDL on a scratch partitioned parent locks exactly
>    its own relations (and, for `drop trigger`, exactly those plus the supautils set) and nothing
>    more. Its red twin `triggerlock_red.sql` plants an escalating event trigger and proves BOTH
>    arms of the predicate can fail. Both run in the nightly clone sweep; the green one is a release
>    gate, `pnpm check:trigger-lock-set`, and the byte-level rule has
>    `pnpm check:migration-window-class:self-test`.

> ## 🚨 THE WHOLE CORRIDOR, MEASURED: EVERY DDL CLASS A MIGRATION CAN CARRY (lane DDL-LOCK-CENSUS, 2026-09-22)
>
> POLICY-LOCK judged by the word "policy". TRIGGER-LOCK judged by the words "drop trigger". Both
> were right about what they had measured and silent about the twenty classes they had not — and
> **a name is a guess about a lock.** So every DDL class a campaign file can carry was measured the
> same way TRIGGER-LOCK measured triggers: on the dev clone, each probe inside its own
> `begin … rollback` against a COMMITTED scratch estate (one plain table, one four-partition hash
> parent), locks read from the measuring backend's own `pg_locks`, counting only relations that
> existed before the probe. `CONCURRENTLY` cannot run in a transaction, so it was read from a
> second connection while a third held the build waiting. Two runs, identical on strongest lock,
> hook membership and ACCESS EXCLUSIVE count.
>
> | statement | shape | strongest lock | own relations | + supautils set | total ACCESS EXCLUSIVE | ms | window-class |
> |---|---|---|---|---|---|---|---|
> | `create table` | plain table | ACCESS SHARE | 8 | no | **0** | 11.5 | · |
> | `create table` | 4-partition parent | ACCESS SHARE | 6 | no | **0** | 8.9 | · |
> | `drop table` | plain table | ACCESS EXCLUSIVE | 2 | no | **2** | 1.3 | · |
> | `drop table` | 4-partition parent | ACCESS EXCLUSIVE | 10 | no | **10** | 2.7 | **WINDOW** |
> | `add column` | plain table | ACCESS EXCLUSIVE | 8 | no | **1** | 8.3 | · |
> | `add column` | 4-partition parent | ACCESS EXCLUSIVE | 10 | no | **5** | 8.5 | **WINDOW** |
> | `drop column` | plain table | ACCESS EXCLUSIVE | 6 | no | **1** | 8.4 | · |
> | `drop column` | 4-partition parent | ACCESS EXCLUSIVE | 10 | no | **5** | 8.8 | **WINDOW** |
> | `alter column type` | plain table | ACCESS EXCLUSIVE | 13 | no | **6** | 17.6 | · |
> | `alter column type` | 4-partition parent | ACCESS EXCLUSIVE | 35 | no | **25** | 28.9 | **WINDOW** |
> | `add constraint fk` | plain table | SHARE ROW EXCLUSIVE | 21 | no | **0** | 12.1 | · |
> | `add constraint fk` | 4-partition parent | SHARE ROW EXCLUSIVE | 38 | no | **0** | 12.0 | · |
> | `add constraint unique` | plain table | ACCESS EXCLUSIVE | 7 | no | **1** | 10.9 | · |
> | `add constraint unique` | 4-partition parent | ACCESS EXCLUSIVE | 11 | no | **1** | 14.7 | **WINDOW** |
> | `add constraint check` | plain table | ACCESS EXCLUSIVE | 6 | no | **1** | 8.6 | · |
> | `add constraint check` | 4-partition parent | ACCESS EXCLUSIVE | 10 | no | **5** | 9.3 | **WINDOW** |
> | `drop constraint` | plain table | ACCESS EXCLUSIVE | 6 | no | **1** | 8.4 | · |
> | `drop constraint` | 4-partition parent | ACCESS EXCLUSIVE | 10 | no | **5** | 8.6 | **WINDOW** |
> | `create index` | plain table | SHARE | 1 | no | **0** | 2.3 | · |
> | `create index` | 4-partition parent | SHARE | 5 | no | **0** | 4.6 | · |
> | `drop index` | plain table | ACCESS EXCLUSIVE | 2 | no | **2** | 0.7 | · |
> | `drop index` | 4-partition parent | ACCESS EXCLUSIVE | 10 | no | **10** | 1.2 | **WINDOW** |
> | `rename index` | plain table | SHARE UPDATE EXCLUSIVE | 1 | no | **0** | 0.5 | · |
> | `rename index` | 4-partition parent | SHARE UPDATE EXCLUSIVE | 1 | no | **0** | 0.4 | · |
> | `create policy` | plain table | ACCESS EXCLUSIVE | 1 | **yes, 23** | **24** | 0.7 | **WINDOW** |
> | `create policy` | 4-partition parent | ACCESS EXCLUSIVE | 1 | **yes, 23** | **24** | 0.7 | **WINDOW** |
> | `drop policy` | plain table | ACCESS EXCLUSIVE | 2 | **yes, 23** | **24** | 0.8 | **WINDOW** |
> | `drop policy` | 4-partition parent | ACCESS EXCLUSIVE | 2 | **yes, 23** | **24** | 0.8 | **WINDOW** |
> | `alter policy` | plain table | ACCESS EXCLUSIVE | 1 | **yes, 23** | **24** | 0.7 | **WINDOW** |
> | `alter policy` | 4-partition parent | ACCESS EXCLUSIVE | 1 | **yes, 23** | **24** | 0.7 | **WINDOW** |
> | `create trigger` | plain table | SHARE ROW EXCLUSIVE | 5 | no | **0** | 0.9 | · |
> | `create trigger` | 4-partition parent | SHARE ROW EXCLUSIVE | 9 | no | **0** | 1.2 | · |
> | `drop trigger` | plain table | ACCESS EXCLUSIVE | 2 | **yes, 23** | **24** | 0.9 | **WINDOW** |
> | `drop trigger` | 4-partition parent | ACCESS EXCLUSIVE | 6 | **yes, 23** | **28** | 1.3 | **WINDOW** |
> | `enable/disable trigger` | plain table | SHARE ROW EXCLUSIVE | 6 | no | **0** | 8.2 | · |
> | `enable/disable trigger` | 4-partition parent | SHARE ROW EXCLUSIVE | 10 | no | **0** | 8.4 | · |
> | `drop function` | no table | ACCESS SHARE | 4 | no | **0** | 0.7 | · |
> | `create or replace function` | no table | ACCESS SHARE | 8 | no | **0** | 72.7 | · |
> | `grant` | plain table | ACCESS SHARE | 18 | no | **0** | 71.8 | · |
> | `grant` | 4-partition parent | ACCESS SHARE | 18 | no | **0** | 70.4 | · |
> | `revoke` | plain table | ACCESS SHARE | 8 | no | **0** | 64.5 | · |
> | `revoke` | 4-partition parent | ACCESS SHARE | 8 | no | **0** | 64.4 | · |
> | `enable rls` | plain table | ACCESS EXCLUSIVE | 6 | no | **1** | 8.1 | · |
> | `enable rls` | 4-partition parent | ACCESS EXCLUSIVE | 6 | no | **1** | 8.0 | **WINDOW** |
> | `force rls` | plain table | ACCESS EXCLUSIVE | 6 | no | **1** | 8.1 | · |
> | `force rls` | 4-partition parent | ACCESS EXCLUSIVE | 6 | no | **1** | 7.9 | **WINDOW** |
> | `truncate` | plain table | ACCESS EXCLUSIVE | 8 | no | **6** | 3.0 | · |
> | `truncate` | 4-partition parent | ACCESS EXCLUSIVE | 33 | no | **25** | 7.1 | **WINDOW** |
> | `create view` | no table | ACCESS SHARE | 3 | no | **0** | 7.1 | · |
> | `drop view` | no table | ACCESS EXCLUSIVE | 1 | no | **1** | 0.8 | · |
> | `comment on table` | plain table | SHARE UPDATE EXCLUSIVE | 2 | no | **0** | 0.6 | · |
> | `comment on table` | 4-partition parent | SHARE UPDATE EXCLUSIVE | 2 | no | **0** | 0.6 | · |
> | `create index concurrently` | plain table | SHARE UPDATE EXCLUSIVE | 1 | no | **0** | — | · |
> | `create index concurrently` | 4-partition parent | unsupported | 0 | no | **0** | — | · |
> | `drop index concurrently` | plain table | SHARE UPDATE EXCLUSIVE | 2 | no | **0** | — | · |
>
> **TWO BELIEFS THIS CORRECTS, AND ONE BLIND SPOT IT CLOSES:**
>
> 1. **The supautils hook is NOT "fired by DDL generally".** TRIGGER-LOCK's sentence was too
>    broad. Measured, `supautils.policy_grants` freezes its 23 `auth`/`storage`/`realtime`
>    relations on `CREATE`/`ALTER`/`DROP POLICY` and on `DROP TRIGGER` — **and on nothing else in
>    the census.** `drop table`, `alter column … type`, `truncate`, `drop index`, `drop view` and
>    `enable rls` all take ACCESS EXCLUSIVE with **zero** hook relations. Sign-in survives them.
> 2. **ACCESS EXCLUSIVE is far more widespread than the name rules knew.** Eight classes with no
>    trigger and no policy word anywhere take it on a partitioned parent and fan it out across
>    every partition: `drop table`, `add column`, `drop column`, `alter column type`,
>    `add constraint unique/check`, `drop constraint`, `drop index`, `enable rls`, `force rls`,
>    `truncate`. On `custom.record` that is 17 relations, on `history.row_versions` 29. The old
>    rule would have applied every one of them at noon.
> 3. **The cheap ways to do the same job are cheap, and now provably so.** `create index` takes
>    SHARE (and `CONCURRENTLY` only SHARE UPDATE EXCLUSIVE — unsupported on a partitioned parent);
>    `add constraint … foreign key` takes SHARE ROW EXCLUSIVE; `grant`, `revoke`, `create table`,
>    `create view`, `drop function` and `create or replace function` take nothing stronger than
>    ACCESS SHARE; `rename index` and `comment on` take SHARE UPDATE EXCLUSIVE. **None of them is
>    window-class.** A rule that fired on every statement would be a rule someone switches off.
>
> **THE RULE, FROM 2026-09-22 — the runner reads the measurement, not the statement's name:**
>
> 1. `scripts/lib/ddl-lock-footprint.json` is the census, checked in beside the runner. A
>    statement is **WINDOW-CLASS** at `--target production` when its measured footprint either
>    **(a)** includes the hook set — sign-in, token refresh, file reads and realtime stop until
>    COMMIT — or **(b)** holds **ACCESS EXCLUSIVE on a partitioned parent**. `pnpm db:apply`
>    refuses it without a `-- window-class: <why>` header at every target, and refuses it outside
>    **01:00–04:00 Pacific** at production, on the bytes and the clock, before a connection
>    exists. No flag removes the window.
> 2. **An unreadable or unparseable census is a REFUSAL, never a fallback.** An unmeasured
>    footprint must never read as "nothing freezes".
> 3. **The old trigger name rule stays underneath as the FLOOR.** Whatever the JSON says, trigger
>    DDL on a partitioned parent is window-class — so a truncated or stale census can only make
>    the verdict stricter than it was on 2026-09-22, never weaker.
> 4. **It is proven that the JSON is load-bearing.** `pnpm check:migration-window-class:self-test`
>    runs the same verdict against a census in which `GRANT` was measured as firing the hook, and
>    GRANT must become window-class with no code change. Delete that arm and the rule is back to
>    judging by name. RED-4 and RED-5 add the two blind spots (ACCESS EXCLUSIVE with no trigger
>    word; policy DDL on an unpartitioned table); GREEN-3 holds the harmless classes harmless on
>    the parent itself; GREEN-5 proves the missing-census refusal.
> 5. **RE-CENSUS: 291 more files were window-class and always had been** (148 campaign, 143
>    inverse) — 158 `drop policy`, 149 `create policy`, 2 `alter policy`, plus `add column`,
>    `add constraint check`, `drop constraint` and `enable rls` on a partitioned parent. 286 of
>    them were not yet named, so `WINDOW_CLASS_GRANDFATHERED` went from 58 to **344**. Their bytes
>    are ledgered history and this campaign does not rewrite an applied file. **Adding a name
>    there is still not a fix.**
>
> ⚠️ **WHAT THIS COSTS, SAID OUT LOUD.** Under this rule **every future migration containing
> policy DDL is window-class** and is refused at production outside 1–4 AM — including the
> one-table `iam.apply_rls` call POLICY-LOCK measured at 89 ms and explicitly allowed at midday
> ("unless it is ONE table and under a second"). The measurement says a 89 ms sign-in freeze is
> still a sign-in freeze; the earlier ruling says a sub-second one is affordable. **The two
> disagree and the disagreement is Arman's to settle.** Until he does, the stricter reading is
> the one in force, because it is the one that cannot cause an outage.


> ### THE ONE VERIFIED EXEMPTION — `-- policy-ddl: one-table` (chair ruling, 2026-09-22)
>
> The census made every policy migration window-class. POLICY-LOCK's midday allowance survives it
> **as an exemption the runner PROVES, never a switch a file asserts.** A file may declare
> `-- policy-ddl: one-table`; at `--target production` outside the window the runner honours it
> only when it can prove both halves itself: **(a)** every policy statement names the SAME ONE
> table and the file is policy-only, and **(b)** a `pnpm db:rehearse <file> --target clone`
> (`--measure-only` for the measure pass alone) recorded **first-policy-DDL → end of transaction
> under 200 ms** for THESE EXACT BYTES, in `migrations/measurements/<sha256>.json`, checked in and
> hash-bound the way a night job's inverse gate is bound to its inverse. Anything missing is a
> refusal that NAMES the missing proof; one changed byte and the measurement stops answering for
> the file. Proof: `pnpm check:migration-window-class:self-test` arms RED-6 (no measurement),
> RED-7 (declares one table, names two — refused by counting), RED-8 (4,418 ms, POLICY-LOCK's own
> before-number), RED-9 (a drop trigger riding along), GREEN-6. Measured live the same day on the
> clone: `drop policy` + `create policy` on `iam.api_keys` = **244 ms, refused**; the single
> `create policy` = **115 ms, window waived**.

A night job is a **one-shot**: it fires once, on a calendar time, from a launchd user agent, and
deletes its own plist on the way out. It exists because the session that scheduled it will not be
alive when it runs.

Everything below is enforced by [`lib-night.sh`](./lib-night.sh), which every job sources. **Copy a
job, not the rules** — if you find yourself re-implementing one of these in a job file, it belongs
in the library instead.

## 🚨 THE RULE THAT COST US ONE, AND WHY IT IS ABSOLUTE

**A window-guarded job may not carry a switch that removes the window and runs the real thing.**

On 2026-09-21 `night-2026-09-22-row-versions-index.sh` carried `NIGHT_SWEEP_FORCE=1`. It was used
to exercise an unrelated gate, the gate passed, and the script went on and applied a migration to
the live database at **17:19 Pacific — eight hours outside the window**. The job was safe and the
outcome was fine. **The switch was the defect**: a flag whose name says "force" reads like a test
mode and behaves like production.

So there is exactly one override and it does not touch the window:

```sh
NIGHT_REHEARSE=1 ./scripts/night/<job>.sh
```

`NIGHT_REHEARSE=1` changes the **database**, not the schedule. A rehearsal may only ever reach the
rehearsal branch, and that is not taken on trust — `night_assert_target` asks the server for its own
`pg_control_system().system_identifier` and compares it with the checked-in `plan/BRANCH-REF`.
A production connection string handed to a rehearsal is refused before anything happens, whatever
variable it arrived in:

```
REFUSED: a rehearsal may only reach the rehearsal branch.
  expected the branch  7678069749886157684
  the server answered  7642734024280108049  ← THIS IS PRODUCTION
  Nothing attempted.
```

A rehearsal also never touches the plist, so rehearsing cannot disarm the real run.

## The six things every night job has

| | what it is | the library call |
|---|---|---|
| 1 | **Window guard** — refuses outside its Pacific window and says the local time it read | `night_window_guard <open> <close>` |
| 2 | **Target assertion** — the server names itself before anything is taken or run | `night_assert_target branch\|production <psql args…>` |
| 3 | **Inverse hash gate** — for anything that changes the database, the sha256 of the inverse **proven on the branch under rule 27**. A moved inverse is an unproven inverse and the job refuses | `night_inverse_gate <file> <sha256>` |
| 4 | **Lock take/release in a `trap`** — `campaign_watch.build_lock` on the branch, released on **every** exit path including a signal | `night_take_lock` / `night_release_lock` |
| 5 | **Self-delete** — unloads and removes its own plist so it can never fire twice | `night_self_destruct <label>` |
| 6 | **A full log** in `common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/`, one timestamped line per decision, with a `-rehearsal` suffix in rehearsal mode | `say …` + `exec >>"$LOG" 2>&1` |

Plus two rules the library cannot enforce for you:

- **Judge by the output text, never by the exit code.** `psql` exits 0 after a lock-timeout death.
- **Do only the one thing.** A suite sweep runs suites and no migrations; a migration job applies
  one file and runs no suites. A job that does two things has two blast radii.

## The skeleton

```sh
#!/bin/zsh
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh
LABEL="com.aimatrx.night-sweep.<name>"; LANE=<LANE>; OPEN=0100 CLOSE=0330
LOG=.../handoff-2026-09-20/night-<date>-<name>.log
[ "$REHEARSE" = "1" ] && LOG="${LOG%.log}-rehearsal.log"
exec >>"$LOG" 2>&1

night_resolve_psql || exit $?
night_window_guard $OPEN $CLOSE || exit $?
night_inverse_gate "$INVERSE" "$INVERSE_SHA_PROVEN" || exit $?   # if it changes the database
if [ "$REHEARSE" = "1" ]; then night_assert_target branch "$(night_branch_dsn)" || exit $?
else                           night_assert_target production "${PGA[@]}"      || exit $?; fi

cleanup() { local rc=$?; night_release_lock; night_self_destruct "$LABEL"; say "finished, exit $rc"; }
trap cleanup EXIT; trap 'exit 130' INT; trap 'exit 143' TERM

night_take_lock <schema> "$LANE" '<what for>' || exit $?
# … the one thing this job does …
```

## Arming it

`StartCalendarInterval` with `Month`/`Day`/`Hour`/`Minute` pinned to the single occurrence,
`RunAtLoad` **false**, `AbandonProcessGroup` true, stdout and stderr to the same log:

```sh
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<label>.plist
launchctl print "gui/$(id -u)/<label>"      # state, runs = 0, and the calendar descriptor
```

**Rehearse it against the branch — or, when the branch's empty tables would make its probes
meaningless, against the nightly dev clone — before you load it.** A job nobody has watched
succeed is a job nobody should arm. `night_assert_target` takes `clone` as a first-class target,
so a rehearsal that needs production's real data says `clone` and is refused by (system
identifier, project ref) if it is handed anything else — proven RED by `w1-org-apply.sh`'s own
`CLONE_DATABASE_URL`-pointed-at-production run on 2026-09-22.

🚨 **A SEAT PROBE IS ASSERTED AGAINST WHAT THE FILE CHANGES, NEVER AGAINST A NUMBER SOMEBODY
EXPECTED.** W1-ORG's chair step said B2's probe was `billing.tier_no_downgrade()` -> "zero rows —
REC-62's own proof that nobody's tier fell". Measured 2026-09-22, SELECT-only: it is **340 rows on
production and 340 on the clone, before anything is applied**, and the file provably cannot move it
(`billing.subscription` holds zero rows). A probe asserting zero would have stopped the job at its
last file every single time, on a database where nothing was wrong — and it did, in rehearsal,
which is what found it. The probe now reads the count immediately BEFORE the file and refuses if
the file GREW it. Zero growth is the proof; zero rows never was.

## Before you arm anything, prove it refuses

Every refusal is shown RED before the job is trusted, and each one must end in
`Nothing attempted.` / `Nothing done.`:

- outside the window → exit 75
- lock held by another lane → exit 75
- inverse moved → exit 78, both hashes printed
- rehearsal pointed at production → exit 78

## What lives here now

| job | what it did | state |
|---|---|---|
| `night-2026-09-22-row-versions-index.sh` | applied the `history.row_versions` org-latest index | **spent** — ran 2026-09-22 00:19:57Z, plist self-deleted. Kept as the worked example and the incident record |
| `night-2026-09-22-suite-sweep.sh` | the serial sweep of every campaign suite against the MAIN database, 01:35–03:30 PT, hard stop with the remainder named | one-shot |
| `w1-org-apply.sh` | W1-ORG's **four** chair steps against the MAIN database, in the documented order (C, A, B1, B2), each as its OWN short transaction with `lock_timeout` 5 s and three attempts, the documented seat probe after every one, and a HARD STOP on the first probe that does not answer `PASS`. It is the first job here to hold MORE THAN ONE object-scoped lock (`context`, `iam`, `billing`) — `night_take_locks` / `night_release_locks`, added to the library for it, are all-or-nothing and release the ones they got when a later one is held. `NIGHT_REHEARSE=1` aims it at the **nightly dev clone**, not the branch: the four files only mean anything against production's real data (629 organizations, 34 templates, 805 `user_plan` rows), and a probe on the empty branch would pass and prove nothing | one-shot — armed for 2026-09-23 02:05 PT (`com.aimatrx.night-sweep.w1-org-apply`, self-deleting), after the 01:05 branch refresh so the two never contend |
| `kernel-fingerprint-auto-rerecords.sh` | lane PROVISIONER-SELF-HEAL (2026-09-25): reports, read-only on production, every access-kernel fingerprint the provisioner re-recorded ITSELF in the last 24h (`platform.kernel_fingerprint_record`, twin `ops.system_error` kind `kernel_fingerprint_auto_rerecorded`), every `provisioner_fingerprint_stale` refusal, and a live recorded/actual mismatch; then, on the clone in a rolled-back transaction, whether the fixed equivalence fixture still answers what `platform.kernel_equivalence_expected()` recorded. Exit 1 = something to read, never a failure of the catch-up | **recurring** — run by `clone-catchup.sh` every night after invalid indexes |
| `branch-refresh.sh` | rebuilds the rehearsal branch from the **nightly dev clone's** schema plus a curated reference seed, per `v5/BRANCH-DRIFT.md` §4(c). **It has no production code path at all** — `night_assert_target clone` is the only source it can ask for. The clone is READ ONLY (`pg_dump --schema-only`, `--lock-wait-timeout=5000`, aborts at 10 minutes); the branch is the only thing written, and it is written destructively. `NIGHT_REHEARSE=1` keeps the real clone read and narrows the drop set to one probe schema | **recurring** — armed as a one-shot for 2026-09-23 01:05 PT (`com.aimatrx.night-sweep.branch-refresh`, self-deleting) with a nightly twin at 01:05 (`com.aimatrx.night.branch-refresh-nightly`) that stays **disabled** until the one-shot's log shows a clean run |

The plists live in [`plists/`](./plists/) so they are reviewable in the repo rather than only in
`~/Library/LaunchAgents`. A recurring job's label must differ from any one-shot's, because
`night_self_destruct` removes the plist named by the job's own `LABEL`.

**Arming a job that must stay OFF until somebody reads a log.** `<key>Disabled</key><true/>` in
the plist does not do it — `launchctl bootstrap` answers `Bootstrap failed: 5: Input/output
error` and the job is never registered at all, and so does a bootstrap of a label already sitting
in launchd's disabled override database. The order that works, and the proof:

```sh
launchctl enable    "gui/$(id -u)/<label>"
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<label>.plist
launchctl disable   "gui/$(id -u)/<label>"
launchctl print-disabled "gui/$(id -u)" | grep <label>      # => "<label>" => disabled
```

The override database is what survives a reboot, so that is where the OFF lives — never in the
plist file.
