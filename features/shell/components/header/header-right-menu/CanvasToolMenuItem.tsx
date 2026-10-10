"use client";

import { cn } from "@/lib/utils";
import { useQuickToolToggle, type QuickToolKind } from "@/features/canvas/host/quickToolLaunchers";
import { getMenuIcon, type MenuIconKey } from "./menuIconRegistry";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { MenuItemCloseLabel } from "./menuCheckboxId";

interface CanvasToolMenuItemProps {
  canvasTool: QuickToolKind;
  icon: MenuIconKey;
  label: string;
  className?: string;
}

/** A menu row that toggles a Quick Access tool's canvas tab. */
export function CanvasToolMenuItem({ canvasTool, icon, label, className }: CanvasToolMenuItemProps) {
  const { isVisible, toggle } = useQuickToolToggle(canvasTool);
  const Icon = getMenuIcon(icon);
  return (
    <MenuItemCloseLabel>
      <button className={cn(MENU_ITEM_CLASS, "aria-pressed:bg-[var(--matrx-glass-bg-hover)] aria-pressed:font-medium", className)} aria-pressed={isVisible}
        onClick={toggle}>
        <Icon />
        {label}
      </button>
    </MenuItemCloseLabel>
  );
}
