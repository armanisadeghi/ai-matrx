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

**Rehearse it against the branch before you load it.** A job nobody has watched succeed is a job
nobody should arm.

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
