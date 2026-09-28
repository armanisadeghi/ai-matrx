"use client";

import { useCallback } from "react";
import { CircleDollarSign, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { selectShowCostInUsdPreference } from "@/components/cost/useCostDisplay";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { MenuItemCloseLabel } from "./menuCheckboxId";

/**
 * The system-admin switch between points (everyone's unit) and dollars.
 * Persisted per admin through the synced user preferences; every `<Cost>` on
 * every page follows it. Absent for anyone who is not an admin — the
 * preference would be ignored for them anyway (useCostDisplay).
 */
export function CostUnitMenuItem() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);
  const showUsd = useAppSelector(selectShowCostInUsdPreference);

  const handleClick = useCallback(() => {
    dispatch(
      setModulePreferences({
        module: "system",
        preferences: { showCostInUsd: !showUsd },
      }),
    );
  }, [dispatch, showUsd]);

  if (!isAdmin) return null;

  return (
    <MenuItemCloseLabel>
      <button
        className={cn(MENU_ITEM_CLASS, "[&_svg]:text-amber-500")}
        onClick={handleClick}
      >
        {showUsd ? <Coins /> : <CircleDollarSign />}
        {showUsd ? "Show costs in points" : "Show costs in dollars"}
      </button>
    </MenuItemCloseLabel>
  );
}
