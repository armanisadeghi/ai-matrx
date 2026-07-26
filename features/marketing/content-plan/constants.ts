/**
 * features/marketing/content-plan/constants.ts
 *
 * Display constants for the Content Planning UI. Status colors key on the
 * SEEDED `plan_status` category slugs (platform.categories, dimension
 * `plan_status`) — an unknown slug falls back to the neutral dot, never
 * crashes and never hides the node.
 */
import type { PlanNodeType } from "./types";

/** Dot/badge color per plan_status slug (chips carry the label beside it). */
export const PLAN_STATUS_COLORS: Record<string, string> = {
  idea: "bg-muted-foreground/40",
  planned: "bg-sky-500",
  briefed: "bg-blue-500",
  "in-production": "bg-amber-500",
  "in-review": "bg-orange-500",
  approved: "bg-emerald-500",
  published: "bg-green-600",
  "live-verified": "bg-teal-500",
  "needs-update": "bg-red-500",
  retired: "bg-zinc-500",
};

export const PLAN_STATUS_FALLBACK_COLOR = "bg-muted-foreground/30";

export function planStatusColor(slug: string | null | undefined): string {
  return (slug && PLAN_STATUS_COLORS[slug]) || PLAN_STATUS_FALLBACK_COLOR;
}

export const NODE_TYPE_LABELS: Record<PlanNodeType, string> = {
  home: "Home",
  pillar: "Pillar",
  cluster: "Cluster",
  article: "Article",
  index: "Index",
};

/** Pillar-map node sizing by priority (1 = highest). */
export const PRIORITY_SIZES: Record<number, number> = { 1: 44, 2: 36, 3: 30 };
