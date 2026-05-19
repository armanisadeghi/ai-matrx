"use client";

// features/rich-document/variants/ActionBar.tsx
//
// Full inline action bar: row of primary-slot icon buttons followed by the
// ⋯ overflow menu. Used by the "bar" variant and by RichDocumentActionSurface
// when its `variant` prop is "bar".
//
// Mirrors AssistantActionBar's layout (`features/agents/components/
// messages-display/assistant/AssistantActionBar.tsx`) but is fully data-
// driven from the action registry.

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PrimaryButtons } from "./shared/PrimaryButtons";
import { OverflowMenu } from "./OverflowMenu";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../types";

export interface ActionBarProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  className?: string;
}

export function ActionBar(props: ActionBarProps): React.ReactElement {
  const { actions, getCtx, className } = props;
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "inline-flex items-center gap-1 px-1 py-1",
          className,
        )}
      >
        <PrimaryButtons actions={actions} getCtx={getCtx} size="sm" />
        <OverflowMenu actions={actions} getCtx={getCtx} />
      </div>
    </TooltipProvider>
  );
}

export default ActionBar;
