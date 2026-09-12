"use client";

// features/rich-document/variants/MiniActionBar.tsx
//
// Condensed action bar — icons only, smaller hit targets. Used for dense
// surfaces (Notes previews, prompt toasts, embedded blocks).

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AlchemyDocumentMenu } from "./shared/AlchemyDocumentMenu";
import { PrimaryButtons } from "./shared/PrimaryButtons";
import { OverflowMenu } from "./OverflowMenu";
import type { RichDocumentAction, RichDocumentActionContext } from "../types";

export interface MiniActionBarProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  sourceId: string;
  className?: string;
}

export function MiniActionBar(props: MiniActionBarProps): React.ReactElement {
  const { actions, getCtx, sourceId, className } = props;
  const nonTransferActions = actions.filter(
    (action) => action.category !== "copy",
  );
  const hasCopy = actions.some((action) => action.category === "copy");
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "inline-flex items-center gap-0.5 px-0.5 py-0.5",
          className,
        )}
      >
        {hasCopy ? (
          <AlchemyDocumentMenu
            key={sourceId}
            getCtx={getCtx}
            sourceId={sourceId}
            size="xs"
          />
        ) : null}
        <PrimaryButtons
          actions={nonTransferActions}
          getCtx={getCtx}
          size="xs"
        />
        <OverflowMenu
          actions={nonTransferActions}
          getCtx={getCtx}
          triggerSize="icon"
        />
      </div>
    </TooltipProvider>
  );
}

export default MiniActionBar;
