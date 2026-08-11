"use client";

import { CalendarClock, FileText } from "lucide-react";
import { ScrapedContentPretty } from "@/features/scraper/parts/ScrapedContentPretty";
import type { PreFetchedUrl } from "@/types/python-generated/stream-events";

interface WebpageSnapshotViewProps {
  snapshot: PreFetchedUrl;
  /** The picker already owns surrounding metadata chrome; the sent drawer does not. */
  variant?: "content" | "draft" | "submitted";
}

function formatScrapedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

/** The one presentation of the exact webpage text selected for a message. */
export function WebpageSnapshotView({
  snapshot,
  variant = "submitted",
}: WebpageSnapshotViewProps) {
  const scrapedAt = formatScrapedAt(snapshot.scrapedAt);
  const charCount = snapshot.charCount ?? snapshot.textContent.length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {variant !== "content" && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {variant === "submitted"
              ? "Snapshot sent with this message"
              : "Snapshot attached to this draft"}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {charCount.toLocaleString()} characters
          </span>
          {scrapedAt && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              {scrapedAt}
            </span>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {snapshot.textContent.trim() ? (
          <ScrapedContentPretty markdown={snapshot.textContent} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs italic text-muted-foreground">
            This webpage attachment contains no saved text.
          </div>
        )}
      </div>
    </div>
  );
}
