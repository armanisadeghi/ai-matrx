"use client";

import { AlertCircle } from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";
import { cn } from "@/lib/utils";

export interface ScrapedContentPrettyProps {
  /** Usually `markdown_renderable` from the scraper API */
  markdown: string;
  className?: string;
  /** Shown when `markdown` is empty */
  emptyLabel?: string;
}

/**
 * Renders scraper `markdown_renderable` with the same markdown stack as chat,
 * via the code-split `MarkdownStream` wrapper (NOT `MarkdownStreamImpl` directly
 * — that statically bundles the entire markdown/rich-document pipeline).
 */
export function ScrapedContentPretty({
  markdown,
  className = "",
  emptyLabel = "No markdown_renderable content was returned for this page.",
}: ScrapedContentPrettyProps) {
  const trimmed = markdown?.trim() ?? "";
  if (!trimmed) {
    return (
      <div
        className={`flex items-start gap-2 p-4 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 ${className}`}
      >
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 bg-background p-4 text-foreground", className)}>
      <MarkdownStream content={trimmed} />
    </div>
  );
}
