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
 * cross-tab bridge, and no page here mounts a `SurfaceRuntimeProvider` —
 * `readiness: "stub"`, no emitter wired.
 *
 * What an agent bound here may safely do, once wired: read which tab the
 * admin is on and reason about scheduling health, a specific task/run, or a
 * cron expression. It must NOT assume anything is currently live in scope —
 * nothing here is emitted today.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
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

export const adminSchedulingManifest: SurfaceManifest = {
  surfaceName: ADMIN_SCHEDULING_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — no page in this subtree mounts a SurfaceRuntimeProvider yet. Values reflect real page/component state (Overview's fetchHealthSummary, Tasks/Runs' filters and row counts, Orphan leases' row count, Cron tester's live validation, Scanner health's polled status) but nothing is emitted at runtime today. Templates (templates/page.tsx) is a hardcoded in-file SEEDS array with no backing table yet — the page's own \"Coming next\" alert says a sch_template table + read RPC are pending — so it is deliberately NOT declared as page data here; declaring it would promise a value no real data source supplies.",
  label: "Scheduling",
  urlPattern: "/administration/automation/scheduling",
  intro: `<surface_intro>
This is an ADMIN surface: the Scheduling admin console at /administration/automation/scheduling — a cross-user, platform-wide view of the sch_* spine (scheduled tasks, their runs, and the scanner that dispatches them).

active_tab tells you which of the tabs the admin is on and is always present. Overview carries platform-wide health counters (task_total_count, task_enabled_count, runs_last_24h_count, failures_last_24h_count, orphan_lease_summary_count). Tasks and Runs carry their own search/filter state plus how many rows are currently loaded. Orphan leases counts runs whose claim lease expired without completing — these should self-heal on the next scanner tick; a persistent nonzero count means something is wrong upstream. Cron tester is a pure client-side validator: cron_expression / cron_timezone / cron_next_fires describe what the admin is testing, not a live schedule. Scanner health mirrors aidream's live scanner process state (scanner_running, scanner_consecutive_errors, scanner_in_flight_count).

Templates has no backing data source yet (hardcoded starter examples pending a real table) and is deliberately undeclared.

Nothing below active_tab is currently emitted — treat this surface as tab-identity-only until an emitter is wired.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
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
