"use client";

/**
 * HindsightPage — the platform reads its own history and improves itself.
 *
 * Enroll an agent, workflow, tool, or environment; every N real runs a reviewer
 * agent reads the ACTUAL transcripts and proposes fixes across four levers,
 * with Replay evidence. This is the ONE home for the Hindsight admin surface.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getCosts, listEnrollments } from "../api";
import { EnrollDialog } from "./EnrollDialog";
import { EnrollmentDetailPanel } from "./EnrollmentDetailPanel";
import { fmtCost, KIND_COLOR, KIND_ICON } from "./tokens";

export function HindsightPage() {
  // Assist chips deep-link here: `?enrollment=<id>` (a finding to decide) and
  // `?enroll_tool=<name>` (the failing-tools detector proposing an enrollment).
  // A chip that lands on an unfiltered page is the dead end this replaces.
  const params = useSearchParams();
  const deepLinkedEnrollment = params.get("enrollment");
  const deepLinkedTool = params.get("enroll_tool");

  const [enrollOpen, setEnrollOpen] = useState(Boolean(deepLinkedTool));
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkedEnrollment);

  useEffect(() => {
    if (deepLinkedEnrollment) setSelectedId(deepLinkedEnrollment);
  }, [deepLinkedEnrollment]);

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
  const selected = selectedId ?? active[0]?.id ?? null;

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Hindsight</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            The platform reads its own history and improves itself. Enroll an
            agent, workflow, tool, or environment; every N real runs a reviewer
            agent reads the actual transcripts — never metrics alone — and
            proposes fixes across four levers: instructions, resources, tool
            design, and architecture.
          </p>
        </div>
        <Button onClick={() => setEnrollOpen(true)} data-testid="hindsight-enroll-open">
          <Plus className="mr-1 h-4 w-4" />
          Enroll
        </Button>
      </header>

      {costs.data && (
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
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
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
                onClick={() => setSelectedId(e.id)}
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

        <div>
          {selected ? (
            <EnrollmentDetailPanel
              enrollmentId={selected}
              onArchived={() => setSelectedId(null)}
            />
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Select an enrollment to see its reviews and findings.
            </Card>
          )}
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
