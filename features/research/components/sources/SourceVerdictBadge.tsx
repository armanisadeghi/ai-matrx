"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RecommendedUse, AnalysisStatus } from "../../types";

/**
 * The shared post-read VERDICT marker — the agent's bottom-line judgement on a
 * source after reading the page, distinct from the pre-read Authority score.
 *
 * Design (deliberately restrained, professional — never kindergarten):
 *  • The `final_source_score` LEADS as a clean tabular integer in the
 *    foreground. The verdict word and the small accent dot follow as DISTINCT,
 *    quiet qualifiers — score, label, and dot are never concatenated.
 *  • `cite_directly` earns the one quiet strong accent (muted emerald) — the
 *    standout. Everything else stays neutral/monochrome and lets the score lead.
 *  • A real `reject` (or an invalid/inaccessible/error status) is DE-EMPHASIZED:
 *    dimmed, the label struck through, and the ONLY coloured hue in the whole
 *    component — a single muted rose dot. No bright pills, no alarm red anywhere.
 *  • Legible in light + dark purely through theme tokens + low-opacity accents.
 *
 * Renders nothing for an un-analyzed source unless `showUnanalyzed` is set (then
 * a muted "Not analyzed" qualifier), so it drops cleanly into existing tables.
 */

type Verdict = "cite" | "neutral" | "reject";

interface VerdictPresentation {
  /** The short verdict word shown next to the score. */
  label: string;
  /** Tailwind classes for the small leading dot. */
  dotClass: string;
  /** Whether to dim + strike the row (a rejection). */
  deemphasized: boolean;
}

/** Statuses that mean the source is unusable regardless of any score. */
const REJECT_STATUSES = new Set<AnalysisStatus>([
  "invalid",
  "inaccessible",
  "irrelevant",
  "error",
  "duplicate",
]);

/** Map the raw recommended_use to its short, human verdict label. */
const USE_LABEL: Record<RecommendedUse, string> = {
  cite_directly: "Cite",
  use_as_background: "Background",
  use_for_leads_only: "Leads only",
  compare_against_other_sources: "Compare",
  reject: "Reject",
};

/** Longer sentence for the hover tooltip — explains what the verdict means. */
const USE_EXPLANATION: Record<RecommendedUse, string> = {
  cite_directly: "Strong enough to cite directly in the final output.",
  use_as_background: "Useful as background context, not a primary citation.",
  use_for_leads_only: "Mine it for leads to better sources; don't cite it.",
  compare_against_other_sources:
    "Cross-check its claims against other sources before relying on it.",
  reject: "Not worth using — excluded from the synthesis.",
};

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  valid: "Valid",
  invalid: "Invalid",
  inaccessible: "Inaccessible",
  irrelevant: "Off-topic",
  thin: "Thin",
  ad_heavy: "Ad-heavy",
  duplicate: "Duplicate",
  error: "Analysis error",
};

function normalizeUse(value: string | null): RecommendedUse | null {
  if (value == null) return null;
  return value in USE_LABEL ? (value as RecommendedUse) : null;
}
function normalizeStatus(value: string | null): AnalysisStatus | null {
  if (value == null) return null;
  return value in STATUS_LABEL ? (value as AnalysisStatus) : null;
}

/**
 * Resolve the three inputs into one verdict presentation. `recommended_use` is
 * the primary signal; the analysis status is a fail-closed override (an
 * inaccessible/invalid page is a rejection even if `recommended_use` is unset).
 */
function resolveVerdict(
  recommendedUse: string | null,
  analysisStatus: string | null,
): { kind: Verdict; presentation: VerdictPresentation } | null {
  const use = normalizeUse(recommendedUse);
  const status = normalizeStatus(analysisStatus);

  // Hard rejections: an explicit reject verdict OR a terminal bad status.
  if (use === "reject" || (status && REJECT_STATUSES.has(status))) {
    return {
      kind: "reject",
      presentation: {
        label: use === "reject" || !status ? "Reject" : STATUS_LABEL[status],
        // The ONLY coloured hue in the component — a single muted rose dot.
        dotClass: "bg-rose-500/50",
        deemphasized: true,
      },
    };
  }

  if (use === "cite_directly") {
    return {
      kind: "cite",
      presentation: {
        label: USE_LABEL.cite_directly,
        // The one quiet strong accent — a muted emerald, never a bright pill.
        dotClass: "bg-emerald-500/70",
        deemphasized: false,
      },
    };
  }

  if (use) {
    return {
      kind: "neutral",
      presentation: {
        label: USE_LABEL[use],
        dotClass: "bg-muted-foreground/55",
        deemphasized: false,
      },
    };
  }

  // No recommended_use, no rejecting status — but we may still have a
  // non-terminal status worth surfacing (e.g. "thin"). Treat as neutral.
  if (status) {
    return {
      kind: "neutral",
      presentation: {
        label: STATUS_LABEL[status],
        dotClass: "bg-muted-foreground/40",
        deemphasized: status === "thin" || status === "ad_heavy",
      },
    };
  }

  return null;
}

interface SourceVerdictBadgeProps {
  /** The fused final source score (0-100). Leads as the hero number. */
  finalScore: number | null;
  recommendedUse: string | null;
  analysisStatus: string | null;
  /** Render a muted "Not analyzed" qualifier instead of nothing. */
  showUnanalyzed?: boolean;
  /** Hide the numeric score, showing only the verdict word (tight layouts). */
  scoreHidden?: boolean;
  className?: string;
}

/**
 * Compact post-read verdict marker: `final_source_score` as a clean tabular
 * number leading, then the verdict word with a small accent dot, with the
 * agent's full reasoning on hover. See the file header for the design rules.
 */
export function SourceVerdictBadge({
  finalScore,
  recommendedUse,
  analysisStatus,
  showUnanalyzed,
  scoreHidden,
  className,
}: SourceVerdictBadgeProps) {
  const resolved = resolveVerdict(recommendedUse, analysisStatus);
  const hasScore = finalScore != null && Number.isFinite(finalScore);

  // Nothing to show — un-analyzed source.
  if (!resolved && !hasScore) {
    if (!showUnanalyzed) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60",
          className,
        )}
      >
        Not analyzed
      </span>
    );
  }

  const presentation = resolved?.presentation;
  const roundedScore = hasScore ? Math.round(finalScore as number) : null;
  const use = normalizeUse(recommendedUse);

  const badge = (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 whitespace-nowrap",
        presentation?.deemphasized && "opacity-55",
        className,
      )}
    >
      {!scoreHidden && roundedScore != null && (
        <span
          className={cn(
            "text-[13px] font-semibold leading-none tabular-nums text-foreground",
            presentation?.deemphasized && "line-through decoration-1",
          )}
        >
          {roundedScore}
        </span>
      )}
      {presentation && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
            presentation.deemphasized && "line-through decoration-1",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              presentation.dotClass,
            )}
          />
          {presentation.label}
        </span>
      )}
    </span>
  );

  // Build a tooltip explaining the verdict + score, when there's anything to say.
  const status = normalizeStatus(analysisStatus);
  const tooltipLines: string[] = [];
  if (use) tooltipLines.push(USE_EXPLANATION[use]);
  else if (status) tooltipLines.push(`Page analysis status: ${STATUS_LABEL[status]}.`);

  if (tooltipLines.length === 0 && roundedScore == null) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs font-semibold">
          {presentation?.label ?? "Source verdict"}
          {roundedScore != null && (
            <span className="font-normal text-muted-foreground">
              {" "}
              · final score {roundedScore}/100
            </span>
          )}
        </p>
        {tooltipLines.map((line, i) => (
          <p key={i} className="mt-0.5 text-xs text-muted-foreground">
            {line}
          </p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
