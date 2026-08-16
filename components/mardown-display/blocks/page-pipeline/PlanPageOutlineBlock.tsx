"use client";

/**
 * PlanPageOutlineBlock — THE renderer for the `plan_page_outline` kind. There
 * is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * Need one piece elsewhere? Import the PART — `PlanOutlineDifferentiator`,
 * `PlanOutlineTerritory`, `PlanOutlineLinks`, `PlanOutlineGaps`.
 *
 * WHAT THE READER NEEDS FROM THIS, in their words rather than ours: "what is
 * this page for, and what am I NOT supposed to say here?" So the
 * differentiator leads, and the boundary (must-not-cover + the topics handed
 * to named siblings) is presented as one idea, because to a page owner it IS
 * one idea. The vocabulary is plain — "cannibalization" and "family placement"
 * never reach the screen.
 *
 * `uncovered_gaps` is a FINDING, not a footnote: a topic the plan wants and no
 * page owns. It renders as an alert, because the owner is the only one who can
 * decide which page should take it.
 *
 * Streaming-first: child-kind lists fill row by row and scalar lists appear
 * when they close; every empty state is a normal mid-stream state.
 *
 * Consumes the bridge serverData from
 * `features/content-ir/kinds/plan-page-outline.ts`.
 */

import type { ReactNode } from "react";
import {
  ArrowRightLeft,
  Compass,
  Link2,
  Loader2,
  Map as MapIcon,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import type {
  PlanDeferredTopicData,
  PlanPageOutlineData,
  PlanPlannedLinkData,
} from "@/features/content-ir/kinds/plan-page-outline";
import { cn } from "@/lib/utils";

export interface PlanPageOutlineBlockProps {
  serverData?: unknown;
  className?: string;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Defensive re-read — a stale/foreign serverData renders nothing. */
export function readPlanPageOutlineData(
  serverData: unknown,
): PlanPageOutlineData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<PlanPageOutlineData>;
  if (!Array.isArray(candidate.covers) && candidate.differentiator === undefined) {
    return null;
  }
  return {
    differentiator:
      typeof candidate.differentiator === "string"
        ? candidate.differentiator
        : null,
    covers: strings(candidate.covers),
    mustNotCover: strings(candidate.mustNotCover),
    deferTo: Array.isArray(candidate.deferTo) ? candidate.deferTo : [],
    internalLinks: Array.isArray(candidate.internalLinks)
      ? candidate.internalLinks
      : [],
    uncoveredGaps: strings(candidate.uncoveredGaps),
    isComplete: candidate.isComplete === true,
  };
}

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

function SectionShell({
  icon,
  title,
  hint,
  tone = "default",
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  tone?: "default" | "primary" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "animate-in fade-in rounded-lg border p-3",
        tone === "primary"
          ? "border-primary/30 bg-primary/5"
          : tone === "warning"
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wide",
            tone === "primary" ? "text-primary" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function PlainList({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-1.5 list-disc space-y-1 pl-4">
      {lines.map((line, index) => (
        <li
          key={`${index}-${line.slice(0, 24)}`}
          className="animate-in fade-in text-sm leading-relaxed text-foreground"
        >
          {line}
        </li>
      ))}
    </ul>
  );
}

/** Why this page exists at all. */
export function PlanOutlineDifferentiator({
  differentiator,
}: {
  differentiator: string | null;
}) {
  if (!differentiator) return null;
  return (
    <SectionShell
      icon={<Compass className="h-3.5 w-3.5 text-primary" />}
      title="What only this page does"
      tone="primary"
    >
      <p className="mt-1 text-sm leading-relaxed text-foreground">
        {differentiator}
      </p>
    </SectionShell>
  );
}

/**
 * The page's territory — what it owns, and the boundary. Must-not-cover and
 * the deferred topics are one idea to a page owner, so they render together.
 */
export function PlanOutlineTerritory({
  covers,
  mustNotCover,
  deferTo,
}: {
  covers: string[];
  mustNotCover: string[];
  deferTo: PlanDeferredTopicData[];
}) {
  const hasBoundary = mustNotCover.length > 0 || deferTo.length > 0;
  if (covers.length === 0 && !hasBoundary) return null;
  return (
    <>
      {covers.length > 0 ? (
        <SectionShell
          icon={<MapIcon className="h-3.5 w-3.5 text-muted-foreground" />}
          title="This page covers"
        >
          <PlainList lines={covers} />
        </SectionShell>
      ) : null}
      {hasBoundary ? (
        <SectionShell
          icon={<ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Leave to other pages"
          hint="Writing about these here competes with your own pages for the same readers."
        >
          {mustNotCover.length > 0 ? <PlainList lines={mustNotCover} /> : null}
          {deferTo.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {deferTo.map((entry, index) => (
                <li
                  key={`${index}-${entry.topic.slice(0, 24)}`}
                  className="animate-in fade-in flex flex-wrap items-baseline gap-1.5 text-sm leading-relaxed text-foreground"
                >
                  <ArrowRightLeft className="h-3 w-3 shrink-0 self-center text-muted-foreground" />
                  <span>{entry.topic}</span>
                  {entry.toRoute ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {entry.toRoute}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      no page owns this yet
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </SectionShell>
      ) : null}
    </>
  );
}

/** Links this page should carry. */
export function PlanOutlineLinks({ links }: { links: PlanPlannedLinkData[] }) {
  if (links.length === 0) return null;
  return (
    <SectionShell
      icon={<Link2 className="h-3.5 w-3.5 text-muted-foreground" />}
      title="Links to add"
    >
      <ul className="mt-1.5 space-y-1.5">
        {links.map((link, index) => (
          <li
            key={`${index}-${link.toRoute}`}
            className="animate-in fade-in text-sm leading-relaxed"
          >
            <span className="text-foreground">
              {link.anchorText || link.toRoute}
            </span>{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {link.toRoute}
            </span>
            {link.reason ? (
              <span className="block text-xs text-muted-foreground">
                {link.reason}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

/** Topics the plan wants that NO page owns — a finding, not a footnote. */
export function PlanOutlineGaps({ gaps }: { gaps: string[] }) {
  if (gaps.length === 0) return null;
  return (
    <SectionShell
      icon={
        <TriangleAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
      }
      title="Nothing covers these yet"
      hint="Your plan wants these subjects, but no page has claimed them. Decide which page should."
      tone="warning"
    >
      <PlainList lines={gaps} />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// The parent
// ---------------------------------------------------------------------------

export default function PlanPageOutlineBlock({
  serverData,
  className,
}: PlanPageOutlineBlockProps) {
  const data = readPlanPageOutlineData(serverData);
  if (!data) return null;

  return (
    <div className={cn("my-2 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <MapIcon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Where this page sits
        </span>
        {data.uncoveredGaps.length > 0 && (
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-400">
            {data.uncoveredGaps.length} uncovered
          </span>
        )}
        {!data.isComplete && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Working it out
          </span>
        )}
      </div>

      <PlanOutlineDifferentiator differentiator={data.differentiator} />
      <PlanOutlineTerritory
        covers={data.covers}
        mustNotCover={data.mustNotCover}
        deferTo={data.deferTo}
      />
      <PlanOutlineLinks links={data.internalLinks} />
      <PlanOutlineGaps gaps={data.uncoveredGaps} />
    </div>
  );
}
