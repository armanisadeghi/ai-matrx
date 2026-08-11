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
import { ClipboardCheck, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { PlanNodeRow } from "../../types";
import { slugify } from "../archetypes";
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

/**
 * Normalize an agent-suggested route to the shape the DB actually stores.
 *
 * The slug CHECK is `^[a-z0-9]+(-[a-z0-9]+)*$`, so a perfectly sensible
 * suggestion (`/services/Hard_Drive_Shredding`) is rejected outright unless
 * every segment is slugified — which is what every OTHER write path in this
 * feature already does (`expandArchetype` slugifies family child labels).
 * Normalizing here also makes the "already planned" / "parent planned"
 * comparisons meaningful: they compare against DB-computed routes.
 */
export function normalizeRoute(route: string): string {
  const segments = route
    .split("/")
    .map((segment) => slugify(segment.trim()))
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

/** `/a/b/c` → `/a/b`; a top-level route's parent route is `/` (the home page). */
export function parentRouteOf(route: string): string {
  const trimmed = normalizeRoute(route);
  const cut = trimmed.lastIndexOf("/");
  if (cut <= 0) return "/";
  return trimmed.slice(0, cut);
}

export function slugOf(route: string): string {
  const trimmed = normalizeRoute(route);
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/**
 * Can this suggestion be created right now?
 *
 * A TOP-LEVEL page is always addable: `plan.node` allows `parent_id NULL`
 * (18 such nodes live), and a plan with a home node parents top-level pages
 * under it — both shapes exist, so "/" simply means "no section needed".
 * A nested page needs its section to exist first.
 */
export function canAddRoute(route: string, plannedRoutes: Set<string>): boolean {
  const parent = parentRouteOf(route);
  return parent === "/" || plannedRoutes.has(parent);
}

export function PlanReviewSection({
  nodes,
  review,
  busy,
  anyBusy,
  aiReady,
  error,
  onDismissError,
  onRun,
  onDismiss,
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
  onDismissError?: () => void;
  onRun: () => void;
  /** Throw the staged review away — it is persisted, so this is the only exit. */
  onDismiss: () => void;
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
        <div className="flex items-center gap-1">
          {review && !busy ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              title="Discard this review — it is saved with your setup until you do."
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          ) : null}
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
        </div>
      }
    >
      {/* The error sits ABOVE the findings, never INSTEAD of them: one failed
        "Add page" must not throw away a review the user paid an agent run
        for — the remaining findings stay actionable. */}
      {error ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-destructive">
            {error}
          </p>
          {onDismissError ? (
            <button
              type="button"
              aria-label="Dismiss the review error"
              className="shrink-0 text-destructive/70 hover:text-destructive"
              onClick={onDismissError}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}
      {busy ? (
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
                          ? canAddRoute(finding.suggestedRoute, routes)
                          : false
                      }
                      alreadyPlanned={
                        finding.suggestedRoute
                          ? routes.has(normalizeRoute(finding.suggestedRoute))
                          : false
                      }
                      added={
                        finding.suggestedRoute
                          ? addedRoutes.has(normalizeRoute(finding.suggestedRoute))
                          : false
                      }
                      adding={
                        finding.suggestedRoute !== null &&
                        addingRoute === normalizeRoute(finding.suggestedRoute)
                      }
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
                {normalizeRoute(finding.suggestedRoute)}
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
