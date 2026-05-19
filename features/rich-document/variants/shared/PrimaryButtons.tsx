"use client";

// features/rich-document/variants/shared/PrimaryButtons.tsx
//
// Renders the inline row of "primary" + "both" actions as icon buttons
// with tooltips. Used by ActionBar (full size) and MiniActionBar (small).
//
// Each button calls action.run(getCtx()) on click. Disabled state is
// evaluated lazily via action.disabled?.(ctx).

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { resolveActionLabel } from "../../actions/utils";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../../types";

export interface PrimaryButtonsProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  /** Defaults to "sm" for ActionBar, "xs" for MiniActionBar. */
  size?: "sm" | "xs";
  className?: string;
}

export function PrimaryButtons(props: PrimaryButtonsProps): React.ReactElement {
  const { actions, getCtx, size = "sm", className } = props;

  const primary = actions.filter((a) => {
    const slot = a.renderSlot ?? "overflow";
    return slot === "primary" || slot === "both";
  });

  if (primary.length === 0) return <></>;

  const ctxForLabels = getCtx();
  const buttonHeight = size === "xs" ? "h-7 w-7" : "h-8 w-8";
  const iconSize = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      {primary.map((action) => {
        const Icon = action.icon;
        const labelText = resolveActionLabel(action.label, ctxForLabels);
        const disabledResult = action.disabled?.(ctxForLabels);
        const isDisabled =
          disabledResult === true ||
          (typeof disabledResult === "object" && disabledResult !== null);
        const disabledReason =
          typeof disabledResult === "object" && disabledResult !== null
            ? disabledResult.reason
            : undefined;
        const tooltipText = disabledReason ?? labelText;

        return (
          <Tooltip key={action.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={isDisabled}
                aria-label={labelText}
                className={cn(buttonHeight, "p-0")}
                onClick={() => {
                  const ctx = getCtx();
                  void Promise.resolve(action.run(ctx)).catch(
                    (err: unknown) => {
                       
                      console.error(
                        `[RichDocument] primary action ${action.id} threw`,
                        err,
                      );
                    },
                  );
                }}
              >
                <Icon className={cn(iconSize, action.iconColor)} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{tooltipText}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default PrimaryButtons;
