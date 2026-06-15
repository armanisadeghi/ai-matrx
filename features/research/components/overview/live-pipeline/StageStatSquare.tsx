"use client";

import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageState } from "../../../hooks/usePipelineProgress";
import {
  STAGE_ICON,
  STAGE_LABEL,
  STAGE_ROUTE,
  stageDuration,
  stageSquareData,
} from "./stageMeta";

/**
 * A finished stage, collapsed into a compact, animated stat square. As each
 * stage completes it docks into the rail (left → right in pipeline order) so
 * the active stage stays front-and-center while the finished work reads as a
 * row of "keywords → sources → scraped → analyses → syntheses" outcomes.
 * Clicking opens that stage's results.
 */
export function StageStatSquare({
  stage,
  base,
}: {
  stage: StageState;
  base: string;
}) {
  const Icon = STAGE_ICON[stage.kind];
  const data = stageSquareData(stage);
  const dur = stageDuration(stage);

  const failed = stage.status === "failed";
  const partial = stage.status === "partial";
  const StatusIcon = failed ? XCircle : partial ? AlertTriangle : CheckCircle2;

  return (
    <Link
      href={`${base}/${STAGE_ROUTE[stage.kind]}`}
      className={cn(
        "animate-in fade-in zoom-in-95 duration-300",
        "relative flex w-[8.75rem] shrink-0 flex-col gap-0.5 rounded-xl border p-2.5",
        "backdrop-blur-sm transition-colors hover:bg-card/80",
        failed
          ? "border-destructive/30 bg-destructive/[0.06]"
          : partial
            ? "border-amber-500/30 bg-amber-500/[0.06]"
            : "border-green-500/30 bg-green-500/[0.06]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0 text-foreground/60" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {STAGE_LABEL[stage.kind]}
        </span>
        <StatusIcon
          className={cn(
            "ml-auto h-3 w-3 shrink-0",
            failed
              ? "text-destructive"
              : partial
                ? "text-amber-500"
                : "text-green-500",
          )}
        />
      </div>

      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-xl font-bold leading-none tabular-nums">
          {data.value}
        </span>
        <span className="text-[11px] text-muted-foreground">{data.unit}</span>
      </div>

      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] text-muted-foreground/80">
          {data.sub}
        </span>
        {dur && (
          <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/50">
            {dur}
          </span>
        )}
      </div>
    </Link>
  );
}
