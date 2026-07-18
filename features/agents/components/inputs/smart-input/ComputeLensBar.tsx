"use client";

/**
 * ComputeLensBar — condensed sandbox / local-PC row for the `+` attach menu.
 * Mirrors ContextLensBar: one pill, left label zone, up to two inline target
 * chips, overflow + chevron opens the full Sandbox panel in run-controls window.
 */

import { Box, ChevronDown, Loader2, Monitor } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ComputeTarget } from "@/hooks/sandbox/use-compute-targets";
import {
  computeTargetIconColor,
  computeTargetKindLabel,
  useComputeTargetActions,
} from "./use-compute-target-actions";

export interface ComputeLensBarProps {
  conversationId: string;
  /** Opens run-controls window on the Sandbox tab. */
  onOpenPanel: () => void;
  className?: string;
}

function TargetGlyph({
  kind,
  className,
}: {
  kind: ComputeTarget["kind"];
  className?: string;
}) {
  return kind === "local-pc" ? (
    <Monitor className={className} />
  ) : (
    <Box className={className} />
  );
}

function TargetChip({
  target,
  isBound,
  onSelect,
}: {
  target: ComputeTarget;
  isBound: boolean;
  onSelect: () => void;
}) {
  const color = computeTargetIconColor(target, isBound);
  const kindLabel = computeTargetKindLabel(target.kind);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            "inline-flex h-5 max-w-[7.5rem] min-w-0 items-center gap-1 rounded-full px-1.5 transition-colors",
            isBound
              ? "bg-muted/80 hover:bg-muted"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
          aria-label={
            isBound
              ? `${kindLabel} connected: ${target.name}. Open compute settings.`
              : `Connect ${kindLabel}: ${target.name}`
          }
        >
          <TargetGlyph
            kind={target.kind}
            className={cn("h-3 w-3 shrink-0", color)}
          />
          <span
            className={cn("truncate text-[11px] font-medium", isBound && color)}
          >
            {target.name}
          </span>
          {isBound ? (
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                target.kind === "local-pc" ? "bg-blue-500" : "bg-emerald-500",
              )}
            />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isBound
          ? `${kindLabel} connected — click to manage`
          : `Use ${kindLabel}: ${target.name}`}
      </TooltipContent>
    </Tooltip>
  );
}

export function ComputeLensBar({
  conversationId,
  onOpenPanel,
  className,
}: ComputeLensBarProps) {
  const {
    loading,
    boundTarget,
    visibleTargets,
    overflowCount,
    totalCount,
    applyBinding,
    disabled,
  } = useComputeTargetActions(conversationId);

  const handleChipClick = (target: ComputeTarget) => {
    const isBound = boundTarget?.id === target.id;
    if (isBound) {
      onOpenPanel();
      return;
    }
    applyBinding(target);
  };

  return (
    <div
      className={cn(
        "inline-flex h-7 min-w-0 items-center rounded-full border border-border bg-card pl-1 pr-0.5 text-xs",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenPanel}
            disabled={disabled && !loading}
            className={cn(
              "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 transition-colors",
              "text-secondary/90 hover:bg-secondary/10 hover:text-secondary",
              disabled && !loading && "cursor-not-allowed opacity-50",
            )}
            aria-label="Open sandbox and computer settings"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Monitor className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">Compute</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {loading
            ? "Checking computers and sandboxes…"
            : totalCount === 0
              ? "Set up a sandbox or local computer"
              : "Manage sandbox and local computer bindings"}
        </TooltipContent>
      </Tooltip>

      {visibleTargets.length > 0 ? (
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border/80" aria-hidden />
      ) : null}

      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {visibleTargets.map((target) => (
          <TargetChip
            key={target.id}
            target={target}
            isBound={boundTarget?.id === target.id}
            onSelect={() => handleChipClick(target)}
          />
        ))}

        {visibleTargets.length === 0 && !loading ? (
          <button
            type="button"
            onClick={onOpenPanel}
            className="inline-flex h-5 items-center rounded-full px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            None available
          </button>
        ) : null}
      </div>

      {(overflowCount > 0 || totalCount > 0) && (
        <button
          type="button"
          onClick={onOpenPanel}
          className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label={
            overflowCount > 0
              ? `${overflowCount} more compute targets — open full list`
              : "Open compute settings"
          }
        >
          {overflowCount > 0 ? (
            <span className="text-[10px] font-medium tabular-nums">
              +{overflowCount}
            </span>
          ) : null}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      )}
    </div>
  );
}
