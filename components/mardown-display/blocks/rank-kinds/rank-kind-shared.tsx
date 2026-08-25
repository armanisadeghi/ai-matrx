"use client";

/**
 * Shared visual primitives for the rank / SERP-landscape kind family
 * (Rank Kinds Run, Stage B).
 *
 * INVENTORY LAW (survey 2026-08-24): the platform had already built this data
 * twice — `features/marketing/components/ranks/` (the bespoke REST workspace,
 * 2,671 lines) and the search kind family's components. Nothing here
 * re-implements either:
 *
 *  - the "never expose raw provider names" rule is
 *    `trackingModeLabelForItem` from the ranks workspace, consumed verbatim
 *    (its signature was WIDENED, not copied, so partial kind values fit);
 *  - favicons / breadcrumbs / chips / section headings come from the search
 *    family's `search-kind-shared.tsx`, which is itself the convergence of the
 *    canonical `parseSearch.ts` helpers;
 *  - every nested search result renders through ITS canonical component via
 *    the delegation seam, never a second renderer.
 *
 * What genuinely did not exist before is here: the position badge, the
 * movement indicator, the "you are here" marker, and the rank-basis
 * disclosure.
 */

import React from "react";
import { ArrowDown, ArrowRight, ArrowUp, Crosshair, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A position on the page. `null` is NOT ranked / never observed — the whole
 * product is the difference between "we are not there" and "we never looked",
 * so an absent rank renders as an explicit em-dash chip, never as blank space.
 */
export const RankBadge: React.FC<{
  rank?: number | null;
  /** Small caption under the number ("organic", "on page"). */
  caption?: string;
  /** Highlight treatment — used for the tracked target's own position. */
  emphasis?: boolean;
  className?: string;
}> = ({ rank, caption, emphasis, className }) => (
  <div
    className={cn(
      "flex min-w-11 flex-col items-center justify-center rounded-md border px-2 py-1",
      emphasis
        ? "border-primary/50 bg-primary/10 text-primary"
        : "border-border bg-muted/40 text-foreground",
      className,
    )}
  >
    <span className="text-sm font-semibold leading-none tabular-nums">
      {typeof rank === "number" ? `#${rank}` : "—"}
    </span>
    {caption && (
      <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {caption}
      </span>
    )}
  </div>
);

/**
 * Positions gained since the previous reading. POSITIVE IS AN IMPROVEMENT
 * (the model says so), and a lower rank number is better — so a positive
 * movement gets the up arrow and the success colour, and 0 is "no change",
 * never a blank.
 */
export const MovementIndicator: React.FC<{
  movement?: number | null;
  className?: string;
}> = ({ movement, className }) => {
  if (typeof movement !== "number") return null;
  const Icon = movement > 0 ? ArrowUp : movement < 0 ? ArrowDown : ArrowRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        movement > 0
          ? "text-success"
          : movement < 0
            ? "text-destructive"
            : "text-muted-foreground",
        className,
      )}
      title={
        movement > 0
          ? `Up ${movement} since the previous reading`
          : movement < 0
            ? `Down ${Math.abs(movement)} since the previous reading`
            : "No change since the previous reading"
      }
    >
      <Icon className="h-3 w-3" />
      {movement === 0 ? "no change" : Math.abs(movement)}
    </span>
  );
};

/** The "you are here" marker — the entire reason a user opens a landscape. */
export const TrackedTargetMarker: React.FC<{ className?: string }> = ({
  className,
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground",
      className,
    )}
  >
    <Crosshair className="h-3 w-3" />
    Your site
  </span>
);

/** Human label for a `SERP_RESULT_TYPES` member (the adapter's vocabulary). */
const RESULT_TYPE_LABELS: Record<string, string> = {
  organic: "Organic",
  local_pack: "Map pack",
  ai_citation: "AI citation",
  ai_overview: "AI overview",
  entity_card: "Knowledge panel",
  faq: "People also ask",
  discussion: "Discussion",
  news: "News",
  video: "Video",
  unknown: "Unclassified",
};

export function resultTypeLabel(value?: string | null): string {
  if (!value) return "Unclassified";
  return RESULT_TYPE_LABELS[value] ?? value.replace(/_/g, " ");
}

/** Neutral outline chip for a block type / engine / device. */
export const RankChip: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ children, className, title }) => (
  <span
    title={title}
    className={cn(
      "inline-flex max-w-full items-center truncate rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground",
      className,
    )}
  >
    {children}
  </span>
);

/**
 * 🚨 THE RANK-BASIS DISCLOSURE. `absolute_rank` is either something the engine
 * REPORTED or something WE decided. A UI that shows a page order without
 * saying which one it is quietly implies Google published that order. It did
 * not, for Google: only Brave reports whole-page block order (`mixed.main`).
 * So the basis is stated in words, on the surface, always.
 */
export const RankBasisNote: React.FC<{
  basis?: string | null;
  blockOrder?: string[] | null;
  className?: string;
}> = ({ basis, blockOrder, className }) => {
  const engineReported = basis === "engine_reported";
  return (
    <div
      className={cn(
        "flex items-start gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>
        {engineReported ? (
          <>
            <span className="font-medium text-foreground">
              Page order reported by the engine.
            </span>{" "}
            The positions below are an observation — the engine returned the
            whole-page block order
            {blockOrder && blockOrder.length > 0 ? (
              <> ({blockOrder.join(" → ")})</>
            ) : null}
            .
          </>
        ) : (
          <>
            <span className="font-medium text-foreground">
              Page order is our convention, not the engine&apos;s.
            </span>{" "}
            This engine did not report where each block sat on the page, so we
            laid the blocks out ourselves. Treat the whole-page position as our
            reading of the page, not as something the engine published.
          </>
        )}
      </span>
    </div>
  );
};

/** Short ISO date, or the verbatim value when it is not parseable. */
export function shortDate(value?: string | null): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
