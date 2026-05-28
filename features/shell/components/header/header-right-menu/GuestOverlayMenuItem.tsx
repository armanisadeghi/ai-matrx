"use client";

import { createElement, useCallback } from "react";
import { Lock } from "lucide-react";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";
import { cn } from "@/lib/utils";
import { getMenuIcon, type MenuIconKey } from "./menuIconRegistry";
import { MENU_ITEM_CLASS } from "./menuItemClass";

interface GuestOverlayMenuItemProps {
  icon: MenuIconKey;
  label: string;
  className?: string;
}

/**
 * Visual twin of `OverlayMenuItem` for unauthenticated visitors: instead of
 * dispatching the overlay, click opens `AuthGateDialog` carrying the item's
 * label as `featureName`. A small lock affordance appears on hover.
 */
export function GuestOverlayMenuItem({
  icon,
  label,
  className,
}: GuestOverlayMenuItemProps) {
  const openAuthGate = useOpenAuthGateDialog();

  const handleClick = useCallback(() => {
    openAuthGate({ featureName: label });
  }, [openAuthGate, label]);

  return (
    <label htmlFor="shell-user-menu" className="block">
      <button
        className={cn(MENU_ITEM_CLASS, "group", className)}
        onClick={handleClick}
      >
        {createElement(getMenuIcon(icon))}
        <span className="flex-1 text-left">{label}</span>
        <Lock
          className="w-3 h-3 shrink-0 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden="true"
        />
      </button>
    </label>
  );
}
