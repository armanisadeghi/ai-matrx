/**
 * Pure rules the social tiles' views run on: how a tile's size picks its layout, which stored posts a
 * profile tile shows first, and the follower sparkline's path. No I/O and no React, so every rule is
 * unit-tested (`__tests__/social-tile-model.test.ts`). Sizes are the tile body's own layout pixels
 * (the board scales the whole card; a body never sees the zoom).
 */

import type { PostCardModel } from "@/features/marketing/social/types";

export interface BoxSize {
  w: number;
  h: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Posts shown best first: the biggest multiple, then the most views, then the newest. A null never outranks a number. */
export function rankPostsForTile(posts: readonly PostCardModel[]): PostCardModel[] {
  const score = (p: PostCardModel) => p.outlierScore ?? -1;
  const views = (p: PostCardModel) => p.views ?? -1;
  const when = (p: PostCardModel) => (p.postedAt ? Date.parse(p.postedAt) || 0 : 0);
  return [...posts].sort((a, b) => score(b) - score(a) || views(b) - views(a) || when(b) - when(a));
}

/** The pixel widths the profile layout is built from. */
const GRID_PAD = 12;
const GRID_GAP = 6;
const MIN_THUMB = 96;
/** Thumbnails are drawn 3:4 (the platform's own 9:16 is cropped by object-cover, never stretched). */
const THUMB_RATIO = 4 / 3;
const HEADER_H = 64;
const ACTIONS_H = 36;
const STATS_H = 44;
const SPARK_H = 84;

export interface ProfilePlan {
  cols: number;
  rows: number;
  /** Cells in the grid (the last is "+N more" when posts overflow). */
  cells: number;
  stats: boolean;
  spark: boolean;
}

/**
 * Small tile: header + one row of thumbnails (three across at the narrowest sensible width).
 * Large tile: header, stat strip, two to three rows and a follower sparkline. The body also scrolls,
 * so a plan is a target, never a clip.
 */
export function profilePlan(size: BoxSize, postCount: number, snapshotCount: number): ProfilePlan {
  const inner = size.w - GRID_PAD * 2;
  const cols = clamp(Math.floor((inner + GRID_GAP) / (MIN_THUMB + GRID_GAP)), 2, 6);
  const stats = size.h >= 400;
  const spark = size.h >= 620 && snapshotCount >= 2;
  const thumbW = (inner - GRID_GAP * (cols - 1)) / cols;
  const available =
    size.h - GRID_PAD * 2 - HEADER_H - ACTIONS_H - (stats ? STATS_H : 0) - (spark ? SPARK_H : 0);
  const rows = clamp(Math.floor((available + GRID_GAP) / (thumbW * THUMB_RATIO + GRID_GAP)), 1, 3);
  const cells = Math.min(cols * rows, Math.max(postCount, 0));
  return { cols, rows, cells: Math.max(cells, 0), stats, spark };
}

export type PostLayout = "stack" | "split";

/** A wide post tile puts the poster beside the words; a narrow one stacks them. */
export function postLayout(size: BoxSize): PostLayout {
  return size.w >= 520 && size.h >= 300 ? "split" : "stack";
}

export type FeedLayout = "list" | "grid";

export interface FeedPlan {
  layout: FeedLayout;
  cols: number;
}

/** A narrow feed is a list of rows with a thumbnail; a wide one is a grid of poster cards. */
export function feedPlan(size: BoxSize): FeedPlan {
  if (size.w < 380) return { layout: "list", cols: 1 };
  return { layout: "grid", cols: clamp(Math.floor((size.w - GRID_PAD * 2 + GRID_GAP) / (132 + GRID_GAP)), 2, 6) };
}

/** Swipe tile: how many thumbnails fit in one row of the mosaic. */
export function swipeCols(size: BoxSize): number {
  return clamp(Math.floor((size.w - GRID_PAD * 2 + GRID_GAP) / (84 + GRID_GAP)), 2, 6);
}

export interface SparkPoint {
  t: number;
  value: number;
}

/** An SVG polyline path for the follower series inside a `w` x `h` box with `pad` on every side. Null below two points. */
export function sparklinePath(points: readonly SparkPoint[], w: number, h: number, pad = 3): string | null {
  if (points.length < 2) return null;
  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t;
  const lo = Math.min(...points.map((p) => p.value));
  const hi = Math.max(...points.map((p) => p.value));
  const spanT = t1 - t0 || 1;
  const spanV = hi - lo || 1;
  return points
    .map((p, i) => {
      const x = pad + ((p.t - t0) / spanT) * (w - pad * 2);
      const y = hi === lo ? h / 2 : h - pad - ((p.value - lo) / spanV) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
