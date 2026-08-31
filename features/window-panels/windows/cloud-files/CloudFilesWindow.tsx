/**
 * features/window-panels/windows/cloud-files/CloudFilesWindow.tsx
 *
 * Floating WindowPanel wrapper around the cloud-files WindowPanelShell body.
 * Registered in windowRegistry as `cloudFilesWindow` / slug `cloud-files-window`.
 *
 * Design:
 *  - WindowPanel provides the OS-style frame (drag, resize, maximize, minimize).
 *  - WindowPanelShell provides the internal Tabs (Browse / Search / Upload /
 *    Recent / Shared / Trash) + the Browse tab's own sidebar + main area.
 *  - We do NOT pass `sidebar` to WindowPanel — the Browse tab has its own
 *    Resizable sidebar embedded. Passing WindowPanel's sidebar would conflict.
 *  - `onCollectData` persists the active tab so the window reopens to the
 *    same view.
 *
 * Cloud-files realtime is mounted globally in `app/Providers.tsx` — no
 * per-window provider needed (Phase 0 of the consolidation rebuild).
 */

"use client";

import { useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { WindowPanelShell } from "@/features/files/components/surfaces/WindowPanelShell";
import type { CloudFilesWindowTab } from "@/features/files/components/surfaces/WindowPanelShell";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

export interface CloudFilesWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Starting tab. Defaults to "browse". */
  initialTab?: CloudFilesWindowTab;
}

export default function CloudFilesWindow({
  isOpen,
  onClose,
  initialTab = "browse",
}: CloudFilesWindowProps) {
  const [activeTab, setActiveTab] = useState<CloudFilesWindowTab>(initialTab);

  if (!isOpen) return null;

  return (
    <WindowPanel
      title="Cloud Files"
      width={1000}
      height={700}
      urlSyncKey="cloud_files"
      onClose={onClose}
      overlayId="cloudFilesWindow"
      onCollectData={() => ({ activeTab })}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-background">
        {/*
         * Pane-level fallback — WindowPanelShell's FileList/FileTree rows
         * don't wire the canonical per-file menu (`FileRightClickMenu`)
         * themselves, so without this a right-click here fell through to
         * whatever page hosts the window. This is a floor, not the fix:
         * the real fix is each row wrapping itself in `FileRightClickMenu`
         * (outside this shard — features/files/components/core/FileList).
         */}
        <NonEditableContextMenu
          sourceFeature="files"
          contentSource={{ type: "raw" }}
          contextData={{ content: "" }}
        >
          <WindowPanelShell activeTab={activeTab} onTabChange={setActiveTab} />
        </NonEditableContextMenu>
      </div>
    </WindowPanel>
  );
}
