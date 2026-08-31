"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { FavoritesManagerPanel } from "@/components/favorites/FavoritesManagerPanel";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

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
      {/* 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without
          this, a right-click here is answered by whatever page sits
          underneath. This is a checkbox picker (nav catalog + toggles), not
          a row-actions list — checked `grep -rl usePinned features app`: the
          "pinned favorite" concept also renders as cards on
          `PinnedSection`/`UserLaunchpad` (out of this shard, no menu of
          their own either), but neither is a right-clickable action row
          today, so there is no shared builder yet to adopt. */}
      <NonEditableContextMenu sourceFeature="system" contentSource={{ type: "raw" }}>
        <FavoritesManagerPanel onClose={onClose} />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
