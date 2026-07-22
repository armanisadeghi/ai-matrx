"use client";

import { Loader2, CheckCircle2, AlertCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { StageState } from "../../../../hooks/usePipelineProgress";

interface Props {
  title: string;
  icon: React.ReactNode;
  stage: StageState;
  /** Optional subtitle line (e.g., "789 sources discovered"). */
  subtitle?: React.ReactNode;
  /** Optional ETA in seconds. */
  etaSeconds?: number | null;
  /** Optional rate (per sec). */
  ratePerSec?: number;
  className?: string;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StageHeader({
  title,
  icon,
  stage,
  subtitle,
  etaSeconds,
  ratePerSec,
  className,
}: Props) {
  const target = stage.totals.target;
  const done = stage.totals.succeeded + stage.totals.failed;
  const percent = target ? Math.min(100, Math.round((done / target) * 100)) : 0;

  let StatusIcon = Circle;
  let statusColor = "text-muted-foreground";
  if (stage.status === "active") {
    StatusIcon = Loader2;
    statusColor = "text-primary";
  } else if (stage.status === "complete") {
    StatusIcon = CheckCircle2;
    statusColor = "text-green-500";
  } else if (stage.status === "failed") {
    StatusIcon = AlertCircle;
    statusColor = "text-destructive";
  } else if (stage.status === "partial") {
    StatusIcon = AlertCircle;
    statusColor = "text-amber-500";
  }
  // `skipped` keeps the muted Circle — stage was walked past with no work.

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("shrink-0", statusColor)}>
            <StatusIcon
              className={cn(
                "h-4 w-4",
                stage.status === "active" && "animate-spin",
              )}
            />
          </span>
          <span className="text-foreground/80 shrink-0">{icon}</span>
          <h3 className="text-sm font-semibold truncate">{title}</h3>
          {target ? (
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
              {done} / {target}
            </span>
          ) : done > 0 ? (
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
              {done} done
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums shrink-0">
          {ratePerSec && ratePerSec > 0.1 ? (
            <span>{ratePerSec.toFixed(1)}/sec</span>
          ) : null}
          {etaSeconds != null ? <span>ETA {formatEta(etaSeconds)}</span> : null}
        </div>
      </div>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      )}
      {target ? <Progress value={percent} className="h-1" /> : null}
    </div>
  );
}
