"use client";

/**
 * DesktopPresenceIndicator — bound-compute affordance in the smart-input toolbar.
 * Renders ONLY when a sandbox or local PC is verified and bound; unbound state
 * is managed via the `+` menu's ComputeLensBar row.
 */

import { Box, Loader2, Monitor, Unplug } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ComputeTarget } from "@/hooks/sandbox/use-compute-targets";
import {
  computeTargetIconColor,
  computeTargetKindLabel,
  useComputeTargetActions,
} from "./use-compute-target-actions";

interface DesktopPresenceIndicatorProps {
  conversationId: string;
}

function TargetIcon({
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

export function DesktopPresenceIndicator({
  conversationId,
}: DesktopPresenceIndicatorProps) {
  const {
    loading,
    boundTarget,
    availableTargets,
    applyBinding,
    disabled,
    sandboxBlocked,
  } = useComputeTargetActions(conversationId);

  if (sandboxBlocked || !boundTarget) return null;

  const Icon = boundTarget.kind === "local-pc" ? Monitor : Box;
  const iconColor = computeTargetIconColor(boundTarget, true);
  const kindLabel = computeTargetKindLabel(boundTarget.kind);
  const tooltip = `${kindLabel} connected: ${boundTarget.name}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={tooltip}
          aria-label={tooltip}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${iconColor} bg-muted/60 hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:hover:bg-transparent`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-56 overflow-hidden p-1.5"
      >
        <div className="mb-1 border-b px-1.5 pb-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Connected
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
              <TargetIcon
                kind={boundTarget.kind}
                className={`h-3.5 w-3.5 shrink-0 ${iconColor}`}
              />
              <span className="truncate">{boundTarget.name}</span>
            </span>
            <button
              type="button"
              onClick={() => applyBinding(null)}
              className="text-muted-foreground hover:text-destructive"
              title="Disconnect"
            >
              <Unplug className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {availableTargets.length > 0 ? (
          <>
            <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Switch to
            </p>
            <div className="space-y-0.5">
              {availableTargets.map((target) => {
                const color = computeTargetIconColor(target, false);
                const label = computeTargetKindLabel(target.kind);
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => applyBinding(target)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left hover:bg-accent"
                  >
                    <TargetIcon
                      kind={target.kind}
                      className={`h-3.5 w-3.5 shrink-0 ${color}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {target.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
