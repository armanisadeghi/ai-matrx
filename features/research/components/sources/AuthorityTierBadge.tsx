"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Tier = "high" | "medium" | "low";

/** Tier colours follow the research badge convention (StatusBadge / OriginBadge):
 *  soft tint + tinted text + a leading dot. high → green, medium → amber, low → rose. */
const TIER_CONFIG: Record<
  Tier,
  { label: string; bgClass: string; textClass: string; dot: string }
> = {
  high: {
    label: "High",
    bgClass: "bg-green-100/70 dark:bg-green-900/25",
    textClass: "text-green-700 dark:text-green-400",
    dot: "#22c55e",
  },
  medium: {
    label: "Medium",
    bgClass: "bg-amber-100/70 dark:bg-amber-900/25",
    textClass: "text-amber-700 dark:text-amber-400",
    dot: "#f59e0b",
  },
  low: {
    label: "Low",
    bgClass: "bg-rose-100/70 dark:bg-rose-900/25",
    textClass: "text-rose-700 dark:text-rose-400",
    dot: "#f43f5e",
  },
};

function normalizeTier(tier: string | null, score: number | null): Tier | null {
  const t = (tier ?? "").toLowerCase();
  if (t === "high" || t === "medium" || t === "low") return t;
  if (score == null) return null;
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

interface AuthorityTierBadgeProps {
  score: number | null;
  tier: string | null;
  reasoning?: string | null;
  /** Render a muted "Unranked" chip when not yet ranked instead of nothing. */
  showUnranked?: boolean;
  /** Show only the tier label, hiding the numeric score (tight layouts). */
  scoreHidden?: boolean;
  className?: string;
}

/**
 * Compact per-source authoritativeness chip — tier + 0-100 score, coloured by
 * tier, with the agent's reasoning on hover. Renders nothing for un-ranked
 * sources unless `showUnranked` is set.
 */
export function AuthorityTierBadge({
  score,
  tier,
  reasoning,
  showUnranked,
  scoreHidden,
  className,
}: AuthorityTierBadgeProps) {
  const t = normalizeTier(tier, score);

  if (t == null || score == null) {
    if (!showUnranked) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium whitespace-nowrap bg-muted/50 text-muted-foreground",
          className,
        )}
      >
        Unranked
      </span>
    );
  }

  const cfg = TIER_CONFIG[t];
  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold whitespace-nowrap tabular-nums",
        cfg.bgClass,
        cfg.textClass,
        className,
      )}
    >
      <span
        className="h-1 w-1 rounded-full"
        style={{ backgroundColor: cfg.dot }}
      />
      {scoreHidden ? cfg.label : `${cfg.label} · ${score}`}
    </span>
  );

  if (!reasoning) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs font-semibold">
          Authority: {cfg.label} ({score}/100)
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{reasoning}</p>
      </TooltipContent>
    </Tooltip>
  );
}
