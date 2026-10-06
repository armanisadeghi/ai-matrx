"use client";

// features/marketing/reports/saved/SavedSeoReportsSection.tsx — "Saved SEO
// reports" on /marketing/reports (the agency plane), beside the live Search
// Console report, never instead of it. Every report the person can open, across
// all their organizations (row security decides; no active-organization filter).

import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { GenerateSeoReportButton } from "./GenerateSeoReportButton";
import { SavedSeoReportsTable } from "./SavedSeoReportsTable";
import { useSavedSeoReports } from "./hooks";
import type { SeoReportDraft } from "./types";

export function SavedSeoReportsSection({
  draft,
  unavailableReason,
}: {
  draft: SeoReportDraft | null;
  unavailableReason: string;
}) {
  const reports = useSavedSeoReports(null);
  const total = reports.data?.total ?? 0;
  const shown = reports.data?.rows.length ?? 0;
  return (
    <section aria-label="Saved SEO reports" className="mt-5 space-y-2 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Saved SEO reports
          {total > shown ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {shown} of {total}
            </span>
          ) : null}
        </h2>
        <GenerateSeoReportButton draft={draft} unavailableReason={unavailableReason} />
      </div>
      {reports.error ? (
        <InlineQueryError what="saved SEO reports" error={reports.error} />
      ) : (
        <SavedSeoReportsTable
          rows={reports.data?.rows ?? []}
          isLoading={reports.isLoading}
          location="Marketing Reports — Saved SEO reports"
        />
      )}
    </section>
  );
}
