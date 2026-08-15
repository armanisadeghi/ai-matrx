"use client";

import { motion } from "motion/react";
import {
  Globe,
  BookOpen,
  Type,
  Brain,
  FileText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import {
  csvExportItem,
  jsonExportItem,
} from "@/components/agent-copy/export";
import { humanLines } from "@/features/marketing/lib/copy-payloads";
import {
  researchKpiAttributes,
  researchKpiLines,
  researchLocation,
  type ResearchKpis,
} from "@/features/research/copy";
import {
  useCountUp,
  formatInt,
  formatCompact,
  formatUsd,
} from "./resultsShared";

export interface HeroMetric {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  /** "int" | "compact" | "usd" — how the (animated) number renders. */
  format: "int" | "compact" | "usd";
  /** Tailwind text/border accent for the tile. */
  accent: string;
  /** Optional sub-line under the big number. */
  hint?: string;
  /** Render as a prominent (larger) tile. */
  prominent?: boolean;
}

/**
 * Build the metric tiles from the DB-derived numbers. Everything here is
 * already persisted, so the band is identical on a cold refresh.
 */
export function buildHeroMetrics(input: {
  sources: number;
  includedSources: number;
  pagesRead: number;
  characters: number;
  analyses: number;
  reports: number;
  totalCostUsd: number;
  llmCalls: number;
}): HeroMetric[] {
  // Cost intentionally omitted from the at-a-glance band. Characters render as a
  // plain integer (no decimal). Labels are short so they never truncate.
  return [
    {
      key: "sources",
      label: "Sources",
      value: input.sources,
      icon: Globe,
      format: "int",
      accent: "text-sky-500",
      hint:
        input.includedSources > 0
          ? `${formatInt(input.includedSources)} included`
          : undefined,
      prominent: true,
    },
    {
      key: "pages",
      label: "Pages read",
      value: input.pagesRead,
      icon: BookOpen,
      format: "int",
      accent: "text-violet-500",
    },
    {
      key: "characters",
      label: "Characters",
      value: input.characters,
      icon: Type,
      format: "int",
      accent: "text-cyan-500",
    },
    {
      key: "analyses",
      label: "Analyses",
      value: input.analyses,
      icon: Brain,
      format: "int",
      accent: "text-fuchsia-500",
    },
    {
      key: "reports",
      label: "Reports",
      value: input.reports,
      icon: FileText,
      format: "int",
      accent: "text-amber-500",
    },
    {
      key: "calls",
      label: "LLM calls",
      value: input.llmCalls,
      icon: Sparkles,
      format: "int",
      accent: "text-rose-500",
    },
  ];
}

function MetricValue({
  value,
  format,
  delay,
}: {
  value: number;
  format: HeroMetric["format"];
  delay: number;
}) {
  // Money animates with 2 decimals; compact/int animate as whole numbers and
  // we format the live value each frame.
  const decimals = format === "usd" && value < 1000 ? 2 : 0;
  const animated = useCountUp(value, { decimals, delay });
  const text =
    format === "usd"
      ? formatUsd(animated)
      : format === "compact"
        ? formatCompact(animated)
        : formatInt(animated);
  return <span className="tabular-nums">{text}</span>;
}

/**
 * Envelope every payload from the stat rail carries. The rail IS the page's
 * leading KPI strip, so a per-tile payload states the whole strip too — a
 * single number out of context is not interpretable (the what-I-see law).
 */
export interface HeroMetricsCopyContext {
  /** Surface name for the payload `location`, e.g. `Topic overview — Acme`. */
  surface: string;
  topicId: string;
  kpis: ResearchKpis;
}

/** Readable value for a tile, in the same format the tile renders. */
function metricText(metric: HeroMetric): string {
  return metric.format === "usd"
    ? formatUsd(metric.value)
    : metric.format === "compact"
      ? formatCompact(metric.value)
      : formatInt(metric.value);
}

function MetricTile({
  metric,
  index,
  copyContext,
}: {
  metric: HeroMetric;
  index: number;
  copyContext?: HeroMetricsCopyContext;
}) {
  const Icon = metric.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.06,
        type: "spring",
        stiffness: 220,
        damping: 22,
      }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm",
        "px-4 py-4 sm:px-5 sm:py-5 transition-colors hover:border-border",
      )}
    >
      {/* soft accent glow on hover */}
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-20",
          metric.accent.replace("text-", "bg-"),
        )}
      />
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={cn("h-4 w-4 shrink-0", metric.accent)} />
        <span className="text-[11px] font-medium uppercase tracking-wide whitespace-nowrap">
          {metric.label}
        </span>
        {copyContext && (
          <CopyButtons
            size="xs"
            className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            label={`${metric.label} (research)`}
            human={() =>
              humanLines([
                [metric.label, metricText(metric)],
                [metric.hint ? "Note" : "", metric.hint],
              ])
            }
            agent={() => ({
              kind: "research-topic-metric",
              location: researchLocation(copyContext.surface),
              description: `The "${metric.label}" tile from the research topic stat rail.`,
              data: {
                metric: {
                  key: metric.key,
                  label: metric.label,
                  value: metric.value,
                  rendered: metricText(metric),
                  hint: metric.hint ?? null,
                },
                // A single tile is only meaningful beside the whole strip.
                page_kpis: copyContext.kpis,
              },
              summary: researchKpiLines(copyContext.kpis),
              attributes: {
                ...researchKpiAttributes(copyContext.kpis),
                metric: metric.key,
                topic_id: copyContext.topicId,
              },
            })}
          />
        )}
      </div>
      <div
        className={cn(
          "mt-2 font-bold leading-none text-foreground",
          metric.prominent
            ? "text-4xl sm:text-5xl"
            : "text-3xl sm:text-[2.5rem]",
        )}
      >
        <MetricValue
          value={metric.value}
          format={metric.format}
          delay={0.15 + index * 0.05}
        />
      </div>
      {metric.hint && (
        <div className="mt-1.5 text-[11px] text-muted-foreground/80">
          {metric.hint}
        </div>
      )}
    </motion.div>
  );
}

export function ResultsHeroMetrics({
  metrics,
  copyContext,
}: {
  metrics: HeroMetric[];
  copyContext?: HeroMetricsCopyContext;
}) {
  /** Rows for the rail's own copy/export — ALL tiles, never a visible slice. */
  const metricRows = () =>
    metrics.map((m) => ({
      key: m.key,
      label: m.label,
      value: m.value,
      rendered: metricText(m),
      hint: m.hint ?? null,
    }));

  return (
    <div className="space-y-2">
      {copyContext && (
        <div className="flex items-center justify-end gap-1">
          <CopyButtons
            size="sm"
            label="Research stat rail"
            human={() => researchKpiLines(copyContext.kpis)}
            agent={() => ({
              kind: "research-topic-metrics",
              location: researchLocation(copyContext.surface),
              description:
                "The stat-square rail on the research topic page — every metric tile the user sees.",
              data: {
                tiles: metricRows(),
                page_kpis: copyContext.kpis,
              },
              summary: researchKpiLines(copyContext.kpis),
              attributes: {
                ...researchKpiAttributes(copyContext.kpis),
                tiles: metrics.length,
                topic_id: copyContext.topicId,
              },
            })}
            json={metricRows}
          />
          <ExportMenu
            label="Research stat rail"
            items={[
              jsonExportItem(() => ({
                tiles: metricRows(),
                page_kpis: copyContext.kpis,
              })),
              csvExportItem(metricRows, "CSV (all tiles)", [
                { key: "key", header: "Key" },
                { key: "label", header: "Label" },
                { key: "value", header: "Value" },
                { key: "rendered", header: "Rendered" },
                { key: "hint", header: "Hint" },
              ]),
            ]}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {metrics.map((m, i) => (
          <MetricTile
            key={m.key}
            metric={m}
            index={i}
            copyContext={copyContext}
          />
        ))}
      </div>
    </div>
  );
}
