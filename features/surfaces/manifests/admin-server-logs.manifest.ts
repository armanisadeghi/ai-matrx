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
 * EMITTER WIRED (2026-08-12). `CoolifyLogViewer.tsx` now mounts a
 * `SurfaceRuntimeProvider` around its own tree and builds the scope through
 * `buildAdminServerLogsScope` (`features/server-logs/server-logs-scope.ts`).
 * `getScope` is SYNCHRONOUS over live render state and never fetches — the
 * Surface Context window samples it every 400ms while open, so an async
 * emitter here would re-hit `/api/admin/coolify-logs` continuously behind an
 * idle-looking debug panel. Everything it emits is already in the component's
 * render closure; the builder only reshapes it.
 *
 * TWO REASONS THE BUILDER EXISTS rather than an inline object literal:
 *  1. `LogFilters` stores levels/categories/urgencies/modules/endpoints as
 *     `Set`s, and `JSON.stringify(new Set([...]))` is `{}` — emitting the
 *     filter state raw would hand every agent an empty object while the UI
 *     plainly showed active filters. The builder converts Sets to arrays.
 *  2. Log text is unbounded (up to 10,000 lines per fetch) and the 400ms
 *     sampler fingerprints the whole scope with `JSON.stringify`. `raw_logs`
 *     and `visible_log_lines` are therefore emitted as capped TAILS with an
 *     explicit truncation banner — see the caps in the builder module.
 *
 * ── WRITE TARGETS: RULED OUT (2026-08-12) ────────────────────────────────
 * This surface declares NO `writeTargets`, deliberately. Ranked against the
 * `surface-write-targets` judgment bar, every input on the page fails, and
 * it fails in the two ways the campaign has consistently refused:
 *
 *  - THE PAGE IS A RECORD, NOT A DOCUMENT. Everything it displays is
 *    Coolify's log stream, fetched read-only. `app/api/admin/coolify-logs/
 *    route.ts` exports `GET` and nothing else, and `CoolifyLogViewer.tsx`
 *    contains no dispatch, no supabase client and no non-GET fetch. There is
 *    no authored content here for an agent to draft better — letting an agent
 *    write to a log viewer could only ever mean helping it FORGE a finding
 *    rather than change one. Same reasoning that ruled out the `marketing-*`
 *    report surfaces and `marketing-authority`'s computed model.
 *  - EVERY INPUT IS VIEW STATE. Selected app, line count, poll interval,
 *    level/category/urgency/module/endpoint filters, search, view mode, the
 *    line-range window and the line selection all change only WHAT A HUMAN IS
 *    LOOKING AT — the explicitly ruled-out view-state class. Nothing is
 *    staged, nothing is saved: the sole persistence on the whole page is one
 *    localStorage key (`matrx:server-log-noise-excludes`) holding six display
 *    toggles. There is no saved filter, no stored query, and no retention or
 *    level setting to stage.
 *
 * A documented NO is the outcome here, not a gap to fill later. If this page
 * ever grows a genuine authored input — a SAVED named query, an annotation on
 * a line, a retention/level policy that changes what the server keeps — that
 * input, and only it, would be worth re-ranking.
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
      "The active level/category/urgency/module/endpoint/search filters, the noise-exclusion presets, and the line-range window applied to the parsed log lines.",
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
      'The parsed-log filter state applied to the fetched text: { levels, categories, urgencies, search, modules, modules_cleared, endpoints, endpoints_cleared, show_json_payloads }. levels/categories/urgencies are the SELECTED subsets of the log-rules enums — a full array means nothing is narrowed. modules/endpoints are allowlists: empty with the matching *_cleared false means "no narrowing", empty with it true means "show nothing". Always present — the viewer always has a filter object, even at defaults.',
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 400,
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
  {
    name: "log_view_range",
    label: "Line range window",
    description:
      "The Range panel's window over the fetched lines, applied BEFORE the filters: { start_offset, display_count }. display_count is null when the window runs to the end. Always present — { start_offset: 0, display_count: null } means the whole fetched buffer is in play.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 50,
    autoContext: false,
    sortOrder: 330,
    group: "filters",
  },

  // ── Log content ─────────────────────────────────────────────────────────
  {
    name: "fetched_log_line_count",
    label: "Fetched log line count",
    description:
      "Total number of lines returned by the last fetch, before the range window and filters narrow them. Always present — 0 before the first fetch. This is the denominator in the toolbar's \"visible/fetched lines\" readout.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 395,
    group: "log_view",
  },
  {
    name: "visible_log_line_count",
    label: "Visible log line count",
    description:
      "Number of parsed log lines currently visible after the range window and filters are applied. Always present — 0 when nothing matches or no logs are loaded. This is the numerator in the toolbar's \"visible/fetched lines\" readout.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "log_view",
  },
  {
    name: "visible_log_level_counts",
    label: "Visible level counts",
    description:
      "How many of the currently visible lines carry each log level, as { DEBUG, INFO, WARNING, ERROR, CRITICAL, UNKNOWN }. Every key is present, with 0 where no line matched. Always present — all zeros before the first fetch. Use this to answer \"is anything erroring\" without reading the log text.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 110,
    sortOrder: 405,
    group: "log_view",
  },
  {
    name: "visible_log_lines",
    label: "Visible log lines",
    description:
      "Raw text of the log lines on screen right now — the lines left after the range window and filters, blank lines dropped, oldest first. TRUNCATED to a bounded TAIL (the newest lines) when the visible set is large; when that happens the text starts with a `[truncated: showing the last N of M …]` banner, so trust that banner over your own count. Absent when no lines are visible. NOTE: when `view_mode` is \"raw\" the panel shows unparsed text instead and `raw_logs` is what the admin is reading — this value still describes the parsed view behind it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 18000,
    sortOrder: 408,
    group: "log_view",
  },
  {
    name: "raw_logs",
    label: "Raw log text",
    description:
      "The unparsed log text returned by the last fetch for the selected app — what the \"raw\" view mode shows, with no range window, filters or parsing applied. TRUNCATED to a bounded tail like `visible_log_lines`, with the same banner. Bindable only — prefer `visible_log_lines` or a selected line for targeted questions. Absent before the first fetch.",
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
  {
    name: "selected_line_range",
    label: "Selected line range",
    description:
      "The multi-line range the admin has marked with click / shift-click, as { anchor_line, tail_line, selected_count } using 1-based on-screen line numbers. tail_line is null when only the anchor is set. Absent when nothing is marked; the marked text itself arrives as the baseline `selection` value.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 425,
    group: "log_view",
  },
];

export const adminServerLogsManifest: SurfaceManifest = {
  surfaceName: ADMIN_SERVER_LOGS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired and verified live (2026-08-12): CoolifyLogViewer.tsx mounts SurfaceRuntimeProvider and every declared value is populated from live render state via buildAdminServerLogsScope. Short of `verified` on two honest counts. (1) `raw_logs` and `visible_log_lines` are emitted as capped TAILS with a truncation banner, not in full — the 400ms Surface Context sampler JSON.stringify-fingerprints the whole scope, and a 10,000-line fetch is megabytes. (2) The DB mirror has not been re-synced since this pass added `fetched_log_line_count`, `visible_log_level_counts`, `visible_log_lines`, `log_view_range` and `selected_line_range` and reshaped `log_filters`; run the surfaces-admin sync to clear it. Write targets are RULED OUT by design, not pending — see the ruling in the file header.",
  label: "Server Logs",
  urlPattern: "/administration/compute/server-logs",
  intro: `<surface_intro>
This is an ADMIN surface: the super-admin server log viewer at /administration/compute/server-logs/[app], showing live Coolify logs for one backend service (aidream, scraper-service, or matrx-ai, each with a production and development deployment).

The viewer fetches raw log text, parses it into lines with level/category/urgency/module, and lets the admin filter, search, and select a line for JSON-payload inspection. selected_app and selected_app_environment tell you which service/environment you are looking at; log_filters, log_noise_excludes and log_view_range describe what has been narrowed out; fetched_log_line_count vs visible_log_line_count tell you how much of the fetch survived that narrowing.

READ THE LOGS FROM visible_log_lines — it carries the actual text of the lines on screen. visible_log_level_counts answers "is anything erroring" without reading them. selected_log_line and selected_line_range tell you what the admin has singled out; the marked text arrives as the baseline "selection" value. Both visible_log_lines and raw_logs are capped to a TAIL of the newest lines and announce it with a "[truncated: ...]" banner — believe that banner rather than counting lines yourself, and say so when a question depends on lines that were cut.

What you may safely do: read the visible/selected log content and explain errors, summarize patterns, or suggest a better filter or search term. This surface is READ-ONLY BY DESIGN — it declares no write targets, and you cannot change a filter, restart, deploy, or modify the service being logged. The logs are the record of what happened; if you propose a filter or a fix, say it is a suggestion and never imply you applied it.
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

/**
 * The filter state as EMITTED in `log_filters`.
 *
 * Deliberately not `LogFilters` from `features/server-logs/log-rules.ts`: that
 * type stores five of these as `Set`s, and `JSON.stringify(new Set([...]))` is
 * `{}`. Emitting it raw would hand agents an empty object while the UI showed
 * active filters, so the builder flattens every Set to a sorted array.
 */
export interface AdminServerLogsFilters {
  /** Selected subsets — a FULL array means that axis narrows nothing. */
  levels: string[];
  categories: string[];
  urgencies: string[];
  search: string;
  /** Allowlist; empty + `modules_cleared: false` = no narrowing. */
  modules: string[];
  modules_cleared: boolean;
  /** Allowlist; empty + `endpoints_cleared: false` = no narrowing. */
  endpoints: string[];
  endpoints_cleared: boolean;
  show_json_payloads: boolean;
}

/** The Range panel window, as emitted in `log_view_range`. */
export interface AdminServerLogsViewRange {
  start_offset: number;
  /** null when the window runs to the end of the fetched buffer. */
  display_count: number | null;
}

/** Per-level tallies over the visible lines, as emitted in `visible_log_level_counts`. */
export type AdminServerLogsLevelCounts = Record<string, number>;

/** The click / shift-click selection, as emitted in `selected_line_range`. */
export interface AdminServerLogsSelectedRange {
  /** 1-based on-screen line number of the first click. */
  anchor_line: number;
  /** 1-based on-screen line number of the shift-click end, or null. */
  tail_line: number | null;
  selected_count: number;
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
  log_view_range: AdminServerLogsViewRange;
  fetched_log_line_count: number;
  visible_log_line_count: number;
  visible_log_level_counts: AdminServerLogsLevelCounts;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  logs_fetched_at?: string;
  logs_fetch_error?: string;
  visible_log_lines?: string;
  raw_logs?: string;
  selected_log_line?: {
    raw: string;
    timestamp: string | null;
    level: string;
    module: string | null;
    category: string;
    urgency: string;
  };
  selected_line_range?: AdminServerLogsSelectedRange;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
