"use client";

/**
 * HindsightPage — the platform reads its own history and improves itself.
 *
 * Enroll an agent, workflow, one workflow step, tool, or environment; every N real runs a reviewer
 * agent reads the ACTUAL transcripts and proposes fixes across four levers,
 * with Replay evidence. This is the ONE home for the Hindsight admin surface.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getCosts, listEnrollments } from "../api";
import { ChangeHistoryPanel } from "./ChangeHistoryPanel";
import { EnrollDialog } from "./EnrollDialog";
import { EnrollmentDetailPanel } from "./EnrollmentDetailPanel";
import { FindingEffectivenessPanel } from "./FindingEffectivenessPanel";
import { selectEnrollmentId, type EnrollmentSelection } from "./select-enrollment";
import { fmtCost, KIND_COLOR, KIND_ICON } from "./tokens";

export function HindsightPage() {
  // Assist chips deep-link here: `?enrollment=<id>` (a finding to decide) and
  // `?enroll_tool=<name>` (the failing-tools detector proposing an enrollment).
  // A chip that lands on an unfiltered page is the dead end this replaces.
  const params = useSearchParams();
  const deepLinkedEnrollment = params.get("enrollment");
  const deepLinkedTool = params.get("enroll_tool");

  const [enrollOpen, setEnrollOpen] = useState(Boolean(deepLinkedTool));
  const [selection, setSelection] = useState<EnrollmentSelection | null>(null);

  const enrollments = useQuery({
    queryKey: ["hindsight", "enrollments"],
    queryFn: () => listEnrollments(),
  });

  const costs = useQuery({
    queryKey: ["hindsight", "costs"],
    queryFn: () => getCosts(),
  });

  const active = useMemo(
    () => (enrollments.data ?? []).filter((e) => e.status !== "archived"),
    [enrollments.data],
  );
  // A route transition can reuse this mounted page. The URL must win during
  // that very render; synchronizing it into state in an effect briefly fetched
  // the previously selected enrollment and turned an expected stale selection
  // into a queued 404.
  const selected = selectEnrollmentId(
    deepLinkedEnrollment,
    selection,
    active[0]?.id,
  );

  // Height model: the admin tree pins `--shell-header-h` to 2.5rem and cancels
  // `.shell-main`'s negative pull (styles/shell.css), so a page owns exactly
  // `100dvh - 2.5rem`. Locking that height on `lg` is what lets the two panes
  // scroll INDEPENDENTLY — the enrollment list must never ride the detail
  // pane's scroll. Below `lg` the grid collapses to one column and the page
  // returns to normal document scroll, because two nested scrollers stacked on
  // a phone is the worse failure.
  return (
    <div className="flex flex-col gap-4 p-4 lg:h-[calc(100dvh-2.5rem)] lg:overflow-hidden">
      {/*
        No page title and no description here on purpose: the route's own
        `metadata.title` already names this page in the tab and the shell
        chrome, and a dashboard surface never repeats it as an in-body h1
        (Arman, 2026-08-25). The toolbar carries spend + the one action.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {costs.data ? (
          <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 p-3 text-sm">
            <span className="text-xs uppercase text-muted-foreground">
              Platform-wide Hindsight spend
            </span>
            <span>
              <strong className="tabular-nums">{fmtCost(costs.data.total_cost)}</strong>{" "}
              total
            </span>
            <span className="text-muted-foreground">
              {fmtCost(costs.data.review_cost)} across {costs.data.review_count}{" "}
              review{costs.data.review_count === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground">
              {fmtCost(costs.data.replay_cost)} across {costs.data.replay_count}{" "}
              replay{costs.data.replay_count === 1 ? "" : "s"}
            </span>
          </Card>
        ) : (
          <span />
        )}
        <Button onClick={() => setEnrollOpen(true)} data-testid="hindsight-enroll-open">
          <Plus className="mr-1 h-4 w-4" />
          Enroll
        </Button>
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_1fr]">
        <div
          className="space-y-2 lg:min-h-0 lg:overflow-y-auto lg:pr-1"
          data-testid="hindsight-enrollment-list"
        >
          {enrollments.isLoading && <Skeleton className="h-32" />}
          {enrollments.isError && (
            <Card className="p-4 text-sm text-red-600 dark:text-red-400">
              Could not load enrollments: {(enrollments.error as Error).message}
            </Card>
          )}
          {active.map((e) => {
            const Icon = KIND_ICON[e.subject_kind];
            return (
              <button
                key={e.id}
                type="button"
                onClick={() =>
                  setSelection({ id: e.id, deepLinkAtClick: deepLinkedEnrollment })
                }
                data-testid="hindsight-enrollment-row"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/60",
                  selected === e.id && "border-primary bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    KIND_COLOR[e.subject_kind],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.display_name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    every {e.review_every_n} runs
                  </span>
                </span>
                {e.status !== "active" && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {e.status}
                  </Badge>
                )}
              </button>
            );
          })}
          {!enrollments.isLoading && active.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              Nothing enrolled yet. Enroll the thing you most wish worked better
              — the strongest reason is “we know it needs improvement and we have
              no idea how.”
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          {selected ? (
            <EnrollmentDetailPanel
              enrollmentId={selected}
              onArchived={() => setSelection(null)}
            />
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Select an enrollment to see its reviews and findings.
            </Card>
          )}

          {/*
            Internal Affairs (C-19). Not a separate system — a view of the SAME
            substrate: what the platform changed about itself, and whether that
            advice held up. It rides the DETAIL column's scroll (it used to sit
            below the whole grid): once the enrollment list owns its own
            scroller, a section outside both panes would be unreachable without
            re-coupling the two scrolls. It stays the cross-cutting read, below
            the per-enrollment panel.
          */}
          <section className="space-y-4">
            <FindingEffectivenessPanel />
            <ChangeHistoryPanel />
          </section>
        </div>
      </div>

      <EnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        initialToolName={deepLinkedTool}
      />
    </div>
  );
}
