# Canonical ratchets — new tables cannot be born non-conformant

**Status:** live · **BLOCKING in `--strict`** (loud, exit 0 otherwise) ·
`pnpm check:canonical-ratchets`

Four gates, two live snapshots:

| Gate | Command | Baseline |
|---|---|---|
| Unregistered entity-like tables | `pnpm check:unregistered-entities` | `unregistered-entities-baseline.json` (+ `unregistered-entities-allowlist.json`) |
| Post-doctrine conformance | `pnpm check:post-doctrine` | `post-doctrine-baseline.json` |
| **NO NULL ORG** — NULL-org row count | `pnpm check:org-null` | `org-null-baseline.json` |
| **NO NULL ORG** — nullable-org column set | `pnpm check:org-null` | `org-null-baseline.json` |

The first two read `public.canonical_ratchet_snapshot()` (the cached audit
store); the NO NULL ORG pair reads `public.org_null_ratchet_snapshot()` (live,
~1s) and shares one command because it is one RPC call and one story.

## Why this exists

The 2026-08-15 canonical architecture drift audit's finding was not that the
canon had eroded — it mostly had not. It was structural:

> **every conformance alarm in the platform is advisory, and the one alarm that
> fires at creation time (`ddl_guard_log`) has no reader.**

Its enforcement recommendation, item 2, is exactly these two gates: ratchets on
the two live counts, in the `package_boundaries_baseline.json` shape — a
committed baseline count, the gate fails when the live count **exceeds** it,
shrinking updates the baseline. Adjudication:
`common-docs/projects/archive/db-changeover-2026-08/architecture-drift-audit-2026-08-15.md`.

The point is asymmetric on purpose. **New tables cannot be born
non-conformant without failing a gate; the legacy queue stays a queue.** There
are ~913 `verify_canonical` FAILs across 171 tables and ~48 unregistered
entity-like tables — nobody clears that in one release, and a gate that demanded
it would block every release until the campaign landed. So the baselines are
seeded from today's live numbers and only growth is a failure.

## Ratchet 1 — unregistered entity-like tables

Source: `audit.unregistered_candidates` with `base_col_score >= 4` — the
platform's own definition of "carries the base-entity shape and is not in
`platform.entity_types`" (db-rules FEATURE.md §11).

Minus **`unregistered-entities-allowlist.json`**, where a **reason is required
per entry** (the script exits 2 on a missing or throwaway reason). That file is
not decoration: the 08-15 audit's finding 2 was that the deliberately-unregistered
plumbing had no *record* of being deliberate. This is that record.

Seeded 2026-08-21: **48 tracked, 0 allowlisted.**

**Fix when it fires:** register the table with `platform.create_entity_table(...)`,
or add it to the allowlist with a real reason. Shrink the baseline with
`--update-baseline`. Raising it is an Arman decision.

## Ratchet 2 — post-doctrine conformance

Source: `audit.canonical_findings` rows with `status = 'FAIL'` (the cached
`iam.verify_canonical` output), restricted to tables **born after the 2026-08-12
doctrine cutoff**.

Seeded 2026-08-21: **22 FAIL findings**, all on four `seo` tables —
`page_measurement_health`, `source_request`, `story_angle`, `landscape_brief`.

### How "created after" is determined

`platform.entity_types` carries **no registration timestamp**, so registration
cannot date a table. The only machine-readable birth record in this database is
the DDL sentinel's log:

```sql
min(occurred_at) FROM platform.ddl_guard_log
WHERE command_tag = 'CREATE TABLE' AND object_ref = '<schema>.<table>'
```

That heuristic lives in `public.canonical_ratchet_snapshot()` and is restated in
both the migration and the script header. It is a **floor, not a census**, with
two blind spots the gate states out loud instead of absorbing:

1. **The log starts 2026-08-13 00:46 UTC** (earliest recorded `CREATE TABLE`:
   06:15). Anything born in the ~25h between the cutoff and the first log row
   reads as legacy. No second signal exists to close that window.
2. **`ddl_guard` is an event trigger, and a project restore silently drops event
   triggers** — this already happened to all five platform event triggers
   (db-rules FEATURE.md change log, 2026-08-20). A dropped guard means births
   stop being recorded and this ratchet would read green forever. So the
   snapshot reports whether `ddl_guard` is attached *and* enabled, and `--strict`
   **fails** when it is not. A blind ratchet is a failure, not a pass.

### The two ratchets are a pair

`audit.canonical_findings` only covers **registered** tables, so a new table that
is never registered produces no findings at all — ratchet 2 cannot see it.
Ratchet 1 is that hole's cover. Neither alone is the gate.

## The refresh cost

`audit.refresh()` rebuilds every snapshot table and runs `plpgsql_check` over
every plpgsql function. Measured on live 2026-08-21: **4.5–5.5s**, and it
**writes** — and under contention it exceeded the ORM's own command timeout. That
is neither fast nor deterministic enough for a release gate, so:

- The gates read the **cached** audit store (`~0.7s` end to end) and never
  refresh on the hot path.
- The **age of that cache is part of every report**, never omitted:
  under 24h fresh · 24h–7d a loud WARN · over 7d `ROTTEN`, which **fails**
  `--strict` — at that age "no growth" is an assumption, not a measurement.
- The remedy is in the gate's own output: `--refresh` runs
  `public.canonical_ratchet_refresh()` (a service_role-only wrapper over
  `audit.refresh()`) before reading.

Nothing is silently skipped.

## Database side

`migrations/canonical_ratchet_snapshot.sql` (ledgered, applied 2026-08-21) adds
exactly two functions and nothing else:

- `public.canonical_ratchet_snapshot(p_cutoff, p_min_score) → jsonb` — STABLE
  SECURITY DEFINER, **service_role only**. PostgREST does not expose the `audit`
  schema (PGRST106), so a TypeScript gate has no other way to read it; this is
  the same house pattern as `public.partition_runway_snapshot()`. `anon` and
  `authenticated` are explicitly revoked — the conformance store names every
  structural weakness in the database.
- `public.canonical_ratchet_refresh() → text` — the opt-in `--refresh` remedy.

## Flags

`--strict` (exit 1 over baseline) · `--update-baseline` · `--refresh` · `--json`.

---

## Ratchets 3 + 4 — NO NULL ORG

**Owner ruling, 2026-08-21** (db-rules FEATURE.md §2, *NO NULL ORG*):

> *"If something belongs to the system, that CANNOT EVER be represented by a
> NULL org! Write checks that will scream and paint everything RED if anyone
> does that ... make the release script scream ... NO NULL ORG. the system has
> an org and this is well-established."*

NULL is not a scope. System/global/builtin content belongs to the **system org**
(`matrx-system`, `39c38960-d30c-4840-b0c1-c9960de95582`, `global_readable` in
`iam.system_orgs`); everything a user owns falls back to the creator's **personal
org**. There is no third answer, and the question is settled — it does not go
back to Arman.

These two gates are the DATA and SCHEMA layers of a five-layer enforcement. The
DDL layer is `platform._ddl_guard` lane (e), which **RAISEs** on a `CREATE TABLE`
with a nullable `organization_id` and logs `severity='error'` on an `ALTER TABLE`
that leaves one — it fires at creation time, before a row exists to be wrong.
The ORM layer is `aidream/db/org_null_scream.py`, printed by every
`python db/generate.py`. The aidream release gate is the twin
`aidream/scripts/check_org_null.py`.

### The two counts

| | Source | Contract |
|---|---|---|
| **ROWS** | every nullable-org table, scanned for actual NULLs | may only go **DOWN** |
| **COLUMNS** | the tables that still ALLOW a NULL `organization_id` | a table **NEW to the set** fails |

The COLUMNS half is a **set**, not a count — unlike ratchet 1. Membership is the
actionable fact here and the population is small and named, so a set-diff tells
you exactly which table regressed instead of making you go find it.

The ROWS half is the one that does the real work on the backlog. 38 tables are
still legitimately nullable and the ruling deliberately does **not** force them
NOT NULL in one sweep — but every one of them fails the release the moment it
*grows* its NULL-org count. The flip is optional; new NULLs are not.

### `history` is excluded from the ROWS scan

Not for cost. A `history.row_versions` row is a snapshot of a row already
counted at its source, so counting it double-counts one defect — and worse, it
**inverts the gate**: editing or soft-deleting an existing legacy NULL-org row
captures a new NULL-org version, so the number would GROW and fail a release for
touching old data rather than for creating a new defect. A ratchet that punishes
cleanup is a broken ratchet. (It was also 50s of a 64s scan; excluding it took
the snapshot to ~1s.)

### Seeded 2026-08-21, from live

**21,800 NULL-org rows across 29 tables · 38 tables still nullable.** Seeded from
live, not from zero, for the same reason as ratchets 1 and 2: the gate's job is
preventing growth, and it must never be able to block a release on the legacy
backlog. Both numbers may only shrink; raising either is an Arman decision.

### Database side

`migrations/org_null_ratchet_snapshot.sql` (ledgered, applied 2026-08-21) adds
one function: `public.org_null_ratchet_snapshot() → jsonb`, STABLE SECURITY
DEFINER, **service_role only** — the counts must be taken with the RLS boundary
off, or the gate measures what its own credentials can see instead of what is
true.

### It also fails when the DDL guard is down

`ddl_guard_attached` is part of the snapshot and both halves fail `--strict`
without it. A ratchet on a door nobody is watching is not a gate — and event
trigger bindings are dropped SILENTLY by a project restore (db-rules §1).
