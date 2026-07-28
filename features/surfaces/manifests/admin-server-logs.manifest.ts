/**
 * Surface manifest — Server Logs (`matrx-admin/server-logs`).
 *
 * ADMIN SURFACE. Drives `/administration/compute/server-logs/**` — the
 * super-admin Coolify log viewer. `/administration/compute/server-logs`
 * itself immediately redirects to `/administration/compute/server-logs/
 * ai-dream-server`; the real page is the `[app]` route rendering
 * `CoolifyLogViewer` (`components/admin/server-logs/CoolifyLogViewer.tsx`),
 * which fetches raw log text from `/api/admin/coolify-logs`, parses it
 * client-side per the log format in `features/server-logs/log-rules.ts`
 * (timestamp / level / category / urgency / module), and lets the admin
 * filter, search, select a line/range, and inspect a structured JSON payload
 * attached to a line.
 *
 * What an agent bound here may safely do: read the currently visible/parsed
 * log lines and the active filters, then explain an error, summarize a
 * pattern, or suggest a filter/search refinement. It must NOT assume any
 * action it proposes has been taken — nothing on this surface writes
 * anything; it only reads and displays Coolify's log stream.
 *
 * NO EMITTER WIRED YET. `CoolifyLogViewer.tsx` holds ~15 pieces of local
 * `useState` (selected app, line count, poll interval, parsed filters,
 * selection, raw log text) inside one 1,400+ line client component with no
 * existing `SurfaceRuntimeProvider`. Wiring one is real work (assembling a
 * scope object from that much local state) rather than a drop-in addition,
 * so this manifest is `stub`: the vocabulary below is audited against the
 * live component's state but nothing populates it yet.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_SERVER_LOGS_SURFACE_NAME = "matrx-admin/server-logs";

const groups: SurfaceValueGroup[] = [
  {
    key: "app_selection",
    label: "App selection",
    sortOrder: 100,
    description:
      "Which backend service/environment the viewer is showing, and the catalogue of services it can switch between.",
  },
  {
    key: "fetch_state",
    label: "Fetch state",
    sortOrder: 200,
    description:
      "How many lines were requested, the auto-poll interval, when the log text was last fetched, and any fetch error.",
  },
  {
    key: "filters",
    label: "Filters & search",
    sortOrder: 300,
    description:
      "The active level/category/urgency/module/search filters and noise-exclusion presets applied to the parsed log lines.",
  },
  {
    key: "log_view",
    label: "Log content",
    sortOrder: 400,
    description:
      "The parsed log lines currently visible after filtering, and the line (or range) the admin has selected for inspection.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── App selection ──────────────────────────────────────────────────────
  {
    name: "selected_app",
    label: "Selected app",
    description:
      'App key of the service whose logs are shown, e.g. "ai-dream-server", "scraper-service-dev". Always present — comes from the [app] route segment.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 100,
    group: "app_selection",
  },
  {
    name: "selected_app_environment",
    label: "Selected app environment",
    description:
      '"production" or "development" for the selected app, taken from the static app registry. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 105,
    group: "app_selection",
  },
  {
    name: "available_apps",
    label: "Available apps",
    description:
      "The static catalogue of services the viewer can switch to, each with { key, label, env }. Always present — does not depend on a fetch.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 110,
    group: "app_selection",
  },

  // ── Fetch state ─────────────────────────────────────────────────────────
  {
    name: "requested_line_count",
    label: "Requested line count",
    description:
      "Number of trailing log lines requested from Coolify for the current fetch (one of a fixed set: 50-10000). Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 200,
    group: "fetch_state",
  },
  {
    name: "poll_interval_ms",
    label: "Auto-refresh interval (ms)",
    description:
      "How often the viewer re-fetches logs automatically; 0 means manual refresh only. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 210,
    group: "fetch_state",
  },
  {
    name: "logs_fetched_at",
    label: "Logs fetched at",
    description:
      "ISO timestamp of the last successful log fetch. Absent before the first fetch completes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 220,
    group: "fetch_state",
  },
  {
    name: "logs_loading",
    label: "Logs loading",
    description: "True while a log fetch is in flight. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 230,
    group: "fetch_state",
  },
  {
    name: "logs_fetch_error",
    label: "Fetch error",
    description:
      "Error message from the last failed log fetch. Absent when the last fetch succeeded or none has run yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 240,
    group: "fetch_state",
  },

  // ── Filters & search ────────────────────────────────────────────────────
  {
    name: "log_filters",
    label: "Active log filters",
    description:
      "The parsed-log filter state applied to the raw text: { levels, categories, urgencies, module, search }, each a selected subset (or \"all\") of the log-rules enums. Always present — the viewer always has a filter object, even at defaults.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 250,
    sortOrder: 300,
    group: "filters",
  },
  {
    name: "log_noise_excludes",
    label: "Noise exclusion presets",
    description:
      "Which built-in noise presets are toggled on (cloudFiles, healthChecks, admin, replaySweep, wakeListener, autoIngestListener) — persisted in localStorage across sessions. Always present.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 150,
    autoContext: false,
    sortOrder: 310,
    group: "filters",
  },
  {
    name: "view_mode",
    label: "View mode",
    description:
      'Layout mode of the log panel — "log-only" or a split/inspector mode alongside the JSON payload viewer. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 320,
    group: "filters",
  },

  // ── Log content ─────────────────────────────────────────────────────────
  {
    name: "visible_log_line_count",
    label: "Visible log line count",
    description:
      "Number of parsed log lines currently visible after filters are applied. Always present — 0 when nothing matches or no logs are loaded.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "log_view",
  },
  {
    name: "raw_logs",
    label: "Raw log text",
    description:
      "The unparsed log text returned by the last fetch for the selected app. Bindable only — can be very large; prefer `visible_log_line_count` plus a selected line for targeted questions. Empty before the first fetch.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20000,
    autoContext: false,
    sortOrder: 410,
    group: "log_view",
  },
  {
    name: "selected_log_line",
    label: "Selected log line",
    description:
      "The single parsed log line the admin has clicked to inspect: { raw, timestamp, level, module, category, urgency }. Absent when nothing is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 420,
    group: "log_view",
  },
];

export const adminServerLogsManifest: SurfaceManifest = {
  surfaceName: ADMIN_SERVER_LOGS_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest audited against the live CoolifyLogViewer.tsx state (selectedApp, lineCount, pollInterval, filters, viewMode, selectedLine, rawLogs, fetchedAt, error). No SurfaceRuntimeProvider is wired yet — assembling the scope from that much local state in a 1,400+ line component is a follow-up task, not a drop-in addition.",
  label: "Server Logs",
  urlPattern: "/administration/compute/server-logs",
  intro: `<surface_intro>
This is an ADMIN surface: the super-admin server log viewer at /administration/compute/server-logs/[app], showing live Coolify logs for one backend service (aidream, scraper-service, or matrx-ai, each with a production and development deployment).

The viewer fetches raw log text, parses it into lines with level/category/urgency/module, and lets the admin filter, search, and select a line for JSON-payload inspection. selected_app and selected_app_environment tell you which service/environment you are looking at; log_filters and log_noise_excludes describe what has been narrowed out; visible_log_line_count and selected_log_line describe what is actually on screen.

What you may safely do: read the visible/selected log content and explain errors, summarize patterns, or suggest a better filter or search term. You never execute anything here and cannot restart, deploy, or modify the service being logged.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry in `available_apps`. */
export interface AdminServerLogsAppEntry {
  key: string;
  label: string;
  env: "production" | "development";
}

/** One filter selection as emitted in `log_filters`. */
export interface AdminServerLogsFilters {
  levels: string[] | "all";
  categories: string[] | "all";
  urgencies: string[] | "all";
  module: string | null;
  search: string;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminServerLogsScope(values: {
  // alwaysAvailable: true → required
  selected_app: string;
  selected_app_environment: "production" | "development";
  available_apps: AdminServerLogsAppEntry[];
  requested_line_count: number;
  poll_interval_ms: number;
  logs_loading: boolean;
  log_filters: AdminServerLogsFilters;
  log_noise_excludes: Record<string, boolean>;
  view_mode: string;
  visible_log_line_count: number;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  logs_fetched_at?: string;
  logs_fetch_error?: string;
  raw_logs?: string;
  selected_log_line?: {
    raw: string;
    timestamp: string | null;
    level: string;
    module: string | null;
    category: string;
    urgency: string;
  };
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
