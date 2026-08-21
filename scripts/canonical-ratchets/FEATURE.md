# Canonical ratchets — new tables cannot be born non-conformant

**Status:** live · **BLOCKING in `--strict`** (loud, exit 0 otherwise) ·
`pnpm check:canonical-ratchets`

Two gates, one live snapshot:

| Gate | Command | Baseline |
|---|---|---|
| Unregistered entity-like tables | `pnpm check:unregistered-entities` | `unregistered-entities-baseline.json` (+ `unregistered-entities-allowlist.json`) |
| Post-doctrine conformance | `pnpm check:post-doctrine` | `post-doctrine-baseline.json` |

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
