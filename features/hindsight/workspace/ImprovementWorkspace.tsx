"use client";

/**
 * ImprovementWorkspace — the dedicated surface where a user improves an agent
 * by talking to the intelligence that watches it (Hindsight, Layer 2).
 *
 * Shape: conversation in the middle, intelligence on the sides.
 *   LEFT   — review state + timeline (EnrollmentSidebar); selecting a review
 *            opens its conversation.
 *   CENTER — the reviewer's thread as a real chat (ReviewerChat): read what it
 *            concluded from the agent's real runs, tell it what it got right
 *            or wrong, watch new proposals appear.
 *   RIGHT  — the proposals awaiting a decision + the version ladder the
 *            applied ones built (ImprovementsRail). "Guide" on a proposal
 *            scopes the center conversation to it.
 *
 * Not enrolled yet → the EnableCard onboarding, centered.
 *
 * The server scopes everything to the caller (a non-admin only sees their own
 * enrollments), and doors render for the product audience.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

import { getEnrollment, listEnrollments } from "../api";
import type { Finding } from "../types";
import { DoorAudienceProvider } from "../components/door-audience";
import { EnableCard } from "../components/EnableCard";
import { useEnrollmentActions } from "../hooks/useEnrollmentActions";
import { EnrollmentSidebar } from "./EnrollmentSidebar";
import { ImprovementsRail } from "./ImprovementsRail";
import { ReviewerChat } from "./ReviewerChat";

function EnrolledWorkspace({
  agentId,
  enrollmentId,
  onArchived,
}: {
  agentId: string;
  enrollmentId: string;
  onArchived: () => void;
}) {
  const isMobile = useIsMobile();
  const actions = useEnrollmentActions(enrollmentId, { onArchived });

  const detail = useQuery({
    queryKey: ["hindsight", "enrollment", enrollmentId],
    queryFn: () => getEnrollment(enrollmentId),
  });

  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [guidedFinding, setGuidedFinding] = useState<Finding | null>(null);

  if (detail.isLoading) {
    return (
      <div className="flex h-full gap-3 p-4">
        <Skeleton className="hidden h-full w-72 lg:block" />
        <Skeleton className="h-full flex-1" />
        <Skeleton className="hidden h-full w-96 xl:block" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="p-4">
        <Card className="p-4 text-sm text-red-600 dark:text-red-400">
          Could not load review status: {(detail.error as Error).message}
        </Card>
      </div>
    );
  }
  const data = detail.data;
  if (!data) return null;

  const reviews = data.reviews ?? [];
  const findings = data.findings ?? [];
  // Default to the newest review (the list is ordered newest first).
  const activeReview =
    reviews.find((r) => r.id === selectedReviewId) ?? reviews[0] ?? null;

  const handleGuide = (finding: Finding) => {
    // The conversation must be the one that produced the finding.
    setSelectedReviewId(finding.review_id);
    setGuidedFinding(finding);
  };

  const chat = (
    <ReviewerChat
      review={activeReview}
      guidedFinding={guidedFinding}
      onClearGuidedFinding={() => setGuidedFinding(null)}
      onResolved={actions.invalidate}
      onRunReview={() => actions.runReview.mutate()}
      reviewRunning={actions.runReview.isPending}
      pendingExamples={data.pending_examples ?? 0}
    />
  );

  if (isMobile) {
    // Stacked, single scroll area: the conversation first (its own bounded
    // height), then the proposals, then the review state.
    return (
      <div className="h-full overflow-y-auto">
        <div className="h-[65dvh] border-b border-border">{chat}</div>
        <ImprovementsRail
          agentId={agentId}
          findings={findings}
          onChanged={actions.invalidate}
          onGuide={handleGuide}
        />
        <div className="border-t border-border">
          <EnrollmentSidebar
            detail={data}
            actions={actions}
            activeReviewId={activeReview?.id ?? null}
            onSelectReview={setSelectedReviewId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="hidden w-72 shrink-0 border-r border-border lg:block">
        <EnrollmentSidebar
          detail={data}
          actions={actions}
          activeReviewId={activeReview?.id ?? null}
          onSelectReview={setSelectedReviewId}
        />
      </aside>
      <main className="min-w-0 flex-1">{chat}</main>
      <aside className="hidden w-96 shrink-0 border-l border-border xl:block">
        <ImprovementsRail
          agentId={agentId}
          findings={findings}
          onChanged={actions.invalidate}
          onGuide={handleGuide}
        />
      </aside>
    </div>
  );
}

export function ImprovementWorkspace({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const enrollments = useQuery({
    queryKey: ["hindsight", "enrollments"],
    queryFn: () => listEnrollments(),
  });

  if (enrollments.isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (enrollments.isError) {
    return (
      <div className="p-4">
        <Card className="p-4 text-sm text-red-600 dark:text-red-400">
          Could not load review status: {(enrollments.error as Error).message}
        </Card>
      </div>
    );
  }

  const mine = (enrollments.data ?? []).find(
    (e) => e.subject_kind === "agent" && e.subject_id === agentId,
  );

  return (
    <DoorAudienceProvider audience="product">
      {mine ? (
        <EnrolledWorkspace
          agentId={agentId}
          enrollmentId={mine.id}
          onArchived={() => void enrollments.refetch()}
        />
      ) : (
        <div className="h-full overflow-y-auto p-4">
          <EnableCard agentId={agentId} agentName={agentName} />
        </div>
      )}
    </DoorAudienceProvider>
  );
}
