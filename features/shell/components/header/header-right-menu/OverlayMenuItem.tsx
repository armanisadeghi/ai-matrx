"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { cn } from "@/lib/utils";
import type { OverlayId } from "@/features/overlays/catalogue";
import { getMenuIcon, type MenuIconKey } from "./menuIconRegistry";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { MenuItemCloseLabel } from "./menuCheckboxId";

interface OverlayMenuItemProps {
  overlayId: OverlayId;
  icon: MenuIconKey;
  label: string;
  className?: string;
}

export function OverlayMenuItem({
  overlayId,
  icon,
  label,
  className,
}: OverlayMenuItemProps) {
  const dispatch = useAppDispatch();
  const Icon = getMenuIcon(icon);

  const handleClick = useCallback(() => {
    dispatch(openOverlay({ overlayId }));
  }, [dispatch, overlayId]);

  return (
    <MenuItemCloseLabel>
      <button className={cn(MENU_ITEM_CLASS, className)} onClick={handleClick}>
        <Icon />
        {label}
      </button>
    </MenuItemCloseLabel>
  );
}
