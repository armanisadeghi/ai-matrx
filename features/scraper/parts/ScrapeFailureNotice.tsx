"use client";

// features/scraper/parts/ScrapeFailureNotice.tsx
//
// THE ONE user-facing body for a failed scrape (W44, 2026-09-12).
//
// Plain words first, a remedy the person can press, and the engineer's report
// only behind "Details" — collapsed, for support. Never the reverse order, and
// never a stack trace as the primary body. The two faces come from
// `classifyScrapeFailure`; this component only decides how they are shown.
//
// Loudness is unchanged: the failure is always announced, always says what to
// do next, and `captureScraperError` still files the diagnostics.

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScraperHookErrorDetails } from "@/features/scraper/parts/ScraperHookErrorDetails";
import type { ScrapeFailure } from "@/features/scraper/failure/scrapeFailure";

export interface ScrapeFailureNoticeProps {
  failure: ScrapeFailure;
  /**
   * The in-place way out of this failure — the whole point of the notice. A
   * host that has no other lane omits it and the notice still names the
   * remedy in words.
   */
  remedyAction?: { label: string; onClick: () => void };
  className?: string;
}

export function ScrapeFailureNotice({
  failure,
  remedyAction,
  className,
}: ScrapeFailureNoticeProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      className={
        "flex flex-col gap-2 rounded border border-destructive/20 bg-destructive/10 p-2 " +
        (className ?? "")
      }
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-destructive">{failure.title}</p>
          <p className="text-xs text-muted-foreground">{failure.remedy}</p>
        </div>
      </div>

      {remedyAction ? (
        <Button
          size="sm"
          className="h-7 w-full text-xs"
          onClick={remedyAction.onClick}
        >
          {remedyAction.label}
        </Button>
      ) : null}

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="flex items-center gap-1 self-start text-[10px] text-muted-foreground hover:text-foreground"
        aria-expanded={showDetails}
      >
        {showDetails ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Details
      </button>

      {showDetails ? (
        <div className="space-y-1">
          <p className="break-words font-mono text-[10px] text-muted-foreground">
            {failure.developerMessage}
          </p>
          <ScraperHookErrorDetails diagnostics={failure.diagnostics} />
        </div>
      ) : null}
    </div>
  );
}
