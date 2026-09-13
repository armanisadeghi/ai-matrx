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
import { AlchemyDocumentMenu } from "./shared/AlchemyDocumentMenu";
import { PrimaryButtons } from "./shared/PrimaryButtons";
import { OverflowMenu } from "./OverflowMenu";
import type { RichDocumentAction, RichDocumentActionContext } from "../types";

export interface ActionBarProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  sourceId: string;
  className?: string;
}

export function ActionBar(props: ActionBarProps): React.ReactElement {
  const { actions, getCtx, sourceId, className } = props;
  const nonTransferActions = actions.filter(
    (action) => action.category !== "copy",
  );
  const hasCopy = actions.some((action) => action.category === "copy");
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn("inline-flex items-center gap-1 px-1 py-1", className)}
      >
        {hasCopy ? (
          <AlchemyDocumentMenu
            key={sourceId}
            getCtx={getCtx}
            sourceId={sourceId}
            size="sm"
          />
        ) : null}
        <PrimaryButtons
          actions={nonTransferActions}
          getCtx={getCtx}
          size="sm"
        />
        <OverflowMenu actions={nonTransferActions} getCtx={getCtx} />
      </div>
    </TooltipProvider>
  );
}

export default ActionBar;
