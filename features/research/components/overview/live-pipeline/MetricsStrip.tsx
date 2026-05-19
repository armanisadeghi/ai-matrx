"use client";

import {
  Globe,
  Download,
  Brain,
  Cpu,
  Zap,
  Gauge,
  DollarSign,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PipelineDerived,
  PipelineState,
} from "../../../hooks/usePipelineProgress";

interface Props {
  state: PipelineState;
  derived: PipelineDerived;
  /** Authoritative cost from backend cost_summary, when available. */
  authoritativeCostUsd: number | null;
}

function formatBytes(chars: number): string {
  // Approximate "chars ≈ bytes" for English text. Good enough for a metrics strip.
  if (chars < 1024) return `${chars} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`;
  return `${(chars / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function MetricChip({
  icon: Icon,
  label,
  value,
  hint,
  iconColor,
  warn,
}: {
  icon: typeof Globe;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  iconColor?: string;
  warn?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <Icon className={cn("h-3 w-3 shrink-0", iconColor ?? "text-muted-foreground")} />
      <span
        className={cn(
          "tabular-nums font-medium",
          warn ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
      {hint && <span className="text-muted-foreground/70">{hint}</span>}
    </span>
  );
}

export function MetricsStrip({ state, derived, authoritativeCostUsd }: Props) {
  const errors =
    state.stages.scrape.totals.failed +
    state.stages.analyze.totals.failed +
    state.stages.synthesize.totals.failed;

  const cost =
    authoritativeCostUsd != null ? authoritativeCostUsd : derived.runningCostUsd;
  const isEstimate = authoritativeCostUsd == null && state.completedAt == null;

  return (
    <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 px-3 py-2 border-b border-border/30 bg-card/30">
      <MetricChip
        icon={Globe}
        iconColor="text-blue-500"
        label="sources"
        value={derived.totalSourcesDiscovered.toLocaleString()}
      />
      <MetricChip
        icon={Download}
        iconColor="text-emerald-500"
        label="content"
        value={state.stages.scrape.totals.succeeded.toLocaleString()}
        hint={
          derived.totalCharsScraped > 0 ? `(${formatBytes(derived.totalCharsScraped)})` : null
        }
      />
      <MetricChip
        icon={Brain}
        iconColor="text-purple-500"
        label="analyses"
        value={derived.totalAnalysesCompleted.toLocaleString()}
      />
      <MetricChip
        icon={Cpu}
        iconColor="text-orange-500"
        label={`model${derived.uniqueModels.length === 1 ? "" : "s"}`}
        value={derived.uniqueModels.length}
      />
      <MetricChip
        icon={Zap}
        iconColor="text-cyan-500"
        label={`agent${derived.uniqueAgents.length === 1 ? "" : "s"}`}
        value={derived.uniqueAgents.length}
      />
      {derived.rate > 0.1 && (
        <MetricChip
          icon={Gauge}
          iconColor="text-yellow-500"
          label="ops/sec"
          value={derived.rate.toFixed(1)}
        />
      )}
      <MetricChip
        icon={DollarSign}
        iconColor="text-green-500"
        label={isEstimate ? "spent (est.)" : "spent"}
        value={formatCost(cost)}
      />
      {errors > 0 && (
        <MetricChip
          icon={AlertTriangle}
          iconColor="text-destructive"
          label="errors"
          value={errors}
          warn
        />
      )}
    </div>
  );
}
