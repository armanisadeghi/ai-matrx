"use client";

// features/admin/components/OverlayLaunchButton.tsx
//
// Client island used by `<FeatureAdminPage>` to launch any registered overlay
// (window panel, modal, sheet) directly from an admin map card. Dispatches
// the `openOverlay` action from the overlay slice — same path every opener
// hook ultimately funnels into. Per-overlay typed openers exist in
// `features/overlays/openers/*` for typed callers; this generic button is
// intended only for admin tooling that lists overlays by id.

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ExternalLink, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface OverlayLaunchButtonProps {
  overlayId: string;
  label: string;
}

export function OverlayLaunchButton({
  overlayId,
  label,
}: OverlayLaunchButtonProps) {
  const dispatch = useAppDispatch();
  const handleClick = useCallback(() => {
    dispatch(
      openOverlay({
        overlayId: overlayId as Parameters<typeof openOverlay>[0]["overlayId"],
      }),
    );
  }, [dispatch, overlayId]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        "border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors",
      )}
      aria-label={`Open ${label}`}
    >
      <Play className="h-2.5 w-2.5" />
      Open
    </button>
  );
}

interface ExternalTabLinkProps {
  href: string;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Convenience: every link surfaced on an admin map opens in a new tab so the
 * admin keeps the map page available as a workspace. `target="_blank"` with
 * the correct `rel` set.
 */
export function ExternalTabLink({
  href,
  label,
  className,
  children,
}: ExternalTabLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
    </a>
  );
}
