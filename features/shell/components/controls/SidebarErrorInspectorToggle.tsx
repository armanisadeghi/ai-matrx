"use client";

/**
 * SidebarErrorInspectorToggle — the always-present Administration-section entry
 * (sidebar footer) that opens the systemwide Error Inspector. Visible on every
 * route for ANY admin (selectIsAdmin), mirroring SidebarAdminIndicatorToggle.
 *
 * Shows the live tiered state inline: a red count when there are clear errors,
 * else a small orange dot for minor ones, else nothing — same priority the
 * floating badge uses.
 */

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import {
  selectIsOverlayOpen,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";
import { useCapturedErrorStats } from "@/lib/diagnostics/useCapturedErrors";
import { ERROR_INSPECTOR_OVERLAY_ID } from "@/features/admin/error-inspector/useOpenErrorInspector";

export default function SidebarErrorInspectorToggle() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin) ?? false;
  const isOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, ERROR_INSPECTOR_OVERLAY_ID),
  );
  const { red, orange } = useCapturedErrorStats();

  // Defer the gate to post-hydration so this footer control never swaps DOM
  // position between SSR and the first client commit (hydration mismatch).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated || !isAdmin) return null;

  return (
    <button
      type="button"
      onClick={() =>
        dispatch(toggleOverlay({ overlayId: ERROR_INSPECTOR_OVERLAY_ID }))
      }
      className={cn(
        "shell-nav-item shell-tactile",
        isOpen && "shell-nav-item-active",
      )}
      aria-pressed={isOpen}
      aria-label="Open Error Inspector"
      title="Error Inspector — every captured error, with Copy for AI"
    >
      <span className="shell-nav-icon">
        <AlertTriangle size={18} strokeWidth={1.75} />
      </span>
      <span className="shell-nav-label">Error Inspector</span>
      {red > 0 ? (
        <span className="ml-auto rounded-full bg-destructive/20 text-destructive px-1.5 text-[10px] font-semibold tabular-nums">
          {red}
        </span>
      ) : orange > 0 ? (
        <span className="ml-auto h-2 w-2 rounded-full bg-amber-500" />
      ) : null}
    </button>
  );
}
