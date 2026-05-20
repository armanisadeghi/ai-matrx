"use client";

import { Crown } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsCreator } from "@/lib/redux/selectors/userSelectors";
import {
  selectIsOverlayOpen,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";

/**
 * Crown affordance in the main sidebar footer — the creator analogue of the
 * admin Bug. Visible to creators (so they can open the hub and enable creator
 * mode); toggles the global `creatorHub` overlay, matching the admin Bug's
 * toggle semantics.
 */
export default function SidebarCreatorHubToggle() {
  const dispatch = useAppDispatch();
  const isCreator = useAppSelector(selectIsCreator);
  const isOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "creatorHub"),
  );

  if (!isCreator) return null;

  return (
    <button
      type="button"
      onClick={() => dispatch(toggleOverlay({ overlayId: "creatorHub" }))}
      className={`shell-nav-item shell-tactile ${isOpen ? "shell-nav-item-active" : ""}`}
      aria-pressed={isOpen}
      aria-label={isOpen ? "Hide creator hub" : "Show creator hub"}
      title={isOpen ? "Hide Creator Hub" : "Show Creator Hub"}
    >
      <span className="shell-nav-icon">
        <Crown size={18} strokeWidth={1.75} />
      </span>
      <span className="shell-nav-label">
        {isOpen ? "Hide Creator Hub" : "Creator Hub"}
      </span>
    </button>
  );
}
