"use client";

/**
 * SitePipelineStrip — the site-level pipeline, in the toolbar's KPI zone.
 *
 * Arman, 2026-08-21: the same steps the page rail shows must exist at the top
 * level, "true for any website or any page". This strip renders the eight
 * server-derived site stages (see aidream `content_plan/site_pipeline.py`) as
 * compact chips: state icon + label + done/total where the stage is per-page
 * work. Every count is the server's own live derivation — nothing here invents
 * state, and nothing is stamped.
 *
 * It REPLACES the old "X/N built · Y live" text in PlanToolbar — the same zone
 * of the ONE chrome row (ruling 2026-08-17: extend the toolbar, never add a
 * strip), telling the richer version of the same truth. Each chip is also a
 * door: clicking jumps to the view where that stage's work happens.
 */
import {
  AlertCircle,
  Check,
  ChevronRight,
  Circle,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { SitePipelineStage } from "../setup/bridge";

function StageIcon({ state }: { state: SitePipelineStage["state"] }) {
  switch (state) {
    case "complete":
      return <Check className="h-3 w-3 text-primary" aria-hidden />;
    case "attention":
      return (
        <AlertCircle
          className="h-3 w-3 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
      );
    case "in_progress":
      return (
        <Circle
          className="h-3 w-3 fill-primary/30 text-primary"
          aria-hidden
        />
      );
    default:
      return <Circle className="h-3 w-3 text-muted-foreground" aria-hidden />;
  }
}

export function SitePipelineStrip({
  stages,
  isLoading,
  onSelectStage,
}: {
  stages: SitePipelineStage[] | null;
  isLoading: boolean;
  /** Jump to where this stage's work happens. */
  onSelectStage?: (key: string) => void;
}) {
  if (!stages || stages.length === 0) {
    // Honesty over decoration: no zeros while loading, nothing on error —
    // the toolbar simply has no pipeline zone until the truth arrives.
    return isLoading ? (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Reading the site's pipeline…
      </span>
    ) : null;
  }
  return (
    <span className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
      {stages.map((stage, index) => {
        const perPage = stage.total > 0 && stage.done !== stage.total;
        return (
          <span key={stage.key} className="flex shrink-0 items-center">
            {index > 0 ? (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-muted-foreground/50"
                aria-hidden
              />
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectStage?.(stage.key)}
                  className={cn(
                    "h-6 shrink-0 gap-1 rounded-full px-1.5 text-[11px] font-medium",
                    stage.state === "not_started" && "text-muted-foreground",
                    stage.state === "attention" &&
                      "text-amber-700 dark:text-amber-400",
                  )}
                >
                  <StageIcon state={stage.state} />
                  {stage.label}
                  {perPage ? (
                    <span className="text-muted-foreground">
                      {stage.done}/{stage.total}
                    </span>
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs space-y-1">
                <p className="font-medium text-popover-foreground">
                  {stage.label}
                </p>
                <p className="text-muted-foreground">{stage.detail}</p>
                {stage.missing.length > 0 ? (
                  <p className="text-amber-600 dark:text-amber-400">
                    Missing: {stage.missing.join("; ")}
                  </p>
                ) : null}
                {onSelectStage ? (
                  <p className="text-muted-foreground">
                    Click to go where this happens.
                  </p>
                ) : null}
              </TooltipContent>
            </Tooltip>
          </span>
        );
      })}
    </span>
  );
}
