"use client";

import { useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectIsOverlayOpen,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { useMenuCheckboxId } from "./menuCheckboxId";

export function AdminIndicatorMenuItem() {
  const dispatch = useAppDispatch();
  const menuCheckboxId = useMenuCheckboxId();
  const isOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  // ADMIN POWER: the indicator it toggles exists only inside the admin
  // section (utils/supabase/adminLane.ts), so the entry does too — never a
  // switch for something that cannot appear.
  const canUse = useAppSelector(selectIsSuperAdmin);

  const handleClick = useCallback(() => {
    dispatch(toggleOverlay({ overlayId: "adminIndicator" }));
  }, [dispatch]);

  if (!canUse) return null;

  return (
    <label htmlFor={menuCheckboxId} className="block">
      <button
        className={cn(MENU_ITEM_CLASS, "[&_svg]:text-amber-500")}
        onClick={handleClick}
      >
        {isOpen ? <EyeOff /> : <Eye />}
        {isOpen ? "Hide" : "Show"} Admin Indicator
      </button>
    </label>
  );
}
