"use client";

import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRedundancyGroupLabel } from "../../constants";

interface RedundancyGroupBadgeProps {
  group: string | null;
  className?: string;
}

/**
 * Quiet chip marking a source as part of a near-duplicate cluster (e.g. a law
 * firm's per-city landing pages, a run of LinkedIn posts) — `rs_source.redundancy_group`.
 * Analysis selection spreads its quota ACROSS groups so one cluster can't
 * consume it; this badge is what lets a user scanning the list see "these five
 * are the same page." Renders nothing when ungrouped (null = ungrouped/unique,
 * the common case, not an error state).
 */
export function RedundancyGroupBadge({
  group,
  className,
}: RedundancyGroupBadgeProps) {
  if (!group) return null;
  const label = formatRedundancyGroupLabel(group);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-px text-[10px] font-medium whitespace-nowrap text-muted-foreground",
            className,
          )}
        >
          <Layers className="h-2.5 w-2.5 shrink-0 opacity-70" />
          <span className="truncate max-w-[8rem]">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs">
          Part of a near-duplicate cluster (
          <span className="font-mono">{group}</span>) — sources this similar
          are grouped so analysis spreads its quota across clusters instead of
          one dominating.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
