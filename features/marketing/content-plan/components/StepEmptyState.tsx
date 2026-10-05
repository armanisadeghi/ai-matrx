"use client";

/**
 * features/marketing/content-plan/components/StepEmptyState.tsx
 */
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * THE ONE EMPTY STATE for a step that has produced nothing yet — a real
 * bordered component, never gray text floating in a tab (Arman, 2026-08-18).
 * It states the PREREQUISITE, not just the absence, and carries the door or
 * the run action that resolves it. Reused by every step tab and by the
 * publish half of `NodeRealityCard`; never copy it per tab.
 */
export function StepEmptyState({
  line,
  action,
}: {
  line: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ComponentType<{ className?: string }>;
    busy?: boolean;
    disabled?: boolean;
    hint?: string;
  };
}) {
  const Icon = action?.icon;
  const button = action ? (
    <Button
      icon={action.busy ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon aria-hidden />
      ) : null}
      type="button"
      variant="outline"
      className="shrink-0"
      disabled={action.busy || action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  ) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-2">
      <p className="min-w-0 text-xs leading-snug text-muted-foreground">
        {line}
      </p>
      {button && action?.hint ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">{button}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{action.hint}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}
    </div>
  );
}
