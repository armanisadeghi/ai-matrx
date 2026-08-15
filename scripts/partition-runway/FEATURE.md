# Partition runway check — time-bounded DDL that expires on the calendar

**Status:** live · advisory in both release-gate modes · `pnpm check:partition-runway`

## Why this exists

`history.row_versions` is RANGE-partitioned on `occurred_at`. In August 2026 its
last partition ended and nothing created the next one, so the version trigger on
**121 versioned tables** raised on every INSERT/UPDATE/DELETE for **four days** —
no file, note, task, transcript or agent run was written (D122).

**Every schema check we run would have passed for all four days.** `pnpm
check:schema` and aidream's schema analysis compare code against DB *shape*, and
the shape was correct the whole time. What was exhausted was the **data range**
the shape covers. Structure does not change while time runs out, so a structural
diff can never see this class. This check is the one that knows what day it is.

The provisioner itself was fixed in
`migrations/history_row_versions_partition_autoprovision.sql` (pg_cron, 18-month
runway, catch-all, alarm). This is the guard that tells us when that fix stops
working.

## What it checks

| Finding | Severity | Meaning |
|---|---|---|
| `runway` | error / warn | Days between `now()` and the highest partition upper bound is under the table's threshold. Error once the runway is gone or shorter than one provisioning cycle. |
| `default-rows` | error | The catch-all (`DEFAULT`) partition **has rows**. Rows only land there when no real partition covered their key — the provisioner already failed and the catch-all hid it. |
| `runway-unknown` | error | RANGE-partitioned on a time key, but no readable upper bound. Indistinguishable from zero runway. |
| `cron-stalled` | error | An active pg_cron job has not run for 3× its own schedule interval. This is the shape the outage actually had. |
| `cron-failed` | error | The job's last run did not succeed. |
| `cron-inactive` / `cron-never-ran` | warn | Disabled, or no run history at all. |

Partitions that cannot run out are silent by design: an unbounded (`MAXVALUE`)
top partition, and non-time partition keys, where "days of runway" is not a
number that exists.

## The threshold, and why it is 60 days

`MIN_RUNWAY_DAYS = 60` in [`core.ts`](./core.ts). `history.row_versions`
provisions **monthly**, so a floor under one month would let the alarm and the
outage arrive in the same week — which is not an alarm. 60 days is two full
monthly cycles: the provisioner can miss a run entirely and we still get told
with a month of slack. Raising it costs nothing (the fixed provisioner keeps an
18-month runway). Below ~35 the check is decorative.

Tables with a **slower** cadence get `2 × cadence` instead, so a quarterly table
is held to 180 days rather than the floor.

The cadence is **measured, not configured** — the RPC reports the narrowest
observed partition width, so a new partitioned table is covered the day it is
created, with nobody remembering to register it.

### Foreign (vendor-managed) partitions

`FOREIGN_PARTITION_OWNERS` in `core.ts` carries the partition sets **we do not
provision**. Today that is `realtime.messages`: Supabase Realtime maintains a
rolling ~3-day daily window itself. A 60-day floor would scream about it every
single day forever, and a check that cries wolf is a check people turn off. It
still gets a threshold in its own units (2 days), so a genuinely dead vendor
provisioner is still caught.

These are `CAPS` constants in the file, never env vars — a threshold is not an
environment-specific value, and a forgotten dashboard toggle is precisely the
failure mode this check exists to prevent (CLAUDE.md § An env var is a VALUE,
never a TOGGLE).

## How it runs

- Live-DB only, via the read-only `public.partition_runway_snapshot()` RPC
  (`migrations/partition_runway_snapshot_rpc.sql`), the same pull pattern as
  `public.schema_truth_snapshot()`. Structural metadata and counts only — no row
  data leaves the database.
- **No offline/snapshot mode, on purpose.** A committed snapshot of "days
  remaining" is wrong the moment it is committed. If the DB is unreachable the
  check says loudly that runway was NOT checked, and exits 0.
- `--strict` exits 1 on any error-severity finding (CI); `--json` for machines.

## Where it is wired

- `scripts/run-release-gates.sh` — **advisory in both modes**, per Arman's
  standing rule (scream, never block). Deliberately advisory even in `--strict`:
  this is the only gate whose subject is the calendar rather than the diff, and a
  release unrelated to `history.row_versions` must not be blocked because a
  partition expires in seven weeks.
- `pnpm check:partition-runway` / `:strict` / `:json`.

## Guarding the guard

The live DB is healthy, so a green run proves only that the check *runs*.
[`scripts/__tests__/check-partition-runway.test.ts`](../__tests__/check-partition-runway.test.ts)
replays the D122 outage and its neighbours against the pure core — exhausted
runway, a catch-all that started filling, a stalled provisioning job — and
asserts each one fires. Change a threshold or a rule, and that file changes with
it.

## Known limits

- Only **RANGE** partitions can run out; LIST/HASH are not examined.
- Runway is measured against the **highest** upper bound. A hole in the middle of
  the range (a missing month between two present ones) is not detected here —
  the catch-all row probe is what catches that class after the fact.
- pg_cron overdue detection understands the schedule spellings actually in use
  (`N seconds`, `*/n * * * *`, hourly, daily, weekly, day-of-month). Anything
  more exotic is reported as un-parseable and skipped rather than guessed.
- `cron.job_run_details` is pruned, so "never ran" can mean "not run recently".

## Change log

- 2026-08-15 — Built (D122 residual 1). RPC + pure core + CLI + 27 tests; wired
  advisory into both release-gate lists.
