# `scripts/night/` — unattended jobs that run inside the maintenance window

> 🚨 **2026-09-21 (Claude Fable 5.1, release-automation session, on Arman's word):** the one-shot
> `com.aimatrx.night-sweep.suite-sweep` for 2026-09-22 01:35 was **unloaded** and its plist renamed
> `…plist.PAUSED-2026-09-21`. It runs ~190 suites serially against PRODUCTION, the class of Sunday
> night's lock incident; Arman ruled that nothing of that kind runs tonight. The two branch-refresh
> jobs were left loaded (branch-only writes). The way suites come back is against the nightly clone:
> `common-docs/projects/database-workload-safety/DEV-CLONE-AND-BACKUP.md`. Re-arm only on Arman's word.
>
> 🚨 **Identity trap (measured 2026-09-22):** a Supabase DATA branch (`with_data: true`) is a physical
> restore and reports the **same `pg_control_system().system_identifier` as production**. Your
> `night_assert_target`, which keys on that identifier, cannot distinguish such a clone from
> production. It is fine for your schema-only branch (different identifier) but must assert on the
> connection user `postgres.<ref>` or the host before it is ever pointed at the nightly clone
> (`common-docs/operations/clone/CURRENT.md`).
>
> 🚨 **2026-09-22 ~00:10 PT (same session, on Arman's word):** `com.aimatrx.night.branch-refresh-nightly`
> (daily 01:05) and the one-shot `com.aimatrx.night-sweep.branch-refresh` (2026-09-23 01:05) were also
> **unloaded**, plists kept as `.PAUSED-2026-09-22`. They write only the branch, but each takes a
> ~7-minute `pg_dump --schema-only` of production (ACCESS SHARE on every table). Nothing of ours is
> loaded on the Mac now. When these return, take the schema from the nightly clone, not production.


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
| `branch-refresh.sh` | rebuilds the rehearsal branch from production's **schema** plus a curated reference seed, per `v5/BRANCH-DRIFT.md` §4(c). Production is READ ONLY (`pg_dump --schema-only`, `--lock-wait-timeout=5000`, aborts at 10 minutes); the branch is the only thing written, and it is written destructively. `NIGHT_REHEARSE=1` replaces the production read with a read of the branch's own catalog and narrows the drop set to one probe schema | **recurring** — armed as a one-shot for 2026-09-23 01:05 PT (`com.aimatrx.night-sweep.branch-refresh`, self-deleting) with a nightly twin at 01:05 (`com.aimatrx.night.branch-refresh-nightly`) that stays **disabled** until the one-shot's log shows a clean run |

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
