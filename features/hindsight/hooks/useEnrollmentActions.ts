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
    mutationFn: () => {
      setReviewStartedAt(Date.now());
      return triggerReview(enrollmentId);
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

  return { runReview, toggleStatus, updateGoal, archive, invalidate, reviewStartedAt };
}
