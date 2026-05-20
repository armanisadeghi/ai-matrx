"use client";

import { useEffect, useState } from "react";
import { Bug } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  selectIsOverlayOpen,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";

export default function SidebarAdminIndicatorToggle() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdmin) ?? false;
  const isIndicatorOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  // Defer the visibility gate to post-hydration. This control sits next to
  // SidebarCreatorHubToggle in the footer; if either toggle's gate flips
  // between SSR and the first client commit, the buttons swap DOM positions
  // and React's hydration reconciles the wrong node, producing the
  // "fewer hooks than expected" / hydration-mismatch error.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated || !isAdmin) return null;

  return (
    <button
      type="button"
      onClick={() => dispatch(toggleOverlay({ overlayId: "adminIndicator" }))}
      className={`shell-nav-item shell-tactile ${isIndicatorOpen ? "shell-nav-item-active" : ""}`}
      aria-pressed={isIndicatorOpen}
      aria-label={
        isIndicatorOpen ? "Hide admin indicator" : "Show admin indicator"
      }
      title={isIndicatorOpen ? "Hide Admin Indicator" : "Show Admin Indicator"}
    >
      <span className="shell-nav-icon">
        <Bug size={18} strokeWidth={1.75} />
      </span>
      <span className="shell-nav-label">
        {isIndicatorOpen ? "Hide Indicator" : "Show Indicator"}
      </span>
    </button>
  );
}
