/**
 * features/server-logs/server-logs-scope.ts
 *
 * Runtime scope builder for the Server Logs surface (`matrx-admin/server-logs`),
 * consumed by the `SurfaceRuntimeProvider` mounted in
 * `components/admin/server-logs/CoolifyLogViewer.tsx`.
 *
 * Everything here is SYNCHRONOUS and pure over values the viewer already holds
 * in its render closure. That is a hard requirement, not a style choice: the
 * Surface Context window samples `getScope()` every 400ms for as long as it is
 * open (`features/surfaces/runtime/useLiveSurfaceScope.ts`), so an emitter that
 * fetched would hammer `/api/admin/coolify-logs` continuously behind a panel
 * that looks idle.
 *
 * Two reshaping jobs justify a module rather than an inline literal:
 *
 *  1. `LogFilters` keeps levels / categories / urgencies / modules / endpoints
 *     as `Set`s. `JSON.stringify(new Set(["ERROR"]))` is `{}` — emitting the
 *     filter object raw would show agents an EMPTY filter while the UI showed
 *     an active one. Every Set is flattened to a sorted array.
 *  2. Log text is unbounded (up to 10,000 lines per fetch) and the 400ms
 *     sampler fingerprints the whole scope with `JSON.stringify`. Text values
 *     are capped to a TAIL — the newest lines, which is what an admin looking
 *     at a log actually wants — and the cut is announced in-band so the agent
 *     never mistakes a truncated view for the whole story.
 */

import {
  createAdminServerLogsScope,
  type AdminServerLogsAppEntry,
  type AdminServerLogsFilters,
  type AdminServerLogsLevelCounts,
  type AdminServerLogsSelectedRange,
  type AdminServerLogsViewRange,
} from "@/features/surfaces/manifests/admin-server-logs.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  ALL_LEVELS,
  type LogFilters,
  type LogNoiseExcludes,
  type ParsedLogLine,
} from "./log-rules";

/** Most visible lines emitted in `visible_log_lines` (newest kept). */
export const VISIBLE_LINES_MAX = 300;
/** Character ceiling for `visible_log_lines`, applied after the line cap. */
export const VISIBLE_LINES_MAX_CHARS = 18_000;
/** Character ceiling for the `raw_logs` tail. */
export const RAW_LOGS_MAX_CHARS = 20_000;
/** Character ceiling for the baseline `selection` value. */
export const SELECTION_MAX_CHARS = 12_000;

/** Sorted array form of a Set — see the `JSON.stringify(new Set())` note above. */
function setToArray<T extends string>(set: ReadonlySet<T>): string[] {
  return [...set].sort();
}

/**
 * Keeps the LAST `maxChars` characters, cut on a line boundary so the agent
 * never reads half a log line, and prefixes a banner naming what was dropped.
 * Returns the text unchanged when it already fits.
 */
function tailByChars(text: string, maxChars: number, unit: string): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(text.length - maxChars);
  const firstBreak = cut.indexOf("\n");
  const clean = firstBreak >= 0 ? cut.slice(firstBreak + 1) : cut;
  const dropped = text.length - clean.length;
  return `[truncated: showing the last ${clean.length} of ${text.length} ${unit}; ${dropped} older characters were dropped]\n${clean}`;
}

/** The filter state, flattened to something that survives `JSON.stringify`. */
export function buildLogFiltersValue(filters: LogFilters): AdminServerLogsFilters {
  return {
    levels: setToArray(filters.levels),
    categories: setToArray(filters.categories),
    urgencies: setToArray(filters.urgencies),
    search: filters.search,
    modules: setToArray(filters.modules),
    modules_cleared: filters.modulesCleared,
    endpoints: setToArray(filters.endpoints),
    endpoints_cleared: filters.endpointsCleared,
    show_json_payloads: filters.showJsonPayloads,
  };
}

/**
 * Per-level tallies over the visible lines. EVERY level key is present with an
 * explicit 0 — an agent asked "any errors?" should read `ERROR: 0`, not have to
 * infer absence from a missing key.
 */
export function buildLevelCounts(
  lines: readonly ParsedLogLine[],
): AdminServerLogsLevelCounts {
  const counts: AdminServerLogsLevelCounts = {};
  for (const level of ALL_LEVELS) counts[level] = 0;
  for (const line of lines) {
    if (line.raw.trim() === "") continue;
    counts[line.level] = (counts[line.level] ?? 0) + 1;
  }
  return counts;
}

/**
 * Raw text of the visible lines, oldest first, blank lines dropped, capped to
 * the newest `VISIBLE_LINES_MAX` lines and then to `VISIBLE_LINES_MAX_CHARS`.
 * Returns undefined when nothing is visible — the value is `alwaysAvailable:
 * false`, so absent is the honest emission for an empty view.
 */
export function buildVisibleLinesText(
  lines: readonly ParsedLogLine[],
): string | undefined {
  const nonBlank = lines.filter((line) => line.raw.trim() !== "");
  if (nonBlank.length === 0) return undefined;

  const kept = nonBlank.slice(-VISIBLE_LINES_MAX);
  const text = kept.map((line) => line.raw).join("\n");
  const banner =
    kept.length < nonBlank.length
      ? `[truncated: showing the last ${kept.length} of ${nonBlank.length} visible lines]\n`
      : "";
  return banner + tailByChars(text, VISIBLE_LINES_MAX_CHARS, "characters");
}

export interface AdminServerLogsScopeInput {
  selectedApp: string;
  appEnvironment: "production" | "development";
  apps: readonly { key: string; label: string; env: string }[];
  lineCount: number;
  pollInterval: number;
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
  filters: LogFilters;
  noiseExcludes: LogNoiseExcludes;
  viewMode: string;
  startOffset: number;
  displayCount: number | null;
  rawLogs: string;
  /** Lines returned by the last fetch, before range window + filters. */
  fetchedLineCount: number;
  /** Lines actually rendered — after the range window AND the filters. */
  visibleLines: readonly ParsedLogLine[];
  selectedLine: ParsedLogLine | null;
  /** `lineIndex` values inside the click / shift-click marked range. */
  selectedLineIndexes: ReadonlySet<number>;
  selectionAnchor: number | null;
  selectionTail: number | null;
}

/**
 * Assemble the live scope. Called from the provider's `getScope` on every
 * 400ms sample, so it stays O(visible lines) and allocates nothing unbounded.
 */
export function buildAdminServerLogsScope(
  input: AdminServerLogsScopeInput,
): SurfaceScopePayload {
  const available_apps: AdminServerLogsAppEntry[] = input.apps.map((app) => ({
    key: app.key,
    label: app.label,
    env: app.env === "production" ? "production" : "development",
  }));

  const log_view_range: AdminServerLogsViewRange = {
    start_offset: input.startOffset,
    display_count: input.displayCount,
  };

  // The marked range, in the 1-based numbers the gutter shows — `lineIndex` is
  // a 0-based index into the FETCHED buffer, which is not what the admin reads
  // off the screen, so emitting it unconverted would be quietly off by one.
  let selected_line_range: AdminServerLogsSelectedRange | undefined;
  let selection: string | undefined;
  if (input.selectionAnchor !== null) {
    const marked = input.visibleLines.filter(
      (line) =>
        input.selectedLineIndexes.has(line.lineIndex) && line.raw.trim() !== "",
    );
    selected_line_range = {
      anchor_line: input.selectionAnchor + 1,
      tail_line: input.selectionTail === null ? null : input.selectionTail + 1,
      selected_count: marked.length,
    };
    if (marked.length > 0) {
      selection = tailByChars(
        marked.map((line) => line.raw).join("\n"),
        SELECTION_MAX_CHARS,
        "characters",
      );
    }
  }

  return createAdminServerLogsScope({
    selected_app: input.selectedApp,
    selected_app_environment: input.appEnvironment,
    available_apps,
    requested_line_count: input.lineCount,
    poll_interval_ms: input.pollInterval,
    logs_loading: input.loading,
    log_filters: buildLogFiltersValue(input.filters),
    log_noise_excludes: { ...input.noiseExcludes },
    view_mode: input.viewMode,
    log_view_range,
    fetched_log_line_count: input.fetchedLineCount,
    visible_log_line_count: input.visibleLines.length,
    visible_log_level_counts: buildLevelCounts(input.visibleLines),

    logs_fetched_at: input.fetchedAt ?? undefined,
    logs_fetch_error: input.error ?? undefined,
    visible_log_lines: buildVisibleLinesText(input.visibleLines),
    raw_logs: input.rawLogs
      ? tailByChars(input.rawLogs, RAW_LOGS_MAX_CHARS, "characters")
      : undefined,
    selected_log_line: input.selectedLine
      ? {
          raw: input.selectedLine.raw,
          timestamp: input.selectedLine.timestamp,
          level: input.selectedLine.level,
          module: input.selectedLine.module,
          category: input.selectedLine.category,
          urgency: input.selectedLine.urgency,
        }
      : undefined,
    selected_line_range,
    selection,
  });
}
