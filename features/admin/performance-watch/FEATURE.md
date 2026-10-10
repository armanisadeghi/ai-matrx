# FEATURE.md — `admin/performance-watch`

**Status:** `active` (wave 2)
**Tier:** `2`
**Last updated:** `2026-10-10`

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
- `SlowPagesBoard.tsx` — the Slowest pages table.

## Change log

- 2026-10-10 PERF-WATCH-2 pages: header tabs Watches / Slowest pages (`?view=pages`); the second is one `MatrxDataTable` fed by
  `ops.perf_slow_pages(7)` (`SlowPagesBoard.tsx`): per route real-user p75 LCP / INP / TTFB with n against `perf.vital_min_n`,
  the sibling `pageprobe:<route>` watch's synthetic TTFB p95, HTML and first-load JS, a daily LCP trend, and flags
  (`big_bundle`, `slow_server`, `slow_db_door`, `slow_client`, computed in SQL) that open the watch behind them (`?watch=<id>`).
  Pure helpers in `model.ts` (`vitalTone`, `pageSampleNote`, `pageTrendValues`, `orderedFlags`, `bundleTone`, `flaggedPageCount`).
  Quiet routes now report every load (`lib/perf/vitals.ts` `routeRateFor`, knob `perf.client_sample_rate_by_route`).
- 2026-10-09 PERF-WATCH-TAIL: the header's Collectors popover shows every perf cron job (the door probe is two jobs, admin and member
  seat, each with doors, last run and seconds taken of its cap) and the page-speed routes under the roll-up minimum with n
  ("not enough samples yet"); the board returns only judged numbers per sparkline point (30 asked, 120 cap) and no edit log;
  `lib/perf/PerfVitalsReporter` does one random draw for an unsampled load and nothing else.

- 2026-10-08 wave 3: each door watch probes as its own seat (`perf_subject.seat_email`; `@member` twins);
  an empty answer from a read door is probe_broken; re-declared subjects leave a marker sample (judge
  reads only after it). New kinds: `job:<name>` (hourly `ops.perf_job_collect`, pg_cron + platform
  scheduler), `vital:<metric>:<route>` (`lib/perf/PerfVitalsReporter` → `ops.perf_client_report` →
  hourly `ops.perf_vital_rollup`, judged on p75), `page:<name>` + CLI rows (`pnpm perf:data --record`).
  The drill names and opens the pinned table/organization (`metadata.perf_subject_names`) and shows p75 for vitals.
- 2026-10-08 wave 2: edit row (budget / baseline pin / pause) through `ops.perf_watch_update`;
  readable subject; reason in list and drill; bytes + note in the sample table; generated types.
- 2026-10-08 one-call page: the list reads `ops.perf_watch_board(p_days, p_points)` (every watch + per watch its
  newest sample, markers and ≤60 evenly spaced 7-day samples) and the drill reads `ops.perf_watch_history(p_check_id,
  p_limit)` — one request each instead of paging every raw sample (was hundreds of requests). Platform admins only.
