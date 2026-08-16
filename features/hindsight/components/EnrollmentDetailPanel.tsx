"use client";

/**
 * EnrollmentDetailPanel — one enrolled subject: what it is (with a door to it),
 * what Hindsight has SPENT on it, how close it is to its next review, its
 * findings, and its review history.
 */
import { useQuery } from "@tanstack/react-query";
import { Archive, Eye, Pause, Play, RefreshCw } from "lucide-react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";

import { getEnrollment } from "../api";
import { useEnrollmentActions } from "../hooks/useEnrollmentActions";
import { subjectDoor } from "../subject-doors";
import { DoorLink } from "./DoorLink";
import { useDoorAudience } from "./door-audience";
import { FindingCard } from "./FindingCard";
import { ReviewProgress } from "./ReviewProgress";
import { ReviewRow } from "./ReviewRow";
import { fmtCost, fmtDate, KIND_COLOR, KIND_ICON, KIND_LABEL } from "./tokens";

export function EnrollmentDetailPanel({
  enrollmentId,
  onArchived,
}: {
  enrollmentId: string;
  onArchived: () => void;
}) {
  const audience = useDoorAudience();
  const { runReview, toggleStatus, archive, invalidate, reviewStartedAt } =
    useEnrollmentActions(enrollmentId, { onArchived });

  const detail = useQuery({
    queryKey: ["hindsight", "enrollment", enrollmentId],
    queryFn: () => getEnrollment(enrollmentId),
  });

  const enrollment = detail.data?.enrollment;

  // Tool subjects are stored by NAME; resolve the id so the tool still opens.
  const toolId = useQuery({
    queryKey: ["hindsight", "tool-id", enrollment?.subject_ref],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema("tool")
        .from("definition")
        .select("id")
        .eq("name", enrollment?.subject_ref ?? "")
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.id ?? null;
    },
    enabled: enrollment?.subject_kind === "tool" && Boolean(enrollment?.subject_ref),
  });

  if (detail.isLoading) return <Skeleton className="h-64" />;
  if (detail.isError) {
    return (
      <Card className="p-4 text-sm text-red-600 dark:text-red-400">
        Could not load this enrollment: {(detail.error as Error).message}
      </Card>
    );
  }
  const data = detail.data;
  if (!data || !enrollment) return null;

  const Icon = KIND_ICON[enrollment.subject_kind];
  const door = subjectDoor(enrollment, toolId.data, audience);
  const spend = data.spend;
  const untilNext = Math.max(
    0,
    enrollment.review_every_n - (data.pending_examples ?? 0),
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md",
                  KIND_COLOR[enrollment.subject_kind],
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <h2 className="truncate text-lg font-semibold">
                {enrollment.display_name}
              </h2>
              <Badge variant="outline">{KIND_LABEL[enrollment.subject_kind]}</Badge>
              <Badge
                variant={enrollment.status === "active" ? "secondary" : "outline"}
              >
                {enrollment.status}
              </Badge>
              {door && <DoorLink door={door} />}
            </div>
            {enrollment.subject_kind === "environment" && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {Object.entries(enrollment.subject_selector ?? {}).map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {k}={v}
                  </span>
                ))}
              </div>
            )}
            {enrollment.goal && (
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                {enrollment.goal}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="sm"
              disabled={runReview.isPending}
              onClick={() => runReview.mutate()}
              data-testid="hindsight-review-now"
            >
              {runReview.isPending ? (
                <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="mr-1 h-3.5 w-3.5" />
              )}
              {runReview.isPending ? "Reviewing…" : "Review now"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={toggleStatus.isPending}
              title={enrollment.status === "active" ? "Pause reviews" : "Resume reviews"}
              onClick={() =>
                toggleStatus.mutate(
                  enrollment.status === "active" ? "paused" : "active",
                )
              }
            >
              {enrollment.status === "active" ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              title="Archive this enrollment"
              disabled={archive.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: `Archive “${enrollment.display_name}”?`,
                  description: "Reviews stop; existing findings stay.",
                  confirmLabel: "Archive",
                  variant: "destructive",
                });
                if (ok) archive.mutate();
              }}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {runReview.isPending && (
          <ReviewProgress
            startedAt={reviewStartedAt}
            examples={Math.min(
              enrollment.max_examples_per_review,
              data.pending_examples ?? 0,
            )}
          />
        )}

        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground">
              Hindsight spend
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtCost(spend.total_cost)}
            </div>
            <div className="text-xs text-muted-foreground">total, all time</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Reviewing</div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtCost(spend.review_cost)}
            </div>
            <div className="text-xs text-muted-foreground">
              {spend.review_count} review{spend.review_count === 1 ? "" : "s"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Replaying</div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtCost(spend.replay_cost)}
            </div>
            <div className="text-xs text-muted-foreground">
              {spend.replay_count} replay{spend.replay_count === 1 ? "" : "s"}
              {(spend.replay_failed_count ?? 0) > 0 &&
                ` · ${spend.replay_failed_count} never ran`}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Per review</div>
            <div className="text-lg font-semibold tabular-nums">
              {spend.review_count
                ? fmtCost((spend.review_cost ?? 0) / spend.review_count)
                : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              average of {spend.review_count || 0}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>
            <strong className="text-foreground">{data.pending_examples ?? 0}</strong>{" "}
            new example{data.pending_examples === 1 ? "" : "s"} waiting
          </span>
          <span>
            next review in{" "}
            <strong className="text-foreground">{untilNext}</strong> more
          </span>
          <span>
            reviews every{" "}
            <strong className="text-foreground">{enrollment.review_every_n}</strong>
          </span>
          <span>
            reads up to{" "}
            <strong className="text-foreground">
              {enrollment.max_examples_per_review}
            </strong>{" "}
            per review
          </span>
          {/* The lens is a setting the reviewer's whole verdict depends on —
              invisible after enrollment, a reader can't tell why a review only
              looked at 10 runs or never mentioned a tool call. */}
          <span>
            reads{" "}
            <strong className="text-foreground">
              {enrollment.window_mode === "last_n_runs"
                ? `the last ${enrollment.window_n} runs`
                : "everything new"}
            </strong>
          </span>
          {enrollment.lens_visibility === "unit_only" && (
            <span>
              <strong className="text-foreground">inputs and outputs only</strong>{" "}
              (machinery hidden)
            </span>
          )}
          <span>last review {fmtDate(enrollment.last_review_at)}</span>
        </div>
      </Card>

      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Findings ({data.findings?.length ?? 0})
        </h3>
        {(data.findings?.length ?? 0) === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            No findings yet — run a review once enough real examples exist.
          </Card>
        ) : (
          <div className="space-y-2">
            {(data.findings ?? []).map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                agentId={
                  enrollment?.subject_kind === "agent"
                    ? enrollment.subject_id ?? undefined
                    : undefined
                }
                onChanged={invalidate}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Reviews ({data.reviews?.length ?? 0})
        </h3>
        {(data.reviews?.length ?? 0) === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            No reviews yet.
          </Card>
        ) : (
          <div className="space-y-2">
            {(data.reviews ?? []).map((r) => (
              <ReviewRow key={r.id} review={r} onChanged={invalidate} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
