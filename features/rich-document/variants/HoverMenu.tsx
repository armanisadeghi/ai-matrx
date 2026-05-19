"use client";

// features/rich-document/variants/HoverMenu.tsx
//
// "hover-menu" variant — the ⋯ trigger is absolutely positioned in the
// top-right corner and fades in only when the parent container is hovered.
// Same actions as MenuVariant; differs only in placement.
//
// Place inside a positioned parent (relative / absolute) and add the
// Tailwind `group` class to that parent so the hover-target selector
// works. RichDocument adds `group` to its root when this variant is in use.

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { OverflowMenu } from "./OverflowMenu";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../types";

export interface HoverMenuProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  className?: string;
}

export function HoverMenu(props: HoverMenuProps): React.ReactElement {
  const { actions, getCtx, className } = props;
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          // Absolutely positioned in the top-right.
          "absolute right-1 top-1 z-10",
          // Fade in on parent hover. Requires `group` on parent.
          "opacity-0 transition-opacity",
          "group-hover:opacity-100 focus-within:opacity-100",
          className,
        )}
      >
        <OverflowMenu
          actions={actions}
          getCtx={getCtx}
          includePrimarySlot
        />
      </div>
    </TooltipProvider>
  );
}

export default HoverMenu;
