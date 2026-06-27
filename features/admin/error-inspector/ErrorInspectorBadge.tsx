"use client";

/**
 * ErrorInspectorBadge — admin-only floating chip that appears the moment a
 * Supabase error is captured anywhere in the app, shows a live count, pulses
 * while there are unseen errors, and opens the Error Inspector on click. Gives
 * admins passive, always-on awareness during the DB transition without hunting.
 *
 * Mounted globally (admin-gated) from `app/DeferredSingletons.tsx`. Renders
 * nothing until there's at least one captured error.
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { useCapturedErrorStats } from "@/lib/diagnostics/useCapturedErrors";
import { useToggleErrorInspector } from "./useOpenErrorInspector";

export default function ErrorInspectorBadge() {
  const isAdmin = useAppSelector(selectIsAdmin);
  const { total, unseen } = useCapturedErrorStats();
  const toggle = useToggleErrorInspector();

  if (!isAdmin) return null;
  if (total === 0) return null;

  return (
    <button
      onClick={toggle}
      title={`${total} Supabase error${total === 1 ? "" : "s"} captured — open inspector`}
      className={cn(
        "fixed bottom-4 left-4 z-[60] flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 shadow-lg",
        "bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 transition-colors",
        unseen > 0
          ? "border-destructive/50 text-destructive animate-pulse"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      <span className="text-xs font-semibold tabular-nums">{total}</span>
      <span className="text-[11px] font-medium hidden sm:inline">
        Supabase error{total === 1 ? "" : "s"}
      </span>
      {unseen > 0 && (
        <span className="ml-0.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
          {unseen}
        </span>
      )}
    </button>
  );
}
