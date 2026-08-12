/**
 * Surface manifest — Scheduling admin (`matrx-admin/scheduling`).
 *
 * ADMIN SURFACE. Drives `/administration/automation/scheduling/**`
 * (`app/(admin)/administration/automation/scheduling/`), the console over the
 * `sch_*` spine (feature code `features/scheduling/`): scheduled tasks, their
 * run history, orphaned leases, a cron expression tester, live scanner health
 * from aidream, and curated starter templates. The `ui_surface` row exists
 * (verified 2026-08-12); only the VALUE rows still need a manifest sync.
 *
 * Seven route-tabbed pages share one shell
 * (`SchedulingAdminLayoutClient.tsx`):
 *
 *   - Overview        `page.tsx` — health-summary tiles (task/run/failure/
 *     orphan counts via `fetchHealthSummary`) plus link tiles to the rest.
 *   - Tasks           `tasks/page.tsx` — scheduled tasks in a
 *     `MatrxDataTable` (`fetchAllTasksAdmin`, server-capped at 200).
 *   - Runs            `runs/page.tsx` — run history with SERVER-side status +
 *     surface filters (`fetchAllRunsAdmin`, server-capped at 200).
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
 * state (THE COMPLETENESS LAW), and each tab owns its own state.
 *
 * TWO runtime mounts, and the nesting is deliberate:
 *
 *   - The SHELL (`SchedulingAdminLayoutClient`) mounts the outer provider. It
 *     always knows `active_tab` from the pathname, and each of the other six
 *     tabs publishes its own slice up to it through
 *     `features/scheduling/lib/admin-scheduling-scope.ts` — only the MOUNTED
 *     tab's slice is ever emitted, so no tab can report another's state.
 *   - The Cron tester (2026-08-12, the surface's first runtime) mounts its own
 *     provider INSIDE that one, via
 *     `features/scheduling/lib/cron-tester-surface.ts`. Nested providers
 *     resolve deepest-first, so on that tab its richer scope wins outright and
 *     it is also where the surface's two write targets are registered.
 *
 * What an agent bound here may safely do: read this console's operational
 * state on any tab, and on the Cron tester read the expression/timezone/
 * validation result and propose or apply a better expression (see
 * `writeTargets` below). Nothing that changes what the platform actually RUNS
 * is writable from here at all.
 *
 * NOT A FLEET VIEW (`FOUND_DEFECTS` D140). `scheduler.sch_task` / `sch_run`
 * carry only the canonical std_select policies — there is no live admin RLS
 * clause — so every count and row below is the VIEWER'S OWN scheduled work,
 * not the platform's. The tabs are cross-user by intent and single-user in
 * fact; an agent reasoning about "platform health" from these numbers would be
 * wrong, so the vocabulary says "visible to the viewer" throughout.
 *
 * Two values this manifest USED to declare — `task_search` and
 * `task_enabled_filter` — were removed on 2026-08-12: the Tasks tab has no
 * such page state. Its search box and enabled/disabled filter live INSIDE
 * `MatrxDataTable`'s own internals, which the page never reads, so both were
 * promises no data source could keep (the `matrx-user/canvas` failure mode).
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
    description: "Health counters for the sch_* spine visible to the viewer.",
  },
  {
    key: "tasks",
    label: "Tasks",
    sortOrder: 300,
    description: "The scheduled-task list loaded into the Tasks tab.",
  },
  {
    key: "runs",
    label: "Runs",
    sortOrder: 400,
    description: "The run list and its server-side status/surface filters.",
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
      "Total number of scheduled tasks VISIBLE TO THE VIEWER (health summary; not a platform-wide figure — see D140). Absent outside the Overview tab and until the summary resolves.",
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
      "Number of the viewer's scheduled tasks currently enabled (health summary). Absent outside the Overview tab and until the summary resolves.",
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
      "Number of the viewer's tasks whose next fire falls within the next hour (health summary). Absent outside the Overview tab and until the summary resolves.",
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
      "Runs recorded in the last 24 hours across the viewer's tasks (health summary). Absent outside the Overview tab and until the summary resolves.",
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

  {
    name: "overview_load_error",
    label: "Overview load error",
    description:
      "Error message shown in the Overview tab's destructive alert when the health summary query failed. Absent when the summary loaded fine, and outside the Overview tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 260,
    group: "overview",
  },

  // ── Tasks ────────────────────────────────────────────────────────────────
  {
    name: "task_row_count",
    label: "Task row count",
    description:
      "Number of scheduled tasks the Tasks tab fetched from the server (capped at 200 by the query). This is the RAW fetched count — the table's own search box and column filters narrow what is on screen without changing it, and the page cannot read those. Absent outside the Tasks tab.",
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
      'The Runs tab\'s SERVER-side status filter: "any", or one of the RunStatus values (queued/claimed/running/success/failed/cancelled/skipped). Reported as "any" when the picker is on "Any status". Absent outside the Runs tab.',
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
      'The Runs tab\'s SERVER-side originating-surface filter: "any", or one of the Surface enum values. Reported as "any" when the picker is on "Any surface". Absent outside the Runs tab.',
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
      "Number of runs the Runs tab fetched for the current status/surface filters (capped at 200 by the query). The table's own search box narrows what is on screen without changing this. Absent outside the Runs tab.",
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

  {
    name: "cron_expression_human",
    label: "Cron expression in words",
    description:
      'The plain-English reading of the current expression that the tester renders under the input (cronstrue, e.g. "At 09:00 AM, Monday through Friday"). Absent when the expression is invalid or cannot be humanized, and outside the Cron tester tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 625,
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
  {
    name: "scanner_started_at",
    label: "Scanner started at",
    description:
      "ISO timestamp the scanner process started, as shown beside the running/stopped badge. Absent outside the Scanner health tab, before the first poll resolves, or when the scanner is not running.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 715,
    group: "scanner_health",
  },
  {
    name: "scanner_last_tick_duration_ms",
    label: "Scanner last tick duration",
    description:
      "How long the scanner's last tick took, in milliseconds. Absent outside the Scanner health tab, before the first poll resolves, or when the scanner reports no duration yet.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 740,
    group: "scanner_health",
  },
  {
    name: "scanner_last_tick_claimed",
    label: "Scanner claimed (last tick)",
    description:
      "How many due runs the scanner claimed on its last tick. Absent outside the Scanner health tab, or before the first poll resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 750,
    group: "scanner_health",
  },
  {
    name: "scanner_last_tick_manual_claimed",
    label: "Scanner manual claimed (last tick)",
    description:
      "How many manually-triggered runs the scanner claimed on its last tick. Absent outside the Scanner health tab, or before the first poll resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 760,
    group: "scanner_health",
  },
  {
    name: "scanner_last_tick_expired_sweeps",
    label: "Scanner expired sweeps (last tick)",
    description:
      "How many expired claims the scanner swept on its last tick — the stat tile warns when this is non-zero. Absent outside the Scanner health tab, or before the first poll resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 770,
    group: "scanner_health",
  },
  {
    name: "scanner_total_runs_dispatched",
    label: "Scanner total dispatched",
    description:
      "Lifetime count of runs the scanner has dispatched since the process started. Absent outside the Scanner health tab, or before the first poll resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 780,
    group: "scanner_health",
  },
  {
    name: "scanner_error_message",
    label: "Scanner recent error",
    description:
      'The scanner\'s own most recent error message, rendered in the "Recent error" alert. Absent when the scanner reports no error, outside the Scanner health tab, or before the first poll resolves.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 790,
    group: "scanner_health",
  },
  {
    name: "scanner_unreachable_error",
    label: "Scanner unreachable error",
    description:
      'Why the status poll itself failed — the message in the "Scanner unreachable" alert (backend down, or AIDREAM_SCHEDULER not enabled). Distinct from scanner_error_message, which is an error the scanner itself reported. Absent when the poll succeeded, and outside the Scanner health tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 800,
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
    "All seven tabs emit live. The shell (SchedulingAdminLayoutClient) mounts the outer SurfaceRuntimeProvider and derives active_tab from the pathname; Overview, Tasks, Runs, Orphan leases and Scanner health publish their own slices through features/scheduling/lib/admin-scheduling-scope.ts, and only the MOUNTED tab's slice is emitted. The Cron tester nests its own provider (features/scheduling/lib/cron-tester-surface.ts), wins that tab by depth, and carries the surface's two write targets. Every value was checked against the live page and both write targets were verified with real agent runs (apply, decline, undeclared-target refusal, and invalid-value throws). Still short of `verified`: the DB value sync has NOT been applied, so ui_surface_value still carries the removed task_search/task_enabled_filter rows and none of the newly declared scanner_*/cron_expression_human/cron_preview_count/overview_load_error rows; and no page element carries a data-surface-value anchor for Locate. Templates (templates/page.tsx) is a hardcoded in-file SEEDS array with no backing table yet — the page's own \"Coming next\" alert says a sch_template table + read RPC are pending — so it is deliberately NOT declared as page data here; declaring it would promise a value no real data source supplies.",
  label: "Scheduling",
  urlPattern: "/administration/automation/scheduling",
  intro: `<surface_intro>
This is an ADMIN surface: the Scheduling console at /administration/automation/scheduling, a view over the sch_* spine (scheduled tasks, their runs, and the scanner that dispatches them).

active_tab tells you which of the seven tabs the admin is on and is always present. Only the MOUNTED tab's values are emitted — every other tab's values are absent, not stale, because each tab owns its own state.

READ THE COUNTS CORRECTLY: despite the console's cross-user framing, scheduler.sch_task / sch_run have no live admin RLS clause (FOUND_DEFECTS D140), so every count and row here is the VIEWER'S OWN scheduled work, not the platform's. Do not report these as fleet-wide numbers.

Overview carries the health counters. Tasks and Runs report how many rows the SERVER returned (each capped at 200); their tables also have their own search boxes and column filters, which narrow the screen without changing these counts and which the page cannot read — so never infer \"what the admin is looking at\" from them. Runs additionally exposes its two server-side filters. Orphan leases counts runs whose claim lease expired without completing — these should self-heal on the next scanner tick; a persistent nonzero count means something is wrong upstream. Scanner health mirrors aidream's live scanner process state.

Templates has no backing data source yet (hardcoded starter examples pending a real table) and is deliberately undeclared.

Cron tester is a pure client-side scratch pad and the one place here you can WRITE. It validates an expression + timezone and previews the next fires; it reads no database and fires nothing. You may set cron_expression and cron_timezone (the admin confirms each change), then read cron_validation_error, cron_expression_human and cron_next_fires to check your own work. Everything else on this surface is read-only operational evidence: reason about it, report on it, and leave the changing to a person. Nothing in this console can enable, disable, re-cron or fail a real scheduled task — those stay human.
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
/** The seven route-tabbed pages, as `active_tab` reports them. */
export type AdminSchedulingTab =
  | "overview"
  | "tasks"
  | "runs"
  | "orphan_leases"
  | "cron_tester"
  | "scanner_health"
  | "templates";

/**
 * The values this surface can emit. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable:
 * false`. Exported so each tab can publish a typed slice of it — see
 * `features/scheduling/lib/admin-scheduling-scope.ts`.
 *
 * A `type` rather than an `interface` on purpose: only type aliases get an
 * implicit index signature, which is what lets the payload satisfy
 * `ApplicationScope` without casting through `unknown` and losing the check.
 */
export type AdminSchedulingScopeValues = {
  // alwaysAvailable: true → required
  active_tab: AdminSchedulingTab;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  task_total_count?: number;
  task_enabled_count?: number;
  task_due_next_hour_count?: number;
  runs_last_24h_count?: number;
  failures_last_24h_count?: number;
  orphan_lease_summary_count?: number;
  overview_load_error?: string;
  task_row_count?: number;
  run_status_filter?: string;
  run_surface_filter?: string;
  run_row_count?: number;
  orphan_lease_row_count?: number;
  cron_expression?: string;
  cron_timezone?: string;
  cron_validation_error?: string;
  cron_expression_human?: string;
  cron_next_fires?: string[];
  scanner_running?: boolean;
  scanner_last_tick_at?: string;
  scanner_started_at?: string;
  scanner_consecutive_errors?: number;
  scanner_in_flight_count?: number;
  scanner_last_tick_duration_ms?: number;
  scanner_last_tick_claimed?: number;
  scanner_last_tick_manual_claimed?: number;
  scanner_last_tick_expired_sweeps?: number;
  scanner_total_runs_dispatched?: number;
  scanner_error_message?: string;
  scanner_unreachable_error?: string;
};

/** Type-safe payload helper — the "a UI cannot lie" enforcement. */
export function createAdminSchedulingScope(
  values: AdminSchedulingScopeValues,
): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
