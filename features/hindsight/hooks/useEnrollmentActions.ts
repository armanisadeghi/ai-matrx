"use client";

/**
 * useEnrollmentActions — the three mutations every Hindsight surface needs on
 * one enrollment (run a review now, pause/resume, archive), with the shared
 * toast + cache-invalidation behavior in ONE place.
 *
 * Consumed by the admin `EnrollmentDetailPanel` and the product
 * `ImprovementWorkspace` — never re-implement these mutations beside a
 * component.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import { archiveEnrollment, triggerReview, updateEnrollment } from "../api";
import { fmtCost } from "../components/tokens";

export function useEnrollmentActions(
  enrollmentId: string,
  opts?: { onArchived?: () => void },
) {
  const queryClient = useQueryClient();
  // State, not a ref: elapsed-time UI reads it during render.
  const [reviewStartedAt, setReviewStartedAt] = useState(0);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["hindsight"] });
  };

  const runReview = useMutation({
    // `exampleIds` is the "review THIS conversation" door — named ids bypass
    // the settle window and never advance the watermark. Undefined = the
    // normal window review. Callers pass ids via runReview.mutate(ids).
    mutationFn: (exampleIds?: string[]) => {
      setReviewStartedAt(Date.now());
      return triggerReview(enrollmentId, exampleIds);
    },
    onSuccess: (res) => {
      if (res.status === "completed") {
        toast.success(
          `Review done — ${res.findings_created} finding(s) from ${res.example_count} real run(s), ${fmtCost(res.cost_usd)} spent`,
        );
      } else {
        toast.info(`Review ${res.status}${res.reason ? `: ${res.reason}` : ""}`);
      }
      invalidate();
    },
    onError: (err: Error) => toast.error(`Review failed: ${err.message}`),
  });

  /**
   * The ONE "Review now" door every button uses (sidebar, reviewer pane,
   * first-review empty state). THE LAW (destructive-and-expensive-actions):
   * state the cost before spending, and never silently skip a click.
   */
  const confirmAndRunReview = async ({
    pending,
    needed,
  }: {
    pending: number;
    needed: number;
  }) => {
    if (runReview.isPending) return;
    const ok = await confirm({
      title: "Run a review now?",
      description:
        pending > 0
          ? `The reviewer reads your ${pending} new run${pending === 1 ? "" : "s"} end to end — it costs real money and takes a few minutes. Left alone, it happens automatically after ${needed} new runs.`
          : "No new runs are waiting — the reviewer has nothing new to read and this will be skipped.",
      confirmLabel: pending > 0 ? "Review now" : "Run anyway",
    });
    if (ok) runReview.mutate(undefined);
  };

  const toggleStatus = useMutation({
    mutationFn: (status: "active" | "paused") =>
      updateEnrollment(enrollmentId, { status }),
    onSuccess: (row) => {
      toast.success(row.status === "active" ? "Resumed" : "Paused");
      invalidate();
    },
    onError: (err: Error) => toast.error(`Could not update: ${err.message}`),
  });

  const updateGoal = useMutation({
    mutationFn: (goal: string) =>
      updateEnrollment(enrollmentId, { goal: goal.trim() || null }),
    onSuccess: () => {
      toast.success("Focus updated — the next review uses it");
      invalidate();
    },
    onError: (err: Error) => toast.error(`Could not save: ${err.message}`),
  });

  const archive = useMutation({
    mutationFn: () => archiveEnrollment(enrollmentId),
    onSuccess: () => {
      toast.success("Archived");
      invalidate();
      opts?.onArchived?.();
    },
    onError: (err: Error) => toast.error(`Could not archive: ${err.message}`),
  });

  return {
    runReview,
    confirmAndRunReview,
    toggleStatus,
    updateGoal,
    archive,
    invalidate,
    reviewStartedAt,
  };
}
