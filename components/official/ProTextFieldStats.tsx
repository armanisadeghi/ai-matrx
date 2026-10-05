"use client";

import { BarChart3, Check, X } from "lucide-react";
import { Button, Tile } from "@ai-matrx/design-system/controls";
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
      <Tile variant="quiet" icon={<BarChart3 />} title="Text stats" onClick={onOpenStatsPanel} />
      <Tile
        variant="quiet"
        icon={showStatsBar ? <Check /> : <span aria-hidden className="size-4" />}
        title="Show stats bar"
        selected={showStatsBar}
        onClick={onToggleStatsBar}
      />
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
          <Button variant="quiet" icon={<X />} aria-label="Close" onClick={onClose} />
        ) : null}
      </div>

      {text.length === 0 ? (
        // Same law as the pinned bar: no statistics for a field with no text.
        // Five zeros are five facts about nothing; this says the true thing.
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          Nothing typed here yet — the counts start with the first character.
        </p>
      ) : (
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
      )}

      {onBack ? (
        <div className="border-t border-border px-3 py-2">
          <Button variant="quiet" onClick={onBack}>
            Back
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface ProTextFieldStatsBarProps {
  text: string;
  className?: string;
  /** Reserve space on the right so stats never collide with floating controls. */
  reserveRightSpace?: number;
}

/** Compact pinned footer bar — non-disruptive live stats while editing. */
export function ProTextFieldStatsBar({
  text,
  className,
  reserveRightSpace,
}: ProTextFieldStatsBarProps) {
  return (
    <PlainTextMetricsBar
      text={text}
      compact
      metrics={TEXTAREA_METRICS}
      reserveRightSpace={reserveRightSpace}
      className={cn("rounded-b-md border-x border-b border-input", className)}
    />
  );
}
