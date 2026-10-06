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
//  - the grid result keeps only each point's #1 listing (`top_result`), so a
//    winner's average rank and coverage are NOT knowable from it. Those cells
//    say so instead of inventing a number.

import { formatAbsoluteDate, formatUsd } from "@ai-matrx/kit/format";
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

// ── us against the grid's winners ────────────────────────────────────────

export interface CompareRow {
  key: string;
  name: string;
  isUs: boolean;
  /** Points where this business ranked #1. */
  wins: number;
  /** Average rank where found; null when the grid cannot say. */
  avgRank: number | null;
  /** Points found / points searched; null when the grid cannot say. */
  found: number | null;
  searched: number;
}

function sameBusiness(
  top: { name: string | null; cid: string | null },
  us: { name: string | null; cid: string | null },
): boolean {
  if (top.cid && us.cid) return top.cid === us.cid;
  return !!top.name && !!us.name && top.name.trim().toLowerCase() === us.name.trim().toLowerCase();
}

/**
 * Us, then the three businesses that ranked #1 at the most points (ties keep
 * the first seen). A winner's average rank and coverage stay null: the grid
 * keeps only each point's #1 listing.
 */
export function compareRows(result: GridResultData, us: { name: string; cid: string | null }): CompareRow[] {
  const searched = result.summary.points_searched;
  const ours: CompareRow = {
    key: "us",
    name: result.matched_business?.name ?? us.name,
    isUs: true,
    wins: result.points.filter((p) => p.rank === 1).length,
    avgRank: result.summary.avg_rank,
    found: result.summary.points_found,
    searched,
  };
  const counts = new Map<string, { name: string; wins: number; order: number }>();
  for (const p of result.points) {
    const top = p.top_result;
    if (!top || (!top.name && !top.cid) || p.error || p.pending) continue;
    if (p.rank === 1 || sameBusiness(top, { name: us.name, cid: us.cid })) continue;
    const key = top.cid || (top.name ?? "").trim().toLowerCase();
    const prev = counts.get(key);
    if (prev) prev.wins += 1;
    else counts.set(key, { name: top.name ?? "Unnamed listing", wins: 1, order: counts.size });
  }
  const winners = [...counts.entries()]
    .sort((a, b) => b[1].wins - a[1].wins || a[1].order - b[1].order)
    .slice(0, 3)
    .map(([key, w]) => ({
      key,
      name: w.name,
      isUs: false,
      wins: w.wins,
      avgRank: null,
      found: null,
      searched,
    }));
  return [ours, ...winners];
}

// ── where the numbers came from ──────────────────────────────────────────

export function shortDate(value: string | null | undefined): string {
  if (!value) return "unknown date";
  return formatAbsoluteDate(value, { month: "short", day: "numeric", year: "numeric" });
}

export function usd(value: number | null | undefined): string {
  return value == null ? "cost unknown" : formatUsd(value, { digits: "trim" });
}

/**
 * The grid's source line: "Reused from <date>" when every point was a stored
 * run, "N of M points reused" when some were, else what was bought.
 * The date is the OLDEST point's collection date — the grid is as old as that.
 */
export function sourceLine(envelope: ToolEnvelope<GridResultData>): { reused: boolean; text: string } {
  const points = envelope.data?.points.filter((p) => !p.pending).length ?? 0;
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
  const bought = `Bought ${shortDate(boughtAt)}${charged != null ? ` · ${usd(charged)}` : ""}`;
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
    Array.isArray((data as { points?: unknown }).points) &&
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
