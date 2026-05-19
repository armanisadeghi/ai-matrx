"use client";

// features/rich-document/variants/MiniActionBar.tsx
//
// Condensed action bar — icons only, smaller hit targets. Used for dense
// surfaces (Notes previews, prompt toasts, embedded blocks).

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PrimaryButtons } from "./shared/PrimaryButtons";
import { OverflowMenu } from "./OverflowMenu";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../types";

export interface MiniActionBarProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  className?: string;
}

export function MiniActionBar(
  props: MiniActionBarProps,
): React.ReactElement {
  const { actions, getCtx, className } = props;
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "inline-flex items-center gap-0.5 px-0.5 py-0.5",
          className,
        )}
      >
        <PrimaryButtons actions={actions} getCtx={getCtx} size="xs" />
        <OverflowMenu actions={actions} getCtx={getCtx} triggerSize="icon" />
      </div>
    </TooltipProvider>
  );
}

export default MiniActionBar;
