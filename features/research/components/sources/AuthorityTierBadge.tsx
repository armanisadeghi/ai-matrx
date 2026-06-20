"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Tier = "high" | "medium" | "low";

/** Restrained, professional treatment — the SCORE is the hero (clean tabular
 *  number in foreground), the tier is a quiet uppercase qualifier with at most a
 *  small muted dot. No bright green/amber/rose pills: quality is never coloured
 *  with alarm hues, so `high` gets a muted emerald accent and `medium`/`low`
 *  stay monochrome (neutral, then dimmer). Legible in light + dark via tokens. */
const TIER_CONFIG: Record<
  Tier,
  { label: string; dotClass: string }
> = {
  high: { label: "High", dotClass: "bg-emerald-500/70" },
  medium: { label: "Medium", dotClass: "bg-muted-foreground/60" },
  low: { label: "Low", dotClass: "bg-muted-foreground/35" },
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
 * Compact per-source authoritativeness chip — the 0-100 score leads as a clean
 * tabular number, the tier follows as a muted qualifier with a small accent dot,
 * and the agent's reasoning is on hover. Renders nothing for un-ranked sources
 * unless `showUnranked` is set.
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
          "inline-flex items-center text-[10px] font-medium uppercase tracking-wide whitespace-nowrap text-muted-foreground/70",
          className,
        )}
      >
        Unranked
      </span>
    );
  }

  const cfg = TIER_CONFIG[t];
  const roundedScore = Math.round(score);
  const badge = (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 whitespace-nowrap",
        className,
      )}
    >
      {!scoreHidden && (
        <span className="text-[13px] font-semibold leading-none tabular-nums text-foreground">
          {roundedScore}
        </span>
      )}
      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cfg.dotClass)} />
        {cfg.label}
      </span>
    </span>
  );

  if (!reasoning) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs font-semibold">
          Authority: {cfg.label} ({roundedScore}/100)
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{reasoning}</p>
      </TooltipContent>
    </Tooltip>
  );
}
