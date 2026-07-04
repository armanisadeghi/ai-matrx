"use client";

import { BarChart3, Check, X } from "lucide-react";
import { PlainTextMetricsBar } from "@/components/text/PlainTextMetricsBar";
import { cn } from "@/lib/utils";
import {
  computePlainTextMetrics,
  type PlainTextMetrics,
} from "@/utils/text/plainTextMetrics";

const METRIC_LABELS: Record<keyof PlainTextMetrics, string> = {
  charCount: "Characters",
  whitespaceCharCount: "Whitespace characters",
  wordCount: "Words",
  lineCount: "Lines",
  paragraphCount: "Paragraphs",
  nonWhitespaceCharCount: "Non-space characters",
};

const TEXTAREA_METRICS: Array<keyof PlainTextMetrics> = [
  "charCount",
  "whitespaceCharCount",
  "wordCount",
  "lineCount",
  "paragraphCount",
];

export interface ProTextFieldStatsMenuItemsProps {
  showStatsBar: boolean;
  onToggleStatsBar: () => void;
  onOpenStatsPanel: () => void;
  className?: string;
}

/** "…" menu rows for text stats — toggle pinned bar + open detail panel. */
export function ProTextFieldStatsMenuItems({
  showStatsBar,
  onToggleStatsBar,
  onOpenStatsPanel,
  className,
}: ProTextFieldStatsMenuItemsProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={onOpenStatsPanel}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <BarChart3 className="h-4 w-4" />
        Text stats
      </button>
      <button
        type="button"
        onClick={onToggleStatsBar}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <span className="inline-flex h-4 w-4 items-center justify-center">
          {showStatsBar ? <Check className="h-4 w-4" /> : null}
        </span>
        Show stats bar
      </button>
    </div>
  );
}

export interface ProTextFieldStatsPanelProps {
  text: string;
  onBack?: () => void;
  onClose?: () => void;
}

/** Popover body — full stat breakdown with optional back/close chrome. */
export function ProTextFieldStatsPanel({
  text,
  onBack,
  onClose,
}: ProTextFieldStatsPanelProps) {
  const stats = computePlainTextMetrics(text);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
          Text stats
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <dl className="grid gap-2 px-3 py-2.5">
        {TEXTAREA_METRICS.map((key) => (
          <div
            key={key}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <dt className="text-muted-foreground">{METRIC_LABELS[key]}</dt>
            <dd className="font-mono tabular-nums text-foreground">
              {stats[key].toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      {onBack ? (
        <div className="border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Back
          </button>
        </div>
      ) : null}
    </div>
  );
}

export interface ProTextFieldStatsBarProps {
  text: string;
  className?: string;
}

/** Compact pinned footer bar — non-disruptive live stats while editing. */
export function ProTextFieldStatsBar({
  text,
  className,
}: ProTextFieldStatsBarProps) {
  return (
    <PlainTextMetricsBar
      text={text}
      compact
      metrics={TEXTAREA_METRICS}
      className={cn("rounded-b-md border-x border-b border-input", className)}
    />
  );
}
