"use client";

import { cn } from "@/lib/utils";
import {
  computePlainTextMetrics,
  type PlainTextMetrics,
} from "@/utils/text/plainTextMetrics";

export interface PlainTextMetricsBarProps {
  text: string;
  className?: string;
  /** Tighter spacing for mobile / narrow footers. */
  compact?: boolean;
  /** Override which metrics render (defaults to chars, words, lines, paragraphs). */
  metrics?: Array<keyof PlainTextMetrics>;
}

const METRIC_LABELS: Record<keyof PlainTextMetrics, string> = {
  charCount: "chars",
  wordCount: "words",
  lineCount: "lines",
  paragraphCount: "paragraphs",
  nonWhitespaceCharCount: "non-space chars",
};

const DEFAULT_METRICS: Array<keyof PlainTextMetrics> = [
  "charCount",
  "wordCount",
  "lineCount",
  "paragraphCount",
];

export function PlainTextMetricsBar({
  text,
  className,
  compact = false,
  metrics = DEFAULT_METRICS,
}: PlainTextMetricsBarProps) {
  const stats = computePlainTextMetrics(text);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border bg-muted/30 text-muted-foreground font-mono tabular-nums",
        compact ? "px-2 py-1 text-[10px]" : "px-4 py-1.5 text-xs",
        className,
      )}
      aria-live="polite"
      aria-label="Plain text statistics"
    >
      {metrics.map((key, index) => (
        <span key={key} className="whitespace-nowrap">
          {index > 0 ? (
            <span className="mr-3 text-border/80" aria-hidden="true">
              ·
            </span>
          ) : null}
          <span className="text-foreground/90">
            {stats[key].toLocaleString()}
          </span>{" "}
          {METRIC_LABELS[key]}
        </span>
      ))}
    </div>
  );
}
