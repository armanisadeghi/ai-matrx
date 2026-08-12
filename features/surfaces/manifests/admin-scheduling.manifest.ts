/**
 * Surface manifest — Scheduling admin (`matrx-admin/scheduling`).
 *
 * ADMIN SURFACE. NEW surface — no `ui_surface` row exists yet; seed one
 * before syncing. Drives `/administration/automation/scheduling/**`
 * (`app/(admin)/administration/automation/scheduling/`), the cross-user view
 * of the `sch_*` spine (feature code `features/scheduling/`): scheduled
 * tasks, their run history, orphaned leases, a cron expression tester, live
 * scanner health from aidream, and curated starter templates.
 *
 * Seven route-tabbed pages share one shell
 * (`SchedulingAdminLayoutClient.tsx`):
 *
 *   - Overview        `page.tsx` — health-summary tiles (task/run/failure/
 *     orphan counts via `fetchHealthSummary`) plus link tiles to the rest.
 *   - Tasks           `tasks/page.tsx` — every scheduled task across the
 *     platform, with a title search and an enabled/disabled filter
 *     (`fetchAllTasksAdmin`).
 *   - Runs            `runs/page.tsx` — run history with status + surface
 *     filters (`fetchAllRunsAdmin`).
 *   - Orphan leases   `orphan-leases/page.tsx` — claimed/running runs whose
 *     lease expired (`fetchOrphanLeases`), with a "mark failed" admin action.
 *   - Cron tester     `cron-tester/page.tsx` — pure client-side cron
 *     expression + timezone validator/previewer, no DB reads at all.
 *   - Scanner health  `scanner-health/page.tsx` — live status polled from
 *     aidream's matrx-scheduler scanner (`getStatus`), visibility-gated.
 *   - Templates       `templates/page.tsx` — a HARDCODED, in-file `SEEDS`
 *     array (no DB table yet; the page's own "Coming next" alert says a
 *     `sch_template` table + read RPC are pending). Not real page data.
 *
 * `active_tab` is derived from the pathname (route-tabbed, so reliably
 * knowable at any moment). Every other value below is real client-component
 * state (THE COMPLETENESS LAW), but each tab keeps its own state with no
 * cross-tab bridge, and only ONE tab mounts a `SurfaceRuntimeProvider` so far
 * — hence `readiness: "partial"`.
 *
 * The Cron tester mounts it (2026-08-12, the surface's first runtime): that
 * page emits `active_tab` plus its five `cron_*` values and registers the
 * surface's two write targets. The other six tabs mount nothing, so a run
 * started on them still sees an empty scope.
 *
 * What an agent bound here may safely do: on the Cron tester, read the
 * expression/timezone/validation result and propose or apply a better
 * expression (see `writeTargets` below). Anywhere else in this console it
 * must NOT assume anything is in scope — those tabs emit nothing today, and
 * nothing that changes what the platform actually RUNS is writable from here
 * at all.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_SCHEDULING_SURFACE_NAME = "matrx-admin/scheduling";

const groups: SurfaceValueGroup[] = [
  {
    key: "hub",
    label: "Scheduling hub",
    sortOrder: 100,
    description: "Which of the seven tabs the admin is currently on.",
  },
  {
    key: "overview",
    label: "Overview",
    sortOrder: 200,
    description: "Cross-platform health counters for the sch_* spine.",
  },
  {
    key: "tasks",
    label: "Tasks",
    sortOrder: 300,
    description: "The task list, its search text, and its enabled filter.",
  },
  {
    key: "runs",
    label: "Runs",
    sortOrder: 400,
    description: "The run list and its status/surface filters.",
  },
  {
    key: "orphan_leases",
    label: "Orphan leases",
    sortOrder: 500,
    description: "Runs whose claim lease expired without completing.",
  },
  {
    key: "cron_tester",
    label: "Cron tester",
    sortOrder: 600,
    description:
      "The expression/timezone the admin is testing and its validation result.",
  },
  {
    key: "scanner_health",
    label: "Scanner health",
    sortOrder: 700,
    description: "Live status of aidream's matrx-scheduler scanner process.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Scheduling hub ───────────────────────────────────────────────────────
  {
    name: "active_tab",
    label: "Active tab",
    description:
      'Which tab of the Scheduling admin console is showing: "overview", "tasks", "runs", "orphan_leases", "cron_tester", "scanner_health", or "templates". Derived from the pathname under /administration/automation/scheduling. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 15,
    sortOrder: 100,
    group: "hub",
  },

  // ── Overview ─────────────────────────────────────────────────────────────
  {
    name: "task_total_count",
    label: "Total task count",
    description:
      "Total number of scheduled tasks across the platform (health summary). Absent outside the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 200,
    group: "overview",
  },
  {
    name: "task_enabled_count",
    label: "Enabled task count",
    description:
      "Number of scheduled tasks currently enabled (health summary). Absent outside the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 210,
    group: "overview",
  },
  {
    name: "task_due_next_hour_count",
    label: "Tasks due next hour",
    description:
      "Number of tasks whose next fire falls within the next hour (health summary). Absent outside the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 220,
    group: "overview",
  },
  {
    name: "runs_last_24h_count",
    label: "Runs in last 24h",
    description:
      "Total runs recorded in the last 24 hours across every task (health summary). Absent outside the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 230,
    group: "overview",
  },
  {
    name: "failures_last_24h_count",
    label: "Failures in last 24h",
    description:
      "Runs that failed in the last 24 hours (health summary) — the loud number the Overview stat tile warns on when non-zero. Absent outside the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 240,
    group: "overview",
  },
  {
    name: "orphan_lease_summary_count",
    label: "Orphan lease count (summary)",
    description:
      "Current count of orphaned leases from the health summary tile — the same figure the Orphan leases tab lists in full. Absent outside the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 250,
    group: "overview",
  },

  // ── Tasks ────────────────────────────────────────────────────────────────
  {
    name: "task_search",
    label: "Task search",
    description:
      "Title search text in the Tasks tab's search box. Empty string when no search is active. Absent outside the Tasks tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 300,
    group: "tasks",
  },
  {
    name: "task_enabled_filter",
    label: "Task enabled filter",
    description:
      'The Tasks tab\'s state filter: "any", "enabled", or "disabled". Absent outside the Tasks tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 310,
    group: "tasks",
  },
  {
    name: "task_row_count",
    label: "Task row count",
    description:
      "Number of tasks currently loaded into the Tasks tab's table after search/filter (capped at 200 by the query). Absent outside the Tasks tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 320,
    group: "tasks",
  },

  // ── Runs ─────────────────────────────────────────────────────────────────
  {
    name: "run_status_filter",
    label: "Run status filter",
    description:
      'The Runs tab\'s status filter: "any", or one of the RunStatus values (queued/claimed/running/success/failed/cancelled/skipped). Absent outside the Runs tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    sortOrder: 400,
    group: "runs",
  },
  {
    name: "run_surface_filter",
    label: "Run surface filter",
    description:
      'The Runs tab\'s originating-surface filter: "any", or one of the Surface enum values. Absent outside the Runs tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 410,
    group: "runs",
  },
  {
    name: "run_row_count",
    label: "Run row count",
    description:
      "Number of runs currently loaded into the Runs tab's table after filtering (capped at 200 by the query). Absent outside the Runs tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 420,
    group: "runs",
  },

  // ── Orphan leases ────────────────────────────────────────────────────────
  {
    name: "orphan_lease_row_count",
    label: "Orphan lease row count",
    description:
      "Number of runs currently shown in the Orphan leases tab — claimed/running runs whose claim_expires_at is in the past. Absent outside the Orphan leases tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 500,
    group: "orphan_leases",
  },

  // ── Cron tester ──────────────────────────────────────────────────────────
  {
    name: "cron_expression",
    label: "Cron expression",
    description:
      'The 5-field cron expression currently in the Cron tester\'s input (defaults to "0 9 * * 1-5"). Absent outside the Cron tester tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 600,
    group: "cron_tester",
  },
  {
    name: "cron_timezone",
    label: "Cron timezone",
    description:
      "IANA timezone selected in the Cron tester (defaults to the browser's resolved timezone). Absent outside the Cron tester tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 610,
    group: "cron_tester",
  },
  {
    name: "cron_validation_error",
    label: "Cron validation error",
    description:
      "Validation error message for the current expression/timezone pair, if invalid. Absent when the expression is valid, and outside the Cron tester tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 620,
    group: "cron_tester",
  },
  {
    name: "cron_next_fires",
    label: "Cron next fires",
    description:
      "ISO timestamps of the next N fires for the current valid expression (N is admin-configurable, up to 50). Empty array when the expression is invalid. Absent outside the Cron tester tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 630,
    group: "cron_tester",
  },

  // ── Scanner health ───────────────────────────────────────────────────────
  {
    name: "scanner_running",
    label: "Scanner running",
    description:
      "Whether aidream's matrx-scheduler scanner process is currently running, per its last polled status. Absent outside the Scanner health tab, or before the first poll resolves.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 700,
    group: "scanner_health",
  },
  {
    name: "scanner_last_tick_at",
    label: "Scanner last tick at",
    description:
      "ISO timestamp of the scanner's last completed tick. Absent outside the Scanner health tab, or before the first poll resolves.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 710,
    group: "scanner_health",
  },
  {
    name: "scanner_consecutive_errors",
    label: "Scanner consecutive errors",
    description:
      "Count of consecutive scanner tick errors, per the last polled status — the destructive badge fires when this is non-zero. Absent outside the Scanner health tab, or before the first poll resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 720,
    group: "scanner_health",
  },
  {
    name: "scanner_in_flight_count",
    label: "Scanner in-flight count",
    description:
      "Number of runs the scanner currently has claimed and in flight, per the last polled status. Absent outside the Scanner health tab, or before the first poll resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 730,
    group: "scanner_health",
  },
];

/**
 * Write targets — the Cron tester tab ONLY (`cron-tester/page.tsx`), which is
 * also the surface's FIRST and so far ONLY `SurfaceRuntimeProvider` mount.
 *
 * The cron tester is the one place in this console where an agent produces a
 * value a human would otherwise hand-derive: translating "every weekday at
 * 9am Eastern" into `0 9 * * 1-5` + `America/New_York` is real work, and the
 * page then shows the admin exactly what that expression means (cronstrue
 * humanization) and when it would fire (the next N timestamps). Both targets
 * have a 1:1 read twin, so the evidence loop closes on the same page.
 *
 * Both are `mode: "ui"`: this tab is PURELY EPHEMERAL. It schedules nothing,
 * reads no DB, spends nothing, and has no Save bar — the state dies with the
 * page. They are still `applyPolicy: "ask"` rather than `"auto"`, because the
 * expression is the thing the admin is actively reasoning about and silently
 * replacing what they typed would be surprising, not helpful.
 *
 * NOT a competing set with `matrx-user/schedules`. That surface's
 * `schedule_draft_trigger` also carries a cron expression + tz, but it stages
 * the trigger of a REAL scheduled task through `ScheduleForm.tsx`. This admin
 * console does not render `ScheduleForm` anywhere — these targets drive two
 * `useState` values in a throwaway validator. Different page, different state,
 * different blast radius.
 *
 * Deliberately NOT agent-writable anywhere in this console: enabling or
 * disabling a scheduled task, re-cronning one, and the orphan-lease "mark
 * failed" action all change what the platform actually runs for real users, so
 * they stay human. The Runs / Overview / Scanner health / Orphan leases tabs
 * are reports and register nothing. Templates is a hardcoded in-file SEEDS
 * array, not real page data. The tester's own "Show next N" preview count is a
 * mechanical view knob nobody would ask an agent to flip — it is not a target.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "cron_expression",
    label: "Cron expression",
    description:
      'Replaces the expression in the Cron tester\'s input, so the page re-validates it and previews its next fires. Send a PLAIN TEXT STRING — not JSON, and not JSON-encoded — holding a standard 5-field cron expression in the order "minute hour day-of-month month day-of-week" (e.g. "0 9 * * 1-5" = weekdays at 9:00 in the selected timezone; "30 8 * * 1" = Mondays at 8:30; "0 */4 * * *" = every 4 hours). There is NO seconds field and @daily-style macros are not accepted. The value is checked with the SAME parser the page previews with and REFUSED with the parser\'s own message if it will not parse, so nothing invalid can be staged. Ephemeral: this tester schedules nothing and persists nothing.',
    valueType: "string",
    updatesValue: "cron_expression",
    mode: "ui",
    applyPolicy: "ask",
    group: "cron_tester",
    sortOrder: 100,
  },
  {
    name: "cron_timezone",
    label: "Cron timezone",
    description:
      'Replaces the timezone the Cron tester evaluates the expression in, which changes the previewed fire times. Send a PLAIN TEXT STRING — not JSON, and not JSON-encoded — holding one IANA timezone name. Only the zones this page\'s picker can display are accepted: "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney". US zone names like "Eastern"/"EST" or any other IANA zone are REFUSED, because the picker could not show them. Ephemeral: this tester schedules nothing and persists nothing.',
    valueType: "string",
    updatesValue: "cron_timezone",
    mode: "ui",
    applyPolicy: "ask",
    group: "cron_tester",
    sortOrder: 110,
  },
];

export const adminSchedulingManifest: SurfaceManifest = {
  surfaceName: ADMIN_SCHEDULING_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "The Cron tester tab (cron-tester/page.tsx) mounts the surface's FIRST SurfaceRuntimeProvider and emits active_tab + the five cron_* values live; it is also the only tab with write targets. The other six tabs still mount NO provider, so their values (Overview's fetchHealthSummary counters, Tasks/Runs' filters and row counts, Orphan leases' row count, Scanner health's polled status) reflect real component state but are not emitted at runtime yet — an agent run started on those tabs gets an empty scope. Templates (templates/page.tsx) is a hardcoded in-file SEEDS array with no backing table yet — the page's own \"Coming next\" alert says a sch_template table + read RPC are pending — so it is deliberately NOT declared as page data here; declaring it would promise a value no real data source supplies.",
  label: "Scheduling",
  urlPattern: "/administration/automation/scheduling",
  intro: `<surface_intro>
This is an ADMIN surface: the Scheduling admin console at /administration/automation/scheduling — a cross-user, platform-wide view of the sch_* spine (scheduled tasks, their runs, and the scanner that dispatches them).

active_tab tells you which of the tabs the admin is on and is always present. Overview carries platform-wide health counters (task_total_count, task_enabled_count, runs_last_24h_count, failures_last_24h_count, orphan_lease_summary_count). Tasks and Runs carry their own search/filter state plus how many rows are currently loaded. Orphan leases counts runs whose claim lease expired without completing — these should self-heal on the next scanner tick; a persistent nonzero count means something is wrong upstream. Cron tester is a pure client-side validator: cron_expression / cron_timezone / cron_next_fires describe what the admin is testing, not a live schedule. Scanner health mirrors aidream's live scanner process state (scanner_running, scanner_consecutive_errors, scanner_in_flight_count).

Templates has no backing data source yet (hardcoded starter examples pending a real table) and is deliberately undeclared.

ONLY the Cron tester tab is wired today: it emits active_tab plus cron_expression / cron_timezone / cron_validation_error / cron_next_fires, and it is the only tab that accepts writes — you may replace the expression and the timezone there, both confirmed with the admin first. That tab is a scratchpad: it validates and previews, it does not schedule anything. On every other tab nothing is emitted yet, so do not assume any value is in scope. Nothing in this console can enable, disable, re-cron or fail a real scheduled task — those stay human.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminSchedulingScope(values: {
  // alwaysAvailable: true → required
  active_tab:
    | "overview"
    | "tasks"
    | "runs"
    | "orphan_leases"
    | "cron_tester"
    | "scanner_health"
    | "templates";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  task_total_count?: number;
  task_enabled_count?: number;
  task_due_next_hour_count?: number;
  runs_last_24h_count?: number;
  failures_last_24h_count?: number;
  orphan_lease_summary_count?: number;
  task_search?: string;
  task_enabled_filter?: "any" | "enabled" | "disabled";
  task_row_count?: number;
  run_status_filter?: string;
  run_surface_filter?: string;
  run_row_count?: number;
  orphan_lease_row_count?: number;
  cron_expression?: string;
  cron_timezone?: string;
  cron_validation_error?: string;
  cron_next_fires?: string[];
  scanner_running?: boolean;
  scanner_last_tick_at?: string;
  scanner_consecutive_errors?: number;
  scanner_in_flight_count?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
