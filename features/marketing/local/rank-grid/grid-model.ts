// features/marketing/local/rank-grid/grid-model.ts — the rank-grid screen's
// pure reads: the arguments each call sends, one point → one bubble, the
// comparison against the grid's winners, and where the numbers came from.
// Pure, so every state the map and table can show is tested without a server.
//
// HONESTY RULES (from matrx_seo/local_grid.py):
//  - a missing rank is read against the result count: "no results" (nobody is
//    listed), "sparse" (fewer results than the depth and we are not among
//    them), "outranked" (a full page without us). Three different sentences.
//  - a failed point is never "not found"; a never-sent point is never either.
//  - competitors' average rank and coverage come only from the tool's own
//    `competitors` summary (computed from every listing at every point); the
//    screen never derives them from the per-point #1.

import { formatAbsoluteDate } from "@ai-matrx/kit/format";
import type { ToolActionOutcome } from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import { isToolEnvelope, type ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";
import type {
  ConfirmedBusiness,
  GridPreviewData,
  GridPoint,
  GridRequest,
  GridResultData,
  NotFoundReading,
} from "./types";

// ── arguments ────────────────────────────────────────────────────────────

function businessArgs(business: ConfirmedBusiness, request: GridRequest) {
  return {
    action: "rank_grid",
    keyword: request.keyword.trim(),
    name: business.name,
    ...(business.cid ? { cid: business.cid } : {}),
    ...(business.place_id && !business.cid ? { place_id: business.place_id } : {}),
    center: { latitude: business.lat, longitude: business.lng },
    grid_size: request.gridSize,
    spacing_km: request.spacingKm,
    device: request.device,
  };
}

/** The free preview: points, matched storefront, estimate. Never spends. */
export function previewArgs(business: ConfirmedBusiness, request: GridRequest) {
  return { ...businessArgs(business, request), preview: true };
}

/** The run, naming the center the person confirmed in the preview. */
export function runArgs(business: ConfirmedBusiness, request: GridRequest, centerConfirmed: string) {
  return { ...businessArgs(business, request), preview: false, center_confirmed: centerConfirmed };
}

// ── one point → one bubble ───────────────────────────────────────────────

export type BubbleTone =
  | "top3"
  | "top10"
  | "ranked"
  | "outranked"
  | "sparse"
  | "no_results"
  | "failed"
  | "pending";

export interface Bubble {
  /** What the bubble shows: the rank, or a mark. */
  text: string;
  tone: BubbleTone;
  /** One line for the tooltip/popup. */
  label: string;
}

export function readingOf(point: GridPoint, depth: number): NotFoundReading | null {
  if (point.not_found_reading) return point.not_found_reading;
  if (point.results_count == null) return null;
  if (point.results_count === 0) return "no_results";
  return point.results_count < depth ? "sparse" : "outranked";
}

export function bubbleFor(point: GridPoint, depth: number): Bubble {
  if (point.error) return { text: "x", tone: "failed", label: "Search failed here" };
  if (point.pending) return { text: "?", tone: "pending", label: "Not searched yet" };
  if (point.rank != null) {
    const tone: BubbleTone = point.rank <= 3 ? "top3" : point.rank <= 10 ? "top10" : "ranked";
    return { text: String(point.rank), tone, label: `Rank ${point.rank}` };
  }
  switch (readingOf(point, depth)) {
    case "no_results":
      return { text: "–", tone: "no_results", label: "No results for this search here" };
    case "sparse":
      return {
        text: "–",
        tone: "sparse",
        label: `Not listed among ${point.results_count} results`,
      };
    default:
      return { text: `${depth}+`, tone: "outranked", label: `Not in the top ${depth}` };
  }
}

/** Bubble classes by tone. Literal strings so the stylesheet builder keeps them. */
export const BUBBLE_CLASS: Record<BubbleTone | "preview", string> = {
  top3: "bg-emerald-600 text-white border-emerald-700",
  top10: "bg-amber-400 text-amber-950 border-amber-500",
  ranked: "bg-orange-500 text-white border-orange-600",
  outranked: "bg-rose-600 text-white border-rose-700",
  sparse: "bg-card text-muted-foreground border-dashed border-muted-foreground",
  no_results: "bg-muted text-muted-foreground border-dashed border-border",
  failed: "bg-card text-rose-600 border-rose-600",
  pending: "bg-card text-muted-foreground border-border",
  preview: "bg-primary/15 text-primary border-primary",
};

export const LEGEND: { tone: BubbleTone; text: string; label: string }[] = [
  { tone: "top3", text: "1", label: "Top 3" },
  { tone: "top10", text: "7", label: "4–10" },
  { tone: "ranked", text: "14", label: "11 and below" },
  { tone: "outranked", text: "20+", label: "Not in top results" },
  { tone: "sparse", text: "–", label: "Not listed here" },
  { tone: "no_results", text: "–", label: "No results here" },
  { tone: "failed", text: "x", label: "Search failed" },
];

// ── the grid's points, in either shape the tool returns ──────────────────

const KM_PER_DEGREE_LATITUDE = 110.574;
const KM_PER_DEGREE_LONGITUDE = 111.32;
const MIN_LONGITUDE_COSINE = 0.01;

const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

/**
 * A point's coordinate from the grid's geometry — the same formula as
 * matrx_seo/local_grid.py `build_grid`: row 0 is the north edge, steps are
 * spacing/110.574 degrees of latitude and spacing/(111.32·max(|cos lat|, 0.01))
 * of longitude, rounded to 7 decimals.
 */
export function gridCoordinate(
  center: { latitude: number; longitude: number },
  size: number,
  spacingKm: number,
  row: number,
  col: number,
): { lat: number; lng: number } {
  const middle = (size - 1) / 2;
  const cos = Math.max(Math.abs(Math.cos((center.latitude * Math.PI) / 180)), MIN_LONGITUDE_COSINE);
  const latStep = spacingKm / KM_PER_DEGREE_LATITUDE;
  const lngStep = spacingKm / (KM_PER_DEGREE_LONGITUDE * cos);
  return {
    lat: round7(center.latitude + (middle - row) * latStep),
    lng: round7(center.longitude + (col - middle) * lngStep),
  };
}

/**
 * Every point of a grid result. A result that fit carries `points`; a
 * compacted one (`points_compacted`) carries `point_table` instead — the
 * coordinates follow from the geometry and the #1's name from `competitors`.
 */
export function gridPoints(data: GridResultData): GridPoint[] {
  if (data.points) return data.points;
  const table = data.point_table;
  if (!table) return [];
  const col = (name: string) => table.columns.indexOf(name);
  const at = {
    row: col("row"),
    col: col("col"),
    rank: col("rank"),
    results: col("results_count"),
    top: col("top_cid"),
    state: col("state"),
    run: col("run_id"),
  };
  const names = new Map((data.competitors ?? []).filter((c) => c.cid).map((c) => [c.cid as string, c.name]));
  return table.rows.map((r) => {
    const row = Number(r[at.row]);
    const c = Number(r[at.col]);
    const topCid = (r[at.top] as string | null) ?? null;
    const state = r[at.state] as string;
    const point: GridPoint = {
      row,
      col: c,
      ...gridCoordinate(data.center, data.grid_size, data.spacing_km, row, c),
      rank: (r[at.rank] as number | null) ?? null,
      results_count: (r[at.results] as number | null) ?? null,
      top_result: topCid ? { cid: topCid, name: names.get(topCid) ?? null } : null,
    };
    const run = r[at.run] as string | null;
    if (run) point.run_id = run;
    if (state === "failed") point.error = "failed";
    if (state === "pending") point.pending = true;
    return point;
  });
}

// ── us against the grid's competitors ────────────────────────────────────

export interface CompareRow {
  key: string;
  name: string;
  isUs: boolean;
  /** Points where this business ranked #1. */
  wins: number;
  /** Average rank where found; null when never ranked. */
  avgRank: number | null;
  /** Points where it is listed within the depth checked. */
  found: number;
  searched: number;
}

/**
 * Us, then the three most visible competitors, from the tool's own
 * `competitors` summary (computed server-side from every listing at every
 * point; the target is already excluded). No summary → only our row.
 */
export function compareRows(result: GridResultData, us: { name: string; cid: string | null }): CompareRow[] {
  const points = gridPoints(result);
  const ours: CompareRow = {
    key: "us",
    name: result.matched_business?.name ?? us.name,
    isUs: true,
    wins: points.filter((p) => p.rank === 1).length,
    avgRank: result.summary.avg_rank,
    found: result.summary.points_found,
    searched: result.summary.points_searched,
  };
  const others = (result.competitors ?? [])
    .filter((c) => !(us.cid && c.cid === us.cid))
    .slice(0, 3)
    .map((c, i) => ({
      key: c.cid ?? `name:${c.name ?? i}`,
      name: c.name ?? "Unnamed listing",
      isUs: false,
      wins: c.points_won,
      avgRank: c.avg_rank,
      found: c.points_present,
      searched: c.points_searched,
    }));
  return [ours, ...others];
}

// ── where the numbers came from ──────────────────────────────────────────

export function shortDate(value: string | null | undefined): string {
  if (!value) return "unknown date";
  return formatAbsoluteDate(value, { month: "short", day: "numeric", year: "numeric" });
}

/** A USD cost → the viewer's string (`useCostDisplay().format`); points unless an admin chose dollars. */
export type CostFormat = (usd: number | null | undefined) => string;

export function costText(format: CostFormat, value: number | null | undefined): string {
  return value == null ? "cost unknown" : format(value);
}

/**
 * The grid's source line: "Reused from <date>" when every point was a stored
 * run, "N of M points reused" when some were, else what was bought.
 * The date is the OLDEST point's collection date — the grid is as old as that.
 */
export function sourceLine(
  envelope: ToolEnvelope<GridResultData>,
  format: CostFormat,
): { reused: boolean; text: string } {
  const points = envelope.data ? gridPoints(envelope.data).filter((p) => !p.pending).length : 0;
  const reusedIds = envelope.cost?.reused_run_ids ?? [];
  const reusedSet = new Set(reusedIds);
  const dates = (envelope.evidence ?? [])
    .filter((e) => reusedSet.has(e.run_id) && e.observed_at)
    .map((e) => e.observed_at as string)
    .sort();
  const oldest = dates[0] ?? null;
  if (reusedIds.length > 0 && reusedIds.length >= points) {
    return { reused: true, text: `Reused from ${shortDate(oldest)}` };
  }
  const boughtAt =
    (envelope.evidence ?? [])
      .filter((e) => !reusedSet.has(e.run_id) && e.observed_at)
      .map((e) => e.observed_at as string)
      .sort()
      .pop() ?? null;
  const charged = envelope.cost?.charged_usd;
  const bought = `Bought ${shortDate(boughtAt)}${charged != null ? ` · ${costText(format, charged)}` : ""}`;
  if (reusedIds.length > 0) {
    return { reused: true, text: `${reusedIds.length} of ${points} reused from ${shortDate(oldest)} · ${bought}` };
  }
  return { reused: false, text: bought };
}

// ── one call's outcome → the grid's screen state ─────────────────────────

export type GridState =
  | { kind: "idle" }
  | { kind: "loading"; running: boolean }
  | { kind: "preview"; data: GridPreviewData; notices: string[] }
  | { kind: "result"; envelope: ToolEnvelope<GridResultData> & { data: GridResultData } }
  /** The person declined or closed the approval. Nothing was spent. */
  | { kind: "stopped"; note: string }
  | { kind: "error"; message: string };

function isPreview(data: unknown): data is GridPreviewData {
  return !!data && typeof data === "object" && (data as { preview?: unknown }).preview === true;
}

function isResult(data: unknown): data is GridResultData {
  return (
    !!data &&
    typeof data === "object" &&
    (Array.isArray((data as { points?: unknown }).points) ||
      typeof (data as { point_table?: unknown }).point_table === "object") &&
    typeof (data as { summary?: unknown }).summary === "object"
  );
}

export function gridFromOutcome(outcome: ToolActionOutcome<unknown>): GridState {
  switch (outcome.status) {
    case "declined":
      return { kind: "stopped", note: "Declined. Nothing was spent." };
    case "dismissed":
      return { kind: "stopped", note: "Closed. Nothing was spent." };
    case "busy":
      return { kind: "error", message: outcome.message };
    case "error":
      return { kind: "error", message: outcome.error.message };
    case "ok": {
      const envelope = outcome.output;
      if (!isToolEnvelope<GridPreviewData | GridResultData>(envelope)) {
        return { kind: "error", message: "The tool answered in a shape this page cannot read." };
      }
      if (isPreview(envelope.data)) {
        return { kind: "preview", data: envelope.data, notices: envelope.notices ?? [] };
      }
      // ok, partial (some points failed) and processing (the time budget ran
      // out; unsent points are '?') all carry a readable grid.
      if (isResult(envelope.data)) {
        return {
          kind: "result",
          envelope: envelope as ToolEnvelope<GridResultData> & { data: GridResultData },
        };
      }
      return {
        kind: "error",
        message: envelope.notices?.[0] ?? `The tool answered "${envelope.status}" with no grid.`,
      };
    }
  }
}
