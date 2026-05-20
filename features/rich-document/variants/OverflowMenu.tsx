"use client";

// features/rich-document/variants/OverflowMenu.tsx
//
// The ⋯ overflow menu. On desktop renders a Radix dropdown with a two-level
// hierarchy (promoted top-level items + submenus). On mobile delegates to
// MobileActionDrawer (bottom sheet + accordion). Both render from the same
// buildMenuTree(MENU_STRUCTURE) output so the layout stays consistent.
//
// Shared across the "bar", "mini-bar", "menu", and "icon-only" variants —
// they differ only in what wraps this and where the trigger sits.

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildMenuTree } from "./shared/menuStructure";
import { DropdownMenuTree } from "./shared/DropdownMenuTree";
import { MobileActionDrawer } from "./MobileActionDrawer";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../types";

export interface OverflowMenuProps {
  actions: RichDocumentAction[];
  /** Called to get a fresh context at click time. */
  getCtx: () => RichDocumentActionContext;
  /** When true, includes "primary" slot actions too (used by menu/icon-only variants). */
  includePrimarySlot?: boolean;
  className?: string;
  /** Aria label override for the trigger. */
  triggerAriaLabel?: string;
  /** Trigger button size — defaults to icon. */
  triggerSize?: "default" | "sm" | "icon";
}

/** Filter to actions that belong in the overflow menu per their slot. */
function overflowActions(
  actions: RichDocumentAction[],
  includePrimarySlot: boolean,
): RichDocumentAction[] {
  return actions.filter((a) => {
    const slot = a.renderSlot ?? "overflow";
    if (slot === "overflow" || slot === "both") return true;
    if (slot === "primary" && includePrimarySlot) return true;
    return false;
  });
}

export function OverflowMenu(props: OverflowMenuProps): React.ReactElement {
  const {
    actions,
    getCtx,
    includePrimarySlot = false,
    className,
    triggerAriaLabel = "More actions",
    triggerSize = "icon",
  } = props;

  const isMobile = useIsMobile();
  const menuActions = overflowActions(actions, includePrimarySlot);

  // No actions to show? Hide the trigger entirely.
  if (menuActions.length === 0) return <></>;

  // Mobile → bottom-sheet drawer.
  if (isMobile) {
    return (
      <MobileActionDrawer
        actions={menuActions}
        getCtx={getCtx}
        className={className}
        triggerAriaLabel={triggerAriaLabel}
      />
    );
  }

  // Desktop → dropdown with submenus (shared tree renderer).
  const ctxForLabels = getCtx();
  const tree = buildMenuTree(menuActions);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={triggerSize}
          className={cn("h-8 w-8 p-0", className)}
          aria-label={triggerAriaLabel}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuTree
          tree={tree}
          getCtx={getCtx}
          ctxForLabels={ctxForLabels}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default OverflowMenu;
