# FEATURE.md — `admin/performance-watch`

**Status:** `active` (wave 1)
**Tier:** `2`
**Last updated:** `2026-10-08`

## Purpose

The admin board for performance watches: one row per `ops.proof_check` with `kind='perf'`, its
history in `ops.perf_sample`. Design and storage contract:
`common-docs/systems/architecture/observability/performance-watch/PLAN.md` §1, §3, §6. This file is
the page's mechanics.

## Entry points

- `/administration/reporting/performance` — the list: label (opens the drill), kind, owner, state,
  newest judged number (the sample column `budget_stat` names) against budget (warning tone when
  over), 7-day sparkline, baseline, last alert, sample age (warning tone past 3x cadence). Header
  counts per state. Platform scope, no organization filter.
- `?watch=<proof_check id>` — one watch: facts, subject, history chart (p50 and p95, or mean, with
  budget and baseline lines), state history (changes of `state_after`), sample table, 25 per page.

Registered in `admin-categories.ts` (Reporting) and `admin-navigation.ts` (Platform Reporting).
Surface: `matrx-admin/reporting`, `reporting_section: "performance"`.

## Files

- `service.ts` — the only reads (browser client on the admin lane, `readAllRows`). Never writes.
  Untyped client: the perf columns and `ops.perf_sample` are not in `types/database.types.ts` yet;
  `model.ts` holds the narrow row types. After `pnpm db-types` carries them, switch to
  `Database["ops"]`.
- `model.ts` + `model.test.ts` — pure: judged value, budget tone, stale tone, per-watch summary,
  state counts and history, sparkline points.
- `PerformanceWatchConsole.tsx` — list (`MatrxDataTable`) and drill (inline SVG chart).

## Not built

Edit budget, pin baseline and pause need an `ops.perf_*` platform-admin function; none exists, and
the client never writes the tables. Add the controls when the function ships.
