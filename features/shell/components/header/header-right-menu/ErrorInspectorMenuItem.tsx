"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { useMenuCheckboxId } from "./menuCheckboxId";
import { useToggleErrorInspector } from "@/features/admin/error-inspector/useOpenErrorInspector";
import { useCapturedErrorStats } from "@/lib/diagnostics/useCapturedErrors";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";

/**
 * Admin-menu entry that opens the systemwide Error Inspector. Shows a live
 * count of RED (clear-error) captures so admins notice real problems straight
 * from the avatar menu — orange/yellow stay quiet here by design.
 */
export function ErrorInspectorMenuItem() {
  const toggle = useToggleErrorInspector();
  const menuCheckboxId = useMenuCheckboxId();
  const { red } = useCapturedErrorStats();
  // ADMIN POWER, the same bar as the sidebar toggle: the inspector is an admin
  // tool and exists only inside the admin section (utils/supabase/adminLane.ts).
  const canUse = useAppSelector(selectIsAdmin);

  if (!canUse) return null;

  return (
    <label htmlFor={menuCheckboxId} className="block">
      <button
        className={cn(MENU_ITEM_CLASS, "[&_svg]:text-amber-500")}
        onClick={toggle}
      >
        <AlertTriangle />
        <span>Error Inspector</span>
        {red > 0 && (
          <span className="ml-auto rounded-full bg-destructive/20 text-destructive px-1.5 text-[10px] font-semibold">
            {red}
          </span>
        )}
      </button>
    </label>
  );
}
