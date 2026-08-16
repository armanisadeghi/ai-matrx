"use client";

/**
 * PlanPageReviewBlock — THE renderer for the `plan_page_review` kind. There is
 * no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * The revised draft nested in this shape IS a `plan_page_draft`, so it renders
 * through that kind's own exported parts (`PlanDraftBody`) — never a second
 * draft renderer built here because "it's just the revised copy". If a surface
 * needs only the findings, import `PlanReviewIssues` below.
 *
 * WHY THIS COMPONENT MATTERS MOST: this pass has caught fabricated facts in
 * production. It is the reason a non-technical owner can trust what the
 * factory wrote about their own field. So the findings lead, in plain
 * language, worst first, each one saying what is wrong and what to do about
 * it — never a JSON array, never a severity code the reader must decode, never
 * collapsed behind a count.
 *
 * The verdict is stated as an outcome a person can act on ("the reviewer
 * rewrote this page"), not as an enum value.
 *
 * Streaming-first: issues appear one at a time as they parse (`issues` is a
 * child-kind array), and a review that has not yet flagged anything is a
 * normal mid-stream state.
 *
 * Consumes the bridge serverData from
 * `features/content-ir/kinds/plan-page-review.ts`.
 */

import { CheckCircle2, ClipboardCheck, Loader2, PenLine } from "lucide-react";

import type {
  PlanPageReviewData,
  PlanReviewIssueData,
  ReviewSeverity,
} from "@/features/content-ir/kinds/plan-page-review";
import { readPlanPageDraftValue } from "@/features/content-ir/kinds/plan-page-draft";
import { cn } from "@/lib/utils";

import { PlanDraftBody } from "./PlanPageDraftBlock";

export interface PlanPageReviewBlockProps {
  serverData?: unknown;
  className?: string;
}

/** Plain language, because the reader is not an editor by trade. */
const SEVERITY_COPY: Record<
  ReviewSeverity,
  { label: string; hint: string; className: string; dot: string }
> = {
  blocker: {
    label: "Must fix",
    hint: "Do not publish the page with this in it.",
    className:
      "border-destructive/40 bg-destructive/5 text-destructive dark:text-red-400",
    dot: "bg-destructive",
  },
  important: {
    label: "Worth fixing",
    hint: "The page is weaker with this left alone.",
    className:
      "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  minor: {
    label: "Minor",
    hint: "A small improvement.",
    className: "border-border bg-muted/40 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

/**
 * The bridge already produced this shape; this re-read is the same defensive
 * boundary every kind block keeps.
 */
export function readPlanPageReviewData(
  serverData: unknown,
): PlanPageReviewData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<PlanPageReviewData>;
  if (!Array.isArray(candidate.issues)) return null;
  const verdict = candidate.verdict;
  return {
    verdict: verdict === "approved" || verdict === "revised" ? verdict : null,
    issues: candidate.issues,
    revised: candidate.revised ?? readPlanPageDraftValue(null),
    hasRevised: candidate.hasRevised === true,
    isComplete: candidate.isComplete === true,
  };
}

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

function ReviewIssue({ issue }: { issue: PlanReviewIssueData }) {
  const copy = SEVERITY_COPY[issue.severity];
  return (
    <li
      className={cn(
        "animate-in fade-in rounded-md border p-2.5",
        copy.className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", copy.dot)} />
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {copy.label}
        </span>
        {issue.section ? (
          <span className="text-[11px] text-muted-foreground">
            in “{issue.section}”
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            the whole page
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-foreground">
        {issue.problem}
      </p>
      {issue.fix ? (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">What to do: </span>
          {issue.fix}
        </p>
      ) : null}
    </li>
  );
}

/**
 * The findings — the most valuable thing this pipeline produces. Importable on
 * its own so a surface can show what the review caught without re-rendering
 * the revised page beneath it.
 */
export function PlanReviewIssues({
  issues,
  isComplete = true,
}: {
  issues: PlanReviewIssueData[];
  isComplete?: boolean;
}) {
  if (issues.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border bg-card p-2.5">
        {isComplete ? (
          <>
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed text-foreground">
              The review found nothing to flag on this page.
            </p>
          </>
        ) : (
          <>
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Reading the page…
            </p>
          </>
        )}
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {issues.map((issue, index) => (
        <ReviewIssue
          key={`${index}-${issue.problem.slice(0, 32)}`}
          issue={issue}
        />
      ))}
    </ul>
  );
}

/** The outcome, said the way a person would say it. */
export function PlanReviewVerdict({
  verdict,
}: {
  verdict: "approved" | "revised" | null;
}) {
  if (!verdict) return null;
  const approved = verdict === "approved";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-2.5",
        approved
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-muted/40",
      )}
    >
      {approved ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      ) : (
        <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <p className="text-sm leading-relaxed text-foreground">
        {approved
          ? "The page passed the review — it stands as written."
          : "The reviewer rewrote this page. The version below is the improved one."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The parent — composes the parts, and the DRAFT's parts for `revised`.
// ---------------------------------------------------------------------------

export default function PlanPageReviewBlock({
  serverData,
  className,
}: PlanPageReviewBlockProps) {
  const data = readPlanPageReviewData(serverData);
  if (!data) return null;

  const blockers = data.issues.filter(
    (issue) => issue.severity === "blocker",
  ).length;

  return (
    <div className={cn("my-2 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Page review
        </span>
        {data.issues.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {data.issues.length} found
          </span>
        )}
        {blockers > 0 && (
          <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-destructive">
            {blockers} must fix
          </span>
        )}
        {!data.isComplete && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reviewing
          </span>
        )}
      </div>

      <PlanReviewVerdict verdict={data.verdict} />
      <PlanReviewIssues issues={data.issues} isComplete={data.isComplete} />

      {data.hasRevised ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {data.verdict === "approved"
              ? "The page, as approved"
              : "The page, after the rewrite"}
          </p>
          {/* THE canonical draft parts — never a second draft renderer. */}
          <PlanDraftBody data={data.revised} />
        </div>
      ) : null}
    </div>
  );
}
