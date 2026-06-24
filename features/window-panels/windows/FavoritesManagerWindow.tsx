"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { FavoritesManagerPanel } from "@/components/favorites/FavoritesManagerPanel";

interface FavoritesManagerWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Thin shell: WindowPanel provides the floating-window chrome on desktop and the
 * mobile Drawer (via the registry's `mobilePresentation: "drawer"`), while the
 * favorites-management logic lives in the reusable FavoritesManagerPanel.
 */
export default function FavoritesManagerWindow({
  isOpen,
  onClose,
}: FavoritesManagerWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      title="Manage favorites"
      id="favorites-manager-default"
      minWidth={360}
      minHeight={420}
      width={480}
      height={580}
      onClose={onClose}
      overlayId="favoritesManagerWindow"
    >
      <FavoritesManagerPanel onClose={onClose} />
    </WindowPanel>
  );
}
