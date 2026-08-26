"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import ShellIcon from "@/features/shell/components/ShellIcon";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import { iconColorMap } from "@/features/shell/constants/nav-data";
import { cn } from "@/lib/utils";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import {
  FEATURED_METRICS,
  SECONDARY_METRICS,
  type MetricCardConfig,
} from "../constants/metricCards";
import type { DashboardMetrics } from "../types";

function chipClass(color: string): string {
  return iconColorMap[color] ?? iconColorMap.slate;
}

function FeaturedCard({
  cfg,
  value,
  loading,
}: {
  cfg: MetricCardConfig;
  value: number;
  loading: boolean;
}) {
  return (
    <Link
      href={cfg.href}
      data-surface-value={`${cfg.key}_count`}
      className="group flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/40"
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl",
          chipClass(cfg.color),
        )}
      >
        <ShellIcon name={cfg.iconName} size={18} strokeWidth={2} />
      </span>
      <div className="mt-3">
        {loading ? (
          <div className="h-8 w-14 animate-pulse rounded-md bg-muted" />
        ) : (
          <div className="text-3xl font-semibold tabular-nums leading-none text-foreground">
            {value.toLocaleString()}
          </div>
        )}
        <div className="mt-1.5 text-sm font-medium text-foreground">
          {cfg.label}
        </div>
        {!loading && value === 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {cfg.emptyHint}
          </div>
        )}
      </div>
    </Link>
  );
}

function SecondaryPill({
  cfg,
  value,
  loading,
}: {
  cfg: MetricCardConfig;
  value: number;
  loading: boolean;
}) {
  return (
    <Link
      href={cfg.href}
      data-surface-value={`${cfg.key}_count`}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent/50"
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-md",
          chipClass(cfg.color),
        )}
      >
        <ShellIcon name={cfg.iconName} size={12} strokeWidth={2} />
      </span>
      {loading ? (
        <span className="h-4 w-6 animate-pulse rounded bg-muted" />
      ) : (
        <span className="font-semibold tabular-nums text-foreground">
          {value.toLocaleString()}
        </span>
      )}
      <span className="text-muted-foreground">{cfg.label}</span>
    </Link>
  );
}

export function MetricsStrip() {
  const { metrics, isLoading, isError, refetch } = useDashboardMetrics();
  const m = metrics as DashboardMetrics;

  if (isError) {
    return (
      <section
        data-surface-value="metrics"
        className="flex min-h-20 items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3"
        role="alert"
      >
        <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Dashboard metrics couldn’t load
          </p>
          <p className="text-xs text-muted-foreground">
            Your workspace is still available. Try loading the counts again.
          </p>
        </div>
        <RefreshCwTapButton
          variant="transparent"
          ariaLabel="Retry dashboard metrics"
          label="Retry"
          onClick={refetch}
        />
      </section>
    );
  }

  return (
    <section data-surface-value="metrics" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FEATURED_METRICS.map((cfg) => (
          <FeaturedCard
            key={cfg.key}
            cfg={cfg}
            value={m[cfg.key]}
            loading={isLoading}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {SECONDARY_METRICS.map((cfg) => (
          <SecondaryPill
            key={cfg.key}
            cfg={cfg}
            value={m[cfg.key]}
            loading={isLoading}
          />
        ))}
      </div>
    </section>
  );
}
