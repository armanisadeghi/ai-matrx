"use client";

import { cn } from "@/lib/utils";
import { useOpenQuickTool, type QuickToolKind } from "@/features/canvas/host/toolKinds";
import { getMenuIcon, type MenuIconKey } from "./menuIconRegistry";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { MenuItemCloseLabel } from "./menuCheckboxId";

interface CanvasToolMenuItemProps {
  canvasTool: QuickToolKind;
  icon: MenuIconKey;
  label: string;
  className?: string;
}

/** A menu row that opens a Quick Access tool as a canvas tab. */
export function CanvasToolMenuItem({ canvasTool, icon, label, className }: CanvasToolMenuItemProps) {
  const openTool = useOpenQuickTool();
  const Icon = getMenuIcon(icon);
  return (
    <MenuItemCloseLabel>
      <button className={cn(MENU_ITEM_CLASS, className)} onClick={() => openTool(canvasTool)}>
        <Icon />
        {label}
      </button>
    </MenuItemCloseLabel>
  );
}
