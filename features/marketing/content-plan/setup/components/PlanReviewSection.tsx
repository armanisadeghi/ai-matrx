"use client";

/**
 * SEMANTIC plan review — the counterpart to PlanLintSection.
 *
 * The lint checks STRUCTURE (orphans, bad slugs, duplicate labels) with pure
 * rules. This asks the Content Plan Reviewer agent the question no rule can:
 * "given what this business actually is, what is MISSING from the plan?" —
 * grounded in the site's linked research report.
 *
 * A `gap` finding that names a route AND a label is actionable: if its parent
 * is already planned, one click creates the page through the canonical plan
 * write path. A finding whose parent does not exist says so instead of
 * silently creating an orphan.
 */
import { useState } from "react";
import { ClipboardCheck, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { PlanNodeRow } from "../../types";
import type { PlanReviewFinding, PlanReviewResult, ReviewSeverity } from "../ai";
import { SetupSection } from "./SetupSection";

const SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  gap: "missing",
  mismatch: "mismatch",
  structure: "structure",
  priority: "priority",
};

const SEVERITY_CLASS: Record<ReviewSeverity, string> = {
  gap: "bg-primary/15 text-primary",
  mismatch: "bg-destructive/15 text-destructive",
  structure: "bg-warning/15 text-warning",
  priority: "bg-muted text-muted-foreground",
};

/** `/a/b/c` → `/a/b`; a top-level route's parent is the home node (`/`). */
export function parentRouteOf(route: string): string {
  const trimmed = route.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  if (cut <= 0) return "/";
  return trimmed.slice(0, cut);
}

export function slugOf(route: string): string {
  const trimmed = route.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

export function PlanReviewSection({
  nodes,
  review,
  busy,
  anyBusy,
  aiReady,
  error,
  onRun,
  onAddPage,
  addingRoute,
  addedRoutes,
}: {
  nodes: PlanNodeRow[];
  review: PlanReviewResult | null;
  busy: boolean;
  /** ANY agent run in flight — the runner allows only one at a time. */
  anyBusy: boolean;
  /** A research report is loaded — without one there is nothing to audit against. */
  aiReady: boolean;
  error: string | null;
  onRun: () => void;
  /** Create one suggested page (SetupView owns the write). */
  onAddPage: (finding: PlanReviewFinding) => void;
  addingRoute: string | null;
  /** Routes already created from this review — the button becomes a receipt. */
  addedRoutes: Set<string>;
}) {
  const [open, setOpen] = useState(true);
  const routes = new Set(
    nodes.map((node) => node.route).filter((route): route is string => Boolean(route)),
  );

  return (
    <SetupSection
      title="Plan review"
      action={
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-2 text-xs"
          disabled={!aiReady || anyBusy}
          title={
            aiReady
              ? "Audit this plan against the research report — what is missing, mismatched, or misprioritized."
              : "Pick a research topic with a finished report in the AI grounding bar first"
          }
          onClick={onRun}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ClipboardCheck className="h-3 w-3" />
          )}
          {review ? "Re-review" : "Review plan"}
        </Button>
      }
    >
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : busy ? (
        <p className="text-xs text-muted-foreground">
          Reading the research report against {nodes.length} planned page
          {nodes.length === 1 ? "" : "s"}…
        </p>
      ) : !review ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          The lint above checks structure. This asks what the plan is MISSING
          for this specific business — grounded in the research report.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-foreground">{review.summary}</p>
          {review.findings.length === 0 ? (
            <p className="text-xs text-success">
              No gaps found against the research report.
            </p>
          ) : (
            <>
              <button
                type="button"
                className="text-[11px] font-medium text-primary hover:underline"
                onClick={() => setOpen((current) => !current)}
              >
                {open ? "Hide" : "Show"} {review.findings.length} finding
                {review.findings.length === 1 ? "" : "s"}
              </button>
              {open ? (
                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {review.findings.map((finding, index) => (
                    <FindingRow
                      key={`${finding.title}-${index}`}
                      finding={finding}
                      parentPlanned={
                        finding.suggestedRoute
                          ? routes.has(parentRouteOf(finding.suggestedRoute))
                          : false
                      }
                      alreadyPlanned={
                        finding.suggestedRoute
                          ? routes.has(finding.suggestedRoute)
                          : false
                      }
                      added={
                        finding.suggestedRoute
                          ? addedRoutes.has(finding.suggestedRoute)
                          : false
                      }
                      adding={addingRoute === finding.suggestedRoute}
                      anyAdding={addingRoute !== null}
                      onAdd={() => onAddPage(finding)}
                    />
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      )}
    </SetupSection>
  );
}

function FindingRow({
  finding,
  parentPlanned,
  alreadyPlanned,
  added,
  adding,
  anyAdding,
  onAdd,
}: {
  finding: PlanReviewFinding;
  parentPlanned: boolean;
  alreadyPlanned: boolean;
  added: boolean;
  adding: boolean;
  anyAdding: boolean;
  onAdd: () => void;
}) {
  const canAdd =
    Boolean(finding.suggestedRoute) && parentPlanned && !alreadyPlanned && !added;
  return (
    <li className="bg-card px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none",
            SEVERITY_CLASS[finding.severity],
          )}
        >
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{finding.title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {finding.detail}
          </p>
          {finding.suggestedRoute ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {finding.suggestedRoute}
              </span>
              {added || alreadyPlanned ? (
                <span className="text-[11px] font-medium text-success">
                  {added ? "added" : "already planned"}
                </span>
              ) : !parentPlanned ? (
                <span className="text-[11px] text-muted-foreground">
                  {parentRouteOf(finding.suggestedRoute)} is not planned yet —
                  create that section first
                </span>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canAdd || anyAdding}
                  onClick={onAdd}
                >
                  {adding ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Add page
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
