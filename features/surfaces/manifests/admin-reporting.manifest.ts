/**
 * Surface manifest — Reporting Admin (`matrx-admin/reporting`).
 *
 * ADMIN SURFACE. Drives `/administration/reporting/**` — six unrelated
 * reporting tools that happen to live under one hub:
 *
 *   /administration/reporting                 hub (AdminDomainDirectory — static link directory, no data)
 *   /administration/reporting/events           live platform.activity_log viewer (MatrxDataTable)
 *   /administration/reporting/reports          admin-mode ReportsLanding (metadata-only report catalog)
 *   /administration/reporting/dead-ends        No Dead Ends scoreboard — committed report.json snapshot
 *   /administration/reporting/unwired          Unwired Work scoreboard — committed report.json snapshot
 *   /administration/reporting/lint-debt        ESLint debt scoreboard — committed report.json snapshot
 *
 * The three scoreboards (dead-ends, unwired, lint-debt) are the SAME pattern
 * (`features/admin/{dead-ends,unwired,lint-debt}/`): a committed snapshot
 * (never a live scan — the scans themselves take minutes), a one-field
 * bucket-style drill filter, and a `problems: string[]` staleness-warning
 * list computed by `reconcileReport()`. Their manifest vocabulary is
 * deliberately parallel (`*_totals` / `*_bucket_filter` / `*_worst_*` /
 * `*_problems`) so an agent bound to one generalizes to the others.
 *
 * What an agent bound here may safely do: read whichever child's state is
 * populated (per `reporting_section`) and summarize, diagnose, triage, or
 * draft a repair brief for a finding. Nothing on this surface has a write
 * target yet — the scoreboards are read-only consoles (their action is
 * "open the source line", not an in-page mutation) and the Events page has
 * no write affordance at all.
 *
 * NO EMITTER WIRED (readiness: stub). This manifest exists so the
 * vocabulary is bindable ahead of instrumentation — the surface-canonical-
 * fleet campaign's wave 3. Wiring emitters is real follow-up work: Events
 * has live filter/auto-refresh state, and each scoreboard's bucket-drill
 * `useState` lives inside its `*Console` component with no prop seam to
 * publish from today.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_REPORTING_SURFACE_NAME = "matrx-admin/reporting";

const groups: SurfaceValueGroup[] = [
  {
    key: "navigation",
    label: "Reporting navigation",
    sortOrder: 100,
    description: "Which child tool of the Reporting admin family is active.",
  },
  {
    key: "events",
    label: "Events",
    sortOrder: 200,
    description:
      "The live platform.activity_log viewer: action-prefix filter, auto-refresh toggle, and the fetched rows.",
  },
  {
    key: "reports_catalog",
    label: "Reports catalog",
    sortOrder: 300,
    description:
      "The admin-mode report registry list (metadata only — each entry links to its own report page).",
  },
  {
    key: "dead_ends",
    label: "No Dead Ends scoreboard",
    sortOrder: 400,
    description:
      "Door Law violations: committed scan totals, the active drill-down filter, worst offenders, and staleness warnings.",
  },
  {
    key: "unwired",
    label: "Unwired Work scoreboard",
    sortOrder: 500,
    description:
      "Purpose-built code with no runtime wiring: committed scan totals, the active drill-down filter, worst files, and staleness warnings.",
  },
  {
    key: "lint_debt",
    label: "ESLint debt scoreboard",
    sortOrder: 600,
    description:
      "Repo-wide ESLint error backlog classified bug/correctness/doctrine/style: committed scan totals, the active drill-down filter, worst offenders, and staleness warnings.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Navigation ───────────────────────────────────────────────────────
  {
    name: "reporting_section",
    label: "Reporting section",
    description:
      'Which child of the Reporting admin family is active: "hub", "events", "reports", "dead_ends", "unwired", or "lint_debt". Always present — each emitter declares which one it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 100,
    group: "navigation",
  },

  // ── Events ───────────────────────────────────────────────────────────
  {
    name: "events_action_prefix",
    label: "Events action-prefix filter",
    description:
      'The toolbar facet narrowing admin_recent_activity server-side: "all", "run.", "webhook.", or "file.". Present only on reporting_section=events.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 200,
    group: "events",
  },
  {
    name: "events_auto_refresh",
    label: "Events auto-refresh",
    description:
      "Whether the 5-second auto-refresh poll is on. Present only on reporting_section=events.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 205,
    group: "events",
  },
  {
    name: "events_rows",
    label: "Events rows",
    description:
      "The fetched platform.activity_log rows matching events_action_prefix (id, occurred_at, action, entity_type, entity_id, actor_id, organization_id, metadata), up to 200. Present only on reporting_section=events; empty array when none match.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 210,
    group: "events",
  },

  // ── Reports catalog ──────────────────────────────────────────────────
  {
    name: "reports_catalog",
    label: "Reports catalog",
    description:
      "The admin-mode report registry entries actually shown (only entries with an adminHref): { id, label, href }. Present only on reporting_section=reports.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 300,
    group: "reports_catalog",
  },

  // ── No Dead Ends ─────────────────────────────────────────────────────
  {
    name: "dead_ends_totals",
    label: "Dead ends scan totals",
    description:
      "The committed scan's header numbers: { generatedAt, commit, findings, high, medium, low, filesWithFindings, filesScanned, allowlisted }. Present only on reporting_section=dead_ends.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 220,
    sortOrder: 400,
    group: "dead_ends",
  },
  {
    name: "dead_ends_bucket_filter",
    label: "Dead ends active filter",
    description:
      'The console\'s current drill-down: { kind: "none"|"file"|"feature"|"rule"|"severity", value? }. "none" means the unfiltered findings table is shown. Present only on reporting_section=dead_ends.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 405,
    group: "dead_ends",
  },
  {
    name: "dead_ends_worst_features",
    label: "Dead ends worst features",
    description:
      "Top offending features/route-groups ranked by finding count: { key, count, high }. Present only on reporting_section=dead_ends.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 410,
    group: "dead_ends",
  },
  {
    name: "dead_ends_worst_files",
    label: "Dead ends worst files",
    description:
      "Top offending files ranked by finding count: { key, count, high }. Present only on reporting_section=dead_ends.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 415,
    group: "dead_ends",
  },
  {
    name: "dead_ends_problems",
    label: "Dead ends staleness warnings",
    description:
      "Warnings from reconcileReport() about the committed snapshot (e.g. stale vs HEAD, allowlist rot). Empty array when the snapshot is healthy. Present only on reporting_section=dead_ends.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    autoContext: false,
    sortOrder: 420,
    group: "dead_ends",
  },

  // ── Unwired Work ─────────────────────────────────────────────────────
  {
    name: "unwired_totals",
    label: "Unwired scan totals",
    description:
      "The committed scan's header numbers: { generatedAt, commit, aidreamCommit, findings, lines, filesWithFindings, filesScanned, suppressed, byDetector, byRepository }. Present only on reporting_section=unwired.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 500,
    group: "unwired",
  },
  {
    name: "unwired_bucket_filter",
    label: "Unwired active filter",
    description:
      "The console's current drill-down filter (same shape family as dead_ends_bucket_filter — file/detector/repository or none). Present only on reporting_section=unwired.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 505,
    group: "unwired",
  },
  {
    name: "unwired_worst_files",
    label: "Unwired worst files",
    description:
      "Top offending files ranked by implementation-line count: { key, findings, lines }. Present only on reporting_section=unwired.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 510,
    group: "unwired",
  },
  {
    name: "unwired_problems",
    label: "Unwired scan partial-coverage warnings",
    description:
      "The scan's own `partial` list — detectors that could not run to completion this pass (e.g. an aidream checkout was unavailable). Empty array when the scan was complete. Present only on reporting_section=unwired.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    autoContext: false,
    sortOrder: 520,
    group: "unwired",
  },

  // ── ESLint debt ──────────────────────────────────────────────────────
  {
    name: "lint_debt_totals",
    label: "Lint debt scan totals",
    description:
      "The committed scan's header numbers: { generatedAt, commit, errors, filesWithFindings, filesScanned, byClass }, where byClass breaks down bug/correctness/doctrine/style counts. Present only on reporting_section=lint_debt.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 220,
    sortOrder: 600,
    group: "lint_debt",
  },
  {
    name: "lint_debt_bucket_filter",
    label: "Lint debt active filter",
    description:
      "The console's current drill-down filter (same shape family as dead_ends_bucket_filter — file/feature/rule/class or none). Present only on reporting_section=lint_debt.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 605,
    group: "lint_debt",
  },
  {
    name: "lint_debt_worst_files",
    label: "Lint debt worst files",
    description:
      "Top offending files ranked by error count: { key, count, real } — `real` is how many are bug/correctness class. Present only on reporting_section=lint_debt.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 610,
    group: "lint_debt",
  },
  {
    name: "lint_debt_worst_features",
    label: "Lint debt worst features",
    description:
      "Top offending features/route-groups ranked by error count: { key, count, real }. Present only on reporting_section=lint_debt.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 615,
    group: "lint_debt",
  },
  {
    name: "lint_debt_by_rule",
    label: "Lint debt by rule",
    description:
      "Every offending ESLint rule ranked by count: { rule, count, klass }. Present only on reporting_section=lint_debt.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 620,
    group: "lint_debt",
  },
  {
    name: "lint_debt_problems",
    label: "Lint debt staleness warnings",
    description:
      "Warnings from reconcileReport() about the committed snapshot (e.g. stale vs HEAD). Empty array when the snapshot is healthy. Present only on reporting_section=lint_debt.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    autoContext: false,
    sortOrder: 625,
    group: "lint_debt",
  },
];

export const adminReportingManifest: SurfaceManifest = {
  surfaceName: ADMIN_REPORTING_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — vocabulary audited against the live pages, no runtime emitter wired yet. /administration/reporting itself is a static link directory (AdminDomainDirectory, no data, no values). Events has live filter/auto-refresh/row state with no provider mounted. The three scoreboards (dead-ends/unwired/lint-debt) each hold their bucket-drill useState inside a shared *Console component with no prop seam to publish from today — wiring all four emitters is real follow-up work.",
  label: "Reporting Admin",
  urlPattern: "/administration/reporting",
  intro: `<surface_intro>
This is an ADMIN surface: the Reporting admin family at /administration/reporting, covering six unrelated super-admin reporting tools that happen to live under one hub.

reporting_section tells you which one is active: "hub" (static link directory, no data), "events" (a live platform.activity_log viewer with an action-prefix filter and optional auto-refresh), "reports" (the admin-mode catalog of platform-wide reports), or one of the three committed-snapshot scoreboards — "dead_ends" (No Dead Ends / Door Law violations), "unwired" (purpose-built code with no runtime wiring), "lint_debt" (repo-wide ESLint error backlog, classified bug/correctness/doctrine/style).

The three scoreboards share one vocabulary shape: a *_totals object (the scan's header numbers), a *_bucket_filter object (the admin's current drill-down — which file/feature/rule/detector/class they're looking at, or none), a worst-offenders list, and a *_problems array of staleness warnings about the committed snapshot itself (these are NEVER live scans — a full run takes minutes, so each console reads a committed report.json that can go stale).

Only the values matching the current reporting_section are populated — everything else is absent, not stale. This surface has no write targets — every scoreboard's action is "open the source line" (a real navigation, not an in-page mutation), and Events has no write affordance at all.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminReportingScope(values: {
  // alwaysAvailable: true → required
  reporting_section: "hub" | "events" | "reports" | "dead_ends" | "unwired" | "lint_debt";
  // alwaysAvailable: false → optional
  context?: Record<string, unknown>;
  events_action_prefix?: string;
  events_auto_refresh?: boolean;
  events_rows?: unknown[];
  reports_catalog?: unknown[];
  dead_ends_totals?: Record<string, unknown>;
  dead_ends_bucket_filter?: Record<string, unknown>;
  dead_ends_worst_features?: unknown[];
  dead_ends_worst_files?: unknown[];
  dead_ends_problems?: string[];
  unwired_totals?: Record<string, unknown>;
  unwired_bucket_filter?: Record<string, unknown>;
  unwired_worst_files?: unknown[];
  unwired_problems?: string[];
  lint_debt_totals?: Record<string, unknown>;
  lint_debt_bucket_filter?: Record<string, unknown>;
  lint_debt_worst_files?: unknown[];
  lint_debt_worst_features?: unknown[];
  lint_debt_by_rule?: unknown[];
  lint_debt_problems?: string[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
