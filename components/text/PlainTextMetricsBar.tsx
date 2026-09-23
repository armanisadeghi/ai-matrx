"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  BarChart3,
  Hash,
  List,
  Pilcrow,
  Space,
  WholeWord,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  /** Reserve horizontal space on the right (e.g. for a floating submit button). */
  reserveRightSpace?: number;
}

/**
 * The word after a count, singular and plural. Cold walk 22 read "1 paragraphs"
 * on the Bench's statistics bar — the label was one fixed plural string. Every
 * counter this bar prints goes through `metricLabel`, so no count reads
 * "1 lines", "1 words" or "1 chars" again.
 */
const METRIC_LABELS: Record<keyof PlainTextMetrics, readonly [string, string]> = {
  charCount: ["char", "chars"],
  whitespaceCharCount: ["whitespace", "whitespace"],
  wordCount: ["word", "words"],
  lineCount: ["line", "lines"],
  paragraphCount: ["paragraph", "paragraphs"],
  nonWhitespaceCharCount: ["non-space char", "non-space chars"],
};

/** The label for `count` of `key`, agreeing in number. */
export function metricLabel(key: keyof PlainTextMetrics, count: number): string {
  const [one, many] = METRIC_LABELS[key];
  return count === 1 ? one : many;
}

const METRIC_SHORT_LABELS: Record<keyof PlainTextMetrics, string> = {
  charCount: "c",
  whitespaceCharCount: "ws",
  wordCount: "w",
  lineCount: "ln",
  paragraphCount: "¶",
  nonWhitespaceCharCount: "nsc",
};

const METRIC_TITLES: Record<keyof PlainTextMetrics, string> = {
  charCount: "Characters",
  whitespaceCharCount: "Whitespace characters",
  wordCount: "Words",
  lineCount: "Lines",
  paragraphCount: "Paragraphs",
  nonWhitespaceCharCount: "Non-space characters",
};

const METRIC_ICONS: Record<keyof PlainTextMetrics, LucideIcon> = {
  charCount: Hash,
  whitespaceCharCount: Space,
  wordCount: WholeWord,
  lineCount: List,
  paragraphCount: Pilcrow,
  nonWhitespaceCharCount: Hash,
};

const DEFAULT_METRICS: Array<keyof PlainTextMetrics> = [
  "charCount",
  "whitespaceCharCount",
  "wordCount",
  "lineCount",
  "paragraphCount",
];

const MINIMAL_METRICS: Array<keyof PlainTextMetrics> = [
  "charCount",
  "wordCount",
  "lineCount",
];

type MetricsDensity = "full" | "compact" | "minimal" | "collapsed";

const DENSITY_THRESHOLDS: Array<{ minWidth: number; density: MetricsDensity }> =
  [
    { minWidth: 360, density: "full" },
    { minWidth: 260, density: "compact" },
    { minWidth: 168, density: "minimal" },
    { minWidth: 0, density: "collapsed" },
  ];

function resolveDensity(
  width: number,
  reserveRightSpace: number,
): MetricsDensity {
  const available = Math.max(0, width - reserveRightSpace);
  for (const threshold of DENSITY_THRESHOLDS) {
    if (available >= threshold.minWidth) return threshold.density;
  }
  return "collapsed";
}

function useMetricsBarDensity(
  reserveRightSpace: number,
): [RefObject<HTMLDivElement | null>, MetricsDensity] {
  const containerRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState<MetricsDensity>("full");

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      setDensity(resolveDensity(element.clientWidth, reserveRightSpace));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [reserveRightSpace]);

  return [containerRef, density];
}

function MetricsDetailList({
  stats,
  metrics,
}: {
  stats: PlainTextMetrics;
  metrics: Array<keyof PlainTextMetrics>;
}) {
  return (
    <dl className="grid gap-2 px-3 py-2.5">
      {metrics.map((key) => (
        <div
          key={key}
          className="flex items-baseline justify-between gap-3 text-xs"
        >
          <dt className="text-muted-foreground">{METRIC_TITLES[key]}</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {stats[key].toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MetricChip({
  value,
  label,
  title,
  icon: Icon,
  iconOnly = false,
}: {
  value: number;
  label: string;
  title: string;
  icon: LucideIcon;
  iconOnly?: boolean;
}) {
  const content = (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {iconOnly ? (
        <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
      ) : null}
      <span className="text-foreground/90">{value.toLocaleString()}</span>
      {!iconOnly ? (
        <span>{label}</span>
      ) : (
        <span className="sr-only">{title}</span>
      )}
    </span>
  );

  if (!iconOnly) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">{content}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {title}: {value.toLocaleString()}
      </TooltipContent>
    </Tooltip>
  );
}

export function PlainTextMetricsBar({
  text,
  className,
  compact = false,
  metrics = DEFAULT_METRICS,
  reserveRightSpace = 0,
}: PlainTextMetricsBarProps) {
  const stats = computePlainTextMetrics(text);
  const [containerRef, density] = useMetricsBarDensity(reserveRightSpace);

  // 🚨 NO STATISTICS FOR A FIELD WITH NO TEXT — EVER (the class behind the
  // "fifteen zeros" defect, cold walks 19 and 21). An empty box measured
  // itself and printed `0 chars 0 whitespace 0 words 0 lines 0 paragraphs`
  // — five facts about nothing, and on the Bench dialog three of those bars
  // sat directly above "Expect this to cost up to about $85.90". Counting
  // helps while someone writes; before the first character it is noise on a
  // screen where a non-technical Expert is deciding whether to spend money.
  // Gated HERE, at the one primitive every stats bar renders through
  // (ProTextFieldStatsBar -> every `enableTextStats` ProTextarea, the notes
  // footer, the fullscreen markdown editor), so no consumer can reopen it by
  // passing the prop. Walk 20 fixed ONE consumer by deleting its prop; that
  // left the class open and the Bench kept printing zeros.
  if (text.length === 0) return null;

  const barClassName = cn(
    "flex min-w-0 shrink-0 items-center border-t border-border bg-muted/30 text-muted-foreground font-mono tabular-nums",
    compact ? "min-h-7 px-2 py-1 text-[10px]" : "min-h-8 px-4 py-1.5 text-xs",
    className,
  );

  if (density === "collapsed") {
    return (
      <div
        ref={containerRef}
        className={cn(barClassName, "justify-start")}
        aria-live="polite"
        aria-label="Plain text statistics"
        style={{ paddingRight: reserveRightSpace || undefined }}
      >
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="View text statistics"
            >
              <BarChart3 className="h-3.5 w-3.5 shrink-0" />
              <span className="text-foreground/90">
                {stats.charCount.toLocaleString()}
              </span>
              <span>{metricLabel("charCount", stats.charCount)}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent /* sizing: fixed — fixed metric tag list */ align="start" side="top" className="w-56 p-0">
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              Text stats
            </div>
            <MetricsDetailList stats={stats} metrics={metrics} />
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  const visibleMetrics =
    density === "minimal"
      ? metrics.filter((key) => MINIMAL_METRICS.includes(key))
      : metrics;

  const gapClass = compact ? "gap-x-2 gap-y-0.5" : "gap-x-3 gap-y-0.5";

  return (
    <div
      ref={containerRef}
      className={cn(barClassName, "flex-wrap", gapClass)}
      aria-live="polite"
      aria-label="Plain text statistics"
      style={{ paddingRight: reserveRightSpace || undefined }}
    >
      {visibleMetrics.map((key) => (
        <MetricChip
          key={key}
          value={stats[key]}
          label={
            density === "compact"
              ? METRIC_SHORT_LABELS[key]
              : metricLabel(key, stats[key])
          }
          title={METRIC_TITLES[key]}
          icon={METRIC_ICONS[key]}
          iconOnly={density === "minimal"}
        />
      ))}

      {density === "minimal" && metrics.length > MINIMAL_METRICS.length ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center rounded-sm px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="View all text statistics"
            >
              <BarChart3 className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent /* sizing: fixed — fixed metric tag list */ align="end" side="top" className="w-56 p-0">
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              Text stats
            </div>
            <MetricsDetailList stats={stats} metrics={metrics} />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
