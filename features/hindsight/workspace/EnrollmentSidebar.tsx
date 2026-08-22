"use client";

/**
 * EnrollmentSidebar — the LEFT rail of the improvement workspace: the state of
 * continuous review for this agent (how close the next review is, what it has
 * cost), the controls (review now, pause/resume, focus, archive), and the
 * review timeline. Selecting a review opens its conversation in the center.
 */
import { useState } from "react";
import {
  Archive,
  Check,
  Eye,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  X,
} from "lucide-react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { useEnrollmentActions } from "../hooks/useEnrollmentActions";
import type { EnrollmentDetail, Review } from "../types";
import { PendingExamplesPanel } from "../components/PendingExamplesPanel";
import { ReviewProgress } from "../components/ReviewProgress";
import { fmtCost, fmtDate } from "../components/tokens";

function ReviewTimelineRow({
  review,
  active,
  findingsCount,
  onSelect,
}: {
  review: Review;
  active: boolean;
  findingsCount: number;
  onSelect: () => void;
}) {
  const completed = review.status === "completed";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
        active
          ? "border-primary/50 bg-primary/5"
          : "border-border hover:bg-muted/50",
      )}
      data-testid="hindsight-review-select"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            completed ? "bg-emerald-500" : "bg-red-500",
          )}
        />
        <span className="text-xs font-medium">
          {fmtDate(review.created_at)}
        </span>
        {!completed && (
          <Badge variant="destructive" className="ml-auto text-[10px]">
            {review.status}
          </Badge>
        )}
      </div>
      <div className="mt-0.5 pl-3.5 text-[11px] text-muted-foreground">
        read {review.example_count}{" "}
        {review.example_count === 1 ? "run" : "runs"}
        {findingsCount > 0 &&
          ` · ${findingsCount} proposal${findingsCount === 1 ? "" : "s"}`}
        {review.total_cost != null && ` · ${fmtCost(review.total_cost)}`}
      </div>
    </button>
  );
}

export function EnrollmentSidebar({
  detail,
  actions,
  activeReviewId,
  onSelectReview,
}: {
  detail: EnrollmentDetail;
  actions: ReturnType<typeof useEnrollmentActions>;
  activeReviewId: string | null;
  onSelectReview: (id: string) => void;
}) {
  const enrollment = detail.enrollment;
  const { runReview, toggleStatus, updateGoal, archive, reviewStartedAt } =
    actions;

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const pending = detail.pending_examples ?? 0;
  const needed = enrollment.review_every_n;
  const progress = Math.min(1, needed > 0 ? pending / needed : 0);
  const paused = enrollment.status !== "active";

  const findingsByReview = new Map<string, number>();
  for (const f of detail.findings ?? []) {
    findingsByReview.set(
      f.review_id,
      (findingsByReview.get(f.review_id) ?? 0) + 1,
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-border p-3">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="flex-1"
            disabled={runReview.isPending}
            onClick={() => runReview.mutate(undefined)}
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
            title={paused ? "Resume reviews" : "Pause reviews"}
            onClick={() => toggleStatus.mutate(paused ? "active" : "paused")}
          >
            {paused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            title="Stop reviewing this agent"
            disabled={archive.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: `Stop reviewing “${enrollment.display_name}”?`,
                description: "Reviews stop; existing proposals stay.",
                confirmLabel: "Stop",
                variant: "destructive",
              });
              if (ok) archive.mutate();
            }}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>

        {paused && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            Reviews are paused — new runs still count, but nothing is reviewed
            until you resume.
          </div>
        )}

        {runReview.isPending && (
          <ReviewProgress
            startedAt={reviewStartedAt}
            examples={Math.min(enrollment.max_examples_per_review, pending)}
          />
        )}

        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium">Next review</span>
            <span className="text-muted-foreground">
              {pending} of {needed} new runs
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {pending >= needed
              ? "Enough new runs — the next automatic pass reviews them."
              : `Reviews happen automatically after ${needed} new real runs, or run one now.`}
          </p>
        </div>

        <PendingExamplesPanel
          enrollmentId={enrollment.id}
          audience="product"
          reviewRunning={runReview.isPending}
          onReviewExample={(id) => runReview.mutate([id])}
        />

        <div className="text-[11px] text-muted-foreground">
          Spent {fmtCost(detail.spend.total_cost)} across{" "}
          {detail.spend.review_count}{" "}
          {detail.spend.review_count === 1 ? "review" : "reviews"} · last review{" "}
          {fmtDate(enrollment.last_review_at)}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Reviewer focus</span>
            {!editingGoal && (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                title="Change what the reviewer focuses on"
                onClick={() => {
                  setGoalDraft(enrollment.goal ?? "");
                  setEditingGoal(true);
                }}
                data-testid="hindsight-edit-goal"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {editingGoal ? (
            <div className="mt-1 space-y-1.5">
              <Textarea
                className="text-base md:text-sm"
                rows={3}
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="e.g. Answers should always cite the source document. Watch for cases where it guesses."
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingGoal(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  disabled={updateGoal.isPending}
                  onClick={() =>
                    updateGoal.mutate(goalDraft, {
                      onSuccess: () => setEditingGoal(false),
                    })
                  }
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {enrollment.goal ??
                "Nothing specific — the reviewer looks for anything that would make this agent better."}
            </p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
          Reviews ({detail.reviews?.length ?? 0})
        </div>
        {(detail.reviews?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">
            No reviews yet — the first one appears here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {(detail.reviews ?? []).map((r) => (
              <ReviewTimelineRow
                key={r.id}
                review={r}
                active={r.id === activeReviewId}
                findingsCount={findingsByReview.get(r.id) ?? 0}
                onSelect={() => onSelectReview(r.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
