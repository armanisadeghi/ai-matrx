"use client";

/**
 * ErrorInspectorBadge — admin-only floating indicator that reflects the LOUDEST
 * captured tier and opens the Error Inspector on click. Tiered by design:
 *
 *   red    → full pill with a count; pulses while there are unseen red errors.
 *   orange → a small dot only (no count); pulses while unseen. "Something
 *            happened" without the alarm.
 *   yellow → nothing. Silent errors are listed only inside the inspector.
 *
 * Mounted globally (admin-gated) from `app/DeferredSingletons.tsx`. Renders
 * nothing for non-admins, or when the only captured errors are yellow.
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { useCapturedErrorStats } from "@/lib/diagnostics/useCapturedErrors";
import { useToggleErrorInspector } from "./useOpenErrorInspector";

export default function ErrorInspectorBadge() {
  const isAdmin = useAppSelector(selectIsAdmin);
  const { red, orange, unseenRed, unseenOrange } = useCapturedErrorStats();
  const toggle = useToggleErrorInspector();

  if (!isAdmin) return null;

  // ── Red present → loud pill ──────────────────────────────────────────────
  if (red > 0) {
    return (
      <button
        onClick={toggle}
        title={`${red} error${red === 1 ? "" : "s"} captured — open Error Inspector`}
        className={cn(
          "fixed bottom-4 left-4 z-[60] flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 shadow-lg",
          "bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 transition-colors",
          unseenRed > 0
            ? "border-destructive/50 text-destructive animate-pulse"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold tabular-nums">{red}</span>
        <span className="text-[11px] font-medium hidden sm:inline">
          error{red === 1 ? "" : "s"}
        </span>
        {unseenRed > 0 && (
          <span className="ml-0.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
            {unseenRed}
          </span>
        )}
      </button>
    );
  }

  // ── Only orange → small dot ──────────────────────────────────────────────
  if (orange > 0) {
    return (
      <button
        onClick={toggle}
        title={`${orange} minor issue${orange === 1 ? "" : "s"} — open Error Inspector`}
        aria-label="Open Error Inspector"
        className="fixed bottom-4 left-4 z-[60] flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 transition-transform hover:scale-110"
      >
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full bg-amber-500",
            unseenOrange > 0 && "animate-pulse",
          )}
        />
      </button>
    );
  }

  // ── Only yellow (or nothing) → silent ────────────────────────────────────
  return null;
}
