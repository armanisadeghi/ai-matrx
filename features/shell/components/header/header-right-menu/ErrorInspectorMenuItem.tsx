"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { useToggleErrorInspector } from "@/features/admin/error-inspector/useOpenErrorInspector";
import { useCapturedErrorStats } from "@/lib/diagnostics/useCapturedErrors";

/**
 * Admin-menu entry that opens the Supabase Error Inspector. Shows a live count
 * of captured errors so admins notice problems straight from the avatar menu.
 */
export function ErrorInspectorMenuItem() {
  const toggle = useToggleErrorInspector();
  const { total } = useCapturedErrorStats();

  return (
    <label htmlFor="shell-user-menu" className="block">
      <button
        className={cn(MENU_ITEM_CLASS, "[&_svg]:text-amber-500")}
        onClick={toggle}
      >
        <AlertTriangle />
        <span>Supabase Errors</span>
        {total > 0 && (
          <span className="ml-auto rounded-full bg-destructive/20 text-destructive px-1.5 text-[10px] font-semibold">
            {total}
          </span>
        )}
      </button>
    </label>
  );
}
