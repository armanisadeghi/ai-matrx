"use client";

// features/rich-document/variants/MenuVariant.tsx
//
// "menu" variant — just the ⋯ overflow trigger, no primary buttons row.
// Primary-slot actions get promoted into the overflow menu so nothing is
// hidden. Used by tight surfaces that have room for one chrome element.

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { OverflowMenu } from "./OverflowMenu";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../types";

export interface MenuVariantProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  className?: string;
}

export function MenuVariant(props: MenuVariantProps): React.ReactElement {
  const { actions, getCtx, className } = props;
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("inline-flex items-center", className)}>
        <OverflowMenu
          actions={actions}
          getCtx={getCtx}
          includePrimarySlot
        />
      </div>
    </TooltipProvider>
  );
}

export default MenuVariant;
