# FEATURE.md — `admin/performance-watch`

**Status:** `active` (wave 2)
**Tier:** `2`
**Last updated:** `2026-10-08`

## Purpose

The admin board for performance watches: one row per `ops.proof_check` with `kind='perf'`, its
history in `ops.perf_sample`. Design and storage contract:
`common-docs/systems/architecture/observability/performance-watch/PLAN.md` §1, §3, §6. This file is
the page's mechanics.

## Entry points

- `/administration/reporting/performance` — the list: label (opens the drill), why (the judge's
  `metadata.perf_last_reason`), kind, owner, state,
  newest judged number (the sample column `budget_stat` names) against budget (warning tone when
  over), 7-day sparkline, baseline, last alert, sample age (warning tone past 3x cadence). Header
  counts per state. Platform scope, no organization filter.
- `?watch=<proof_check id>` — one watch: facts, reason, subject as readable fields (function,
  table + records, organization, seat, args — `subjectFields`), the edit row (budget, pin/unpin
  baseline, pause/resume through `ops.perf_watch_update`), history chart (p50 and p95, or mean, with
  budget and baseline lines), state history (changes of `state_after`), sample table (bytes and the sample note shown), 25 per page.
- Wave 2 rows: `door:<fn>@large` twins (label suffix "(large table)") and `stmt:<schema>.<fn>`
  statement watches ("mean, all real callers", bound to `mean`).

Registered in `admin-categories.ts` (Reporting) and `admin-navigation.ts` (Platform Reporting).
Surface: `matrx-admin/reporting`, `reporting_section: "performance"`.

## Files

- `service.ts` — reads (browser client on the admin lane, `readAllRows`) and the one write,
  `ops.perf_watch_update` (platform admins only; the body refuses anyone else with 42501). Typed by
  `Database["ops"]`.
- `model.ts` + `model.test.ts` — pure: judged value, budget tone, stale tone, per-watch summary,
  state counts and history, sparkline points, readable subject fields, reason, large-twin test.
- `PerformanceWatchConsole.tsx` — list (`MatrxDataTable`) and drill (inline SVG chart).

## Change log

- 2026-10-08 wave 3: each door watch probes as its own seat (`perf_subject.seat_email`; `@member` twins);
  an empty answer from a read door is probe_broken; re-declared subjects leave a marker sample (judge
  reads only after it). New kinds: `job:<name>` (hourly `ops.perf_job_collect`, pg_cron + platform
  scheduler), `vital:<metric>:<route>` (`lib/perf/PerfVitalsReporter` → `ops.perf_client_report` →
  hourly `ops.perf_vital_rollup`, judged on p75), `page:<name>` + CLI rows (`pnpm perf:data --record`).
  The drill names and opens the pinned table/organization (`metadata.perf_subject_names`) and shows p75 for vitals.
- 2026-10-08 wave 2: edit row (budget / baseline pin / pause) through `ops.perf_watch_update`;
  readable subject; reason in list and drill; bytes + note in the sample table; generated types.
