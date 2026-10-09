"use client";

/**
 * THE outlier badge (UI-SPEC §1.1) — multiplier + tier + no-baseline state.
 * Every surface (post card, tables, drawer, board tiles) renders THIS; the
 * thresholds and text live in `../outlier.ts`. Tier is carried by the fill AND
 * by a leading bar glyph (one/two/three) so it is never color-only. Built on the
 * design-system Badge (icon child + text), so the pill guard sees a hugging label. Fixed 18px height.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { explainOutlier, formatMultiplierLong, outlierBadgeModel, outlierMetricWord, type OutlierBadgeModel, type OutlierTier } from "../outlier";
import type { OutlierInput } from "../types";

type BadgeVariant = "default" | "neutral" | "outline";

/** Tier -> the design-system Badge variant (+ a colour-only override for the filled "strong" tier). */
const TIER_VARIANT: Record<OutlierTier, BadgeVariant> = {
  none: "outline",
  plain: "outline",
  neutral: "neutral",
  accent: "default",
  strong: "default",
};

const TIER_CLASS: Record<OutlierTier, string> = {
  none: "border-transparent text-muted-foreground",
  plain: "border-transparent text-muted-foreground",
  neutral: "text-foreground",
  accent: "",
  strong: "bg-primary text-primary-foreground font-bold",
};

/** The tier glyph: an icon child of the Badge (the sanctioned icon + text shape), so the guard counts it as ink. */
function Bars({ count }: { count: 1 | 2 | 3 }) {
  return (
    <svg aria-hidden width="8" height="11" viewBox="0 0 8 11" fill="currentColor" className="shrink-0">
      {[1, 2, 3].map((n) => {
        const h = 3 + n * 2;
        return <rect key={n} x={(n - 1) * 3} y={11 - h} width="2" height={h} rx="0.5" opacity={n <= count ? 1 : 0.25} />;
      })}
    </svg>
  );
}

export interface OutlierBadgeProps {
  /** The stat inputs; or pass a precomputed `model`. */
  input?: OutlierInput;
  model?: OutlierBadgeModel;
  className?: string;
  /** Post panel: `2.4× usual views`, tooltip gives the percentile and median in words. */
  verbose?: boolean;
  /** Tables: a state with no multiple reads `—` (its reason in the tooltip) instead of a badge. Cards keep the badge. */
  inTable?: boolean;
}

export function OutlierBadge({ input, model, className, verbose, inTable }: OutlierBadgeProps) {
  const base = model ?? (input ? outlierBadgeModel(input) : null);
  if (!base) return null;
  if (inTable && (base.tier === "none")) {
    return (
      <span className="text-muted-foreground" title={base.tooltip}>
        —
      </span>
    );
  }
  let m = base;
  if (verbose && input && input.score !== null && Number.isFinite(input.score)) {
    const words = explainOutlier(input);
    m = {
      ...base,
      text: `${base.tilde ? "~" : ""}${formatMultiplierLong(input.score, outlierMetricWord(input.metric))}`,
      tooltip: [base.tilde ? base.tooltip : "", words].filter(Boolean).join(" ") || base.tooltip,
    };
  }
  return (
    <Badge
      variant={TIER_VARIANT[m.tier]}
      title={m.tooltip}
      data-outlier-tier={m.tier}
      className={cn("h-[18px] shrink-0 px-1.5 py-0 leading-none tabular-nums", TIER_CLASS[m.tier], className)}
    >
      {m.bars === 1 || m.bars === 2 || m.bars === 3 ? <Bars count={m.bars} /> : null}
      {m.text}
    </Badge>
  );
}
