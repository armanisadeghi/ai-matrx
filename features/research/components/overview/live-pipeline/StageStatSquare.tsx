"use client";

import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from "lucide-react";
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
 * A finished stage, collapsed into a compact stat square. Click toggles inline
 * expansion in the live drawer; the external-link affordance opens results.
 */
export function StageStatSquare({
  stage,
  base,
  expanded = false,
  onToggle,
}: {
  stage: StageState;
  base: string;
  /** When set, the square toggles inline stage detail instead of navigating. */
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const Icon = STAGE_ICON[stage.kind];
  const data = stageSquareData(stage);
  const dur = stageDuration(stage);
  const href = `${base}/${STAGE_ROUTE[stage.kind]}`;

  const failed = stage.status === "failed";
  const partial = stage.status === "partial";
  const StatusIcon = failed ? XCircle : partial ? AlertTriangle : CheckCircle2;

  const squareClass = cn(
    "animate-in fade-in zoom-in-95 duration-300",
    "relative flex w-[8.75rem] shrink-0 flex-col gap-0.5 rounded-xl border p-2.5",
    "backdrop-blur-sm transition-colors",
    onToggle ? "cursor-pointer" : "hover:bg-card/80",
    expanded && onToggle && "ring-2 ring-primary/40",
    failed
      ? "border-destructive/30 bg-destructive/[0.06]"
      : partial
        ? "border-amber-500/30 bg-amber-500/[0.06]"
        : "border-green-500/30 bg-green-500/[0.06]",
    onToggle && !expanded && "hover:bg-card/80",
  );

  const inner = (
    <>
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
    </>
  );

  if (onToggle) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          className={squareClass}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Collapse ${STAGE_LABEL[stage.kind]} details`
              : `Expand ${STAGE_LABEL[stage.kind]} details`
          }
        >
          {inner}
        </button>
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
          aria-label={`Open ${STAGE_LABEL[stage.kind]} results`}
        >
          <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </div>
    );
  }

  return (
    <Link href={href} className={cn(squareClass, "hover:bg-card/80")}>
      {inner}
    </Link>
  );
}
