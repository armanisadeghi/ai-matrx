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
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface ScrapeFailureNoticeProps {
  failure: ScrapeFailure;
  /**
   * The in-place way out of this failure — the whole point of the notice. A
   * host that has no other lane omits it and the notice still names the
   * remedy in words.
   */
  remedyAction?: { label: string; onClick: () => void };
  /**
   * Whether this viewer may open the engineer's report at all. Default `true`
   * keeps the support-audience surfaces unchanged; a surface a non-technical
   * person uses passes the admin flag, and a non-admin then sees the plain
   * words and the remedy with no disclosure to open. Nothing is hidden from
   * the system either way — `captureScraperError` still files it.
   */
  detailsAllowed?: boolean;
  /**
   * `"inline"` (default) is the compact body used inside a picker or a toolbar.
   * `"page"` is the same content at page scale, for a surface where the failure
   * IS the screen.
   */
  size?: "inline" | "page";
  className?: string;
}

export function ScrapeFailureNotice({
  failure,
  remedyAction,
  detailsAllowed = true,
  size = "inline",
  className,
}: ScrapeFailureNoticeProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isPage = size === "page";

  return (
    <div
      className={
        (isPage
          ? "flex flex-col gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 "
          : "flex flex-col gap-2 rounded border border-destructive/20 bg-destructive/10 p-2 ") +
        (className ?? "")
      }
      role="alert"
    >
      <div className={isPage ? "flex items-start gap-3" : "flex items-start gap-2"}>
        <AlertCircle
          className={
            isPage
              ? "mt-0.5 h-5 w-5 flex-shrink-0 text-destructive"
              : "mt-0.5 h-4 w-4 flex-shrink-0 text-destructive"
          }
        />
        <div className="min-w-0 space-y-1">
          <p
            className={
              isPage
                ? "text-sm font-medium text-foreground"
                : "text-xs font-medium text-destructive"
            }
          >
            {failure.title}
          </p>
          <p className={isPage ? "text-sm text-muted-foreground" : "text-xs text-muted-foreground"}>
            {failure.remedy}
          </p>
        </div>
      </div>

      {remedyAction ? (
        <Button
          size="sm"
          className={isPage ? "h-8 w-fit text-xs" : "h-7 w-full text-xs"}
          onClick={remedyAction.onClick}
        >
          {remedyAction.label}
        </Button>
      ) : null}

      {detailsAllowed ? (
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
          Technical details
        </button>
      ) : null}

      {detailsAllowed && showDetails ? (
        <div className="space-y-1">
          <p className="break-words font-mono text-[10px] text-muted-foreground">
            {failure.developerMessage}
          </p>
          <ScraperHookErrorDetails diagnostics={failure.diagnostics} />
        </div>
      ) : null}
      <ErrorAlchemyMenu className="ml-auto" />
    </div>
  );
}
