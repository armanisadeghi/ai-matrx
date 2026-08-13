"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  useClaim,
  useReportForClaim,
  useReportInjuries,
} from "./api/hooks";
import { hydrateRatingDraft } from "./state/hydrateFromServer";
import { CaPdCalculatorClient } from "./CaPdCalculatorClient";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";

const LOADER_TRAIL = [
  { label: "Legal", href: "/legal" },
  { label: "CA WC", href: "/legal/ca-wc" },
  { label: "PD Rating" },
];

function LoaderHeader() {
  return (
    <PageHeader>
      <CrumbTrailHeader backHref="/legal/ca-wc" trail={LOADER_TRAIL} />
    </PageHeader>
  );
}

interface SavedCaseLoaderProps {
  claimId: string;
}

export function SavedCaseLoader({ claimId }: SavedCaseLoaderProps) {
  const claim = useClaim(claimId);
  const report = useReportForClaim(claimId);
  const reportId = report.data?.id;
  const injuries = useReportInjuries(reportId);

  const isLoading =
    claim.isLoading ||
    report.isLoading ||
    (!!reportId && injuries.isLoading);

  const error = claim.error ?? report.error ?? injuries.error;

  if (isLoading) {
    return (
      <>
        <LoaderHeader />
        <div className="flex items-center justify-center min-h-[60dvh]">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading saved case…</span>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return <ErrorState message={(error as Error).message ?? "Couldn't load case"} />;
  }

  if (!claim.data) {
    return <ErrorState message="Case not found." />;
  }

  if (!report.data) {
    return (
      <ErrorState
        message="This claim doesn't have a rating report yet."
        detail="Open the calculator and add injuries to create one."
      />
    );
  }

  const initialDraft = hydrateRatingDraft(
    claim.data,
    report.data,
    injuries.data ?? { injuries: [], count: 0 },
  );

  return <CaPdCalculatorClient initialDraft={initialDraft} mode="saved" />;
}

function ErrorState({
  message,
  detail,
}: {
  message: string;
  detail?: string;
}) {
  return (
    <>
      <LoaderHeader />
      <div className="flex items-center justify-center min-h-[60dvh]">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
            <AlertCircle className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-foreground">{message}</p>
          {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
    </>
  );
}
