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
import {
  Columns3,
  History,
  Lightbulb,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MobilePanelShell } from "@/features/shell/components/header/templates/MobilePanelShell";

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
  const actions = useEnrollmentActions(enrollmentId, { onArchived });

  const detail = useQuery({
    queryKey: ["hindsight", "enrollment", enrollmentId],
    queryFn: () => getEnrollment(enrollmentId),
  });

  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [guidedFinding, setGuidedFinding] = useState<Finding | null>(null);

  if (detail.isLoading) {
    return (
      <div className="flex h-full gap-3 p-4 pt-[calc(var(--shell-header-h)+1rem)]">
        <Skeleton className="hidden h-full w-64 2xl:block" />
        <Skeleton className="h-full flex-1" />
        <Skeleton className="hidden h-full w-[26rem] 2xl:block" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto p-4 pt-[calc(var(--shell-header-h)+2rem)]">
        <Card className="w-full max-w-lg p-5">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <h2 className="font-medium">Review workspace unavailable</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {(detail.error as Error).message}
              </p>
              <Button
                className="mt-4"
                size="sm"
                onClick={() => void detail.refetch()}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          </div>
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

  const reviewPanel = (
    <EnrollmentSidebar
      detail={data}
      actions={actions}
      activeReviewId={activeReview?.id ?? null}
      onSelectReview={setSelectedReviewId}
    />
  );
  const improvementsPanel = (
    <ImprovementsRail
      agentId={agentId}
      findings={findings}
      onChanged={actions.invalidate}
      onGuide={handleGuide}
    />
  );

  return (
    <MobilePanelShell
      collapseBelow="2xl"
      menuIcon={Columns3}
      menuLabel="Review panels"
      main={chat}
      mainClassName="overflow-hidden pt-[var(--shell-header-h)]"
      panels={[
        {
          id: "reviews",
          label: "Review history & settings",
          icon: History,
          content: (
            <div className="h-[70dvh] overflow-hidden">{reviewPanel}</div>
          ),
        },
        {
          id: "improvements",
          label: `Proposals & versions (${findings.length})`,
          icon: Lightbulb,
          content: (
            <div className="h-[70dvh] overflow-hidden">{improvementsPanel}</div>
          ),
        },
      ]}
      desktop={
        <div className="flex h-full min-h-0 overflow-hidden pt-[var(--shell-header-h)]">
          <aside className="w-64 shrink-0 border-r border-border bg-card/30">
            {reviewPanel}
          </aside>
          <main className="min-w-0 flex-1">{chat}</main>
          <aside className="w-[26rem] shrink-0 border-l border-border bg-card/30">
            {improvementsPanel}
          </aside>
        </div>
      }
    />
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
      <div className="h-full p-4 pt-[calc(var(--shell-header-h)+1rem)]">
        <Skeleton className="h-full" />
      </div>
    );
  }
  if (enrollments.isError) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto p-4 pt-[calc(var(--shell-header-h)+2rem)]">
        <Card className="w-full max-w-lg p-5">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <h2 className="font-medium">Review status unavailable</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {(enrollments.error as Error).message}
              </p>
              <Button
                className="mt-4"
                size="sm"
                onClick={() => void enrollments.refetch()}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          </div>
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
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          <div className="p-4 sm:p-6">
            <EnableCard agentId={agentId} agentName={agentName} />
          </div>
        </div>
      )}
    </DoorAudienceProvider>
  );
}
