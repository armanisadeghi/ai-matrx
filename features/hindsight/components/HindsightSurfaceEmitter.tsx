"use client";

/**
 * HindsightSurfaceEmitter — the `matrx-admin/hindsight` surface's runtime half.
 *
 * The manifest declares what an agent bound to this console may consume; this
 * mount is what actually hands those values over at trigger time. It wraps the
 * page rather than living inside it so every panel — the enrollment list, the
 * detail pane, Internal Affairs — sits under one scope.
 *
 * The scope is built INSIDE `getScope`, never on mount: an operator selects a
 * different enrollment constantly, and a scope captured at mount would hand the
 * agent whichever subject happened to be open when the page loaded. Reading the
 * react-query cache at trigger time is deliberate — the detail payload
 * (findings, reviews, replays, spend) is owned by `EnrollmentDetailPanel`'s own
 * query, and duplicating that fetch here just to emit it would double the load
 * on every enrollment view.
 */

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_HINDSIGHT_SURFACE_NAME,
  createAdminHindsightScope,
} from "@/features/surfaces/manifests/admin-hindsight.manifest";

import type { Enrollment, EnrollmentDetail, HindsightCosts } from "../types";

/** Only these example kinds are re-issuable — mirrors the replay endpoint. */
const REPLAYABLE_EXAMPLE_KINDS = new Set(["conversation", "wf_run"]);

export function HindsightSurfaceEmitter({
  enrollments,
  costs,
  selectedEnrollmentId,
  children,
}: {
  enrollments: Enrollment[];
  costs: HindsightCosts | undefined;
  selectedEnrollmentId: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();

  const getScope = () => {
    const selected = selectedEnrollmentId
      ? enrollments.find((e) => e.id === selectedEnrollmentId)
      : undefined;

    // Whatever the detail pane has already loaded for this enrollment. Absent
    // is a legitimate state (nothing selected, or still fetching) and the
    // manifest marks every one of these values optional for exactly that
    // reason — the surface never promises what it may not have.
    const detail = selectedEnrollmentId
      ? queryClient.getQueryData<EnrollmentDetail>([
          "hindsight",
          "enrollment",
          selectedEnrollmentId,
        ])
      : undefined;

    const pending = selectedEnrollmentId
      ? queryClient.getQueryData<{
          examples?: { kind: string; id: string }[];
        }>(["hindsight", "pending-examples", selectedEnrollmentId])
      : undefined;

    return createAdminHindsightScope({
      platform_hindsight_spend: {
        total_cost: costs?.total_cost ?? 0,
        review_cost: costs?.review_cost ?? 0,
        review_count: costs?.review_count ?? 0,
        replay_cost: costs?.replay_cost ?? 0,
        replay_count: costs?.replay_count ?? 0,
      },
      selected_enrollment_id: selectedEnrollmentId ?? undefined,
      enrollment_subject_kind: selected?.subject_kind,
      enrollment_display_name: selected?.display_name,
      enrollment_goal: selected?.goal || undefined,
      enrollment_lens: selected
        ? {
            window_mode: selected.window_mode,
            window_n: selected.window_n,
            review_every_n: selected.review_every_n,
            max_examples_per_review: selected.max_examples_per_review,
          }
        : undefined,
      open_findings: detail?.findings
        ?.filter((f) => f.status === "proposed")
        .map((f) => ({
          id: f.id,
          lever: f.lever,
          title: f.title,
          status: f.status,
        })),
      review_summaries: detail?.reviews?.map((r) => ({
        id: r.id,
        status: r.status,
        example_count: r.example_count,
        total_cost: r.total_cost,
        created_at: r.created_at,
      })),
      pending_example_count: detail?.pending_examples ?? undefined,
      replayable_examples: pending?.examples
        ?.filter((e) => REPLAYABLE_EXAMPLE_KINDS.has(e.kind))
        .map((e) => ({ kind: e.kind, id: e.id })),
      enrollment_spend: detail?.spend
        ? {
            total_cost: detail.spend.total_cost,
            review_cost: detail.spend.review_cost,
            review_count: detail.spend.review_count,
            replay_cost: detail.spend.replay_cost,
            replay_count: detail.spend.replay_count,
          }
        : undefined,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_HINDSIGHT_SURFACE_NAME}
      getScope={getScope}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
