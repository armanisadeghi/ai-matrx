"use client";

import { motion } from "motion/react";
import {
  Globe,
  BookOpen,
  Type,
  Brain,
  FileText,
  DollarSign,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  return [
    {
      key: "sources",
      label: "Sources found",
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
      label: "Characters processed",
      value: input.characters,
      icon: Type,
      format: "compact",
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
      label: "Syntheses & reports",
      value: input.reports,
      icon: FileText,
      format: "int",
      accent: "text-amber-500",
    },
    {
      key: "cost",
      label: "Total cost",
      value: input.totalCostUsd,
      icon: DollarSign,
      format: "usd",
      accent: "text-emerald-500",
      hint: "what the research bought",
      prominent: true,
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

function MetricTile({ metric, index }: { metric: HeroMetric; index: number }) {
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
        metric.prominent && "sm:col-span-2",
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
        <span className="text-[11px] font-medium uppercase tracking-wide truncate">
          {metric.label}
        </span>
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

export function ResultsHeroMetrics({ metrics }: { metrics: HeroMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
      {metrics.map((m, i) => (
        <MetricTile key={m.key} metric={m} index={i} />
      ))}
    </div>
  );
}
