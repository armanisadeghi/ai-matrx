/**
 * features/window-panels/windows/cloud-files/CloudFilesWindow.tsx
 *
 * Floating WindowPanel wrapper around the cloud-files WindowPanelShell body.
 * Registered in windowRegistry as `cloudFilesWindow` / slug `cloud-files-window`.
 *
 * Design:
 *  - WindowPanel provides the OS-style frame (drag, resize, maximize, minimize).
 *  - WindowPanelShell provides the internal Tabs (Browse / Recent / Shared /
 *    Trash) + the Browse tab's own sidebar + main area.
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
import {
  WindowPanelShell,
  type CloudFilesWindowTab,
} from "@/features/files";

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
        <WindowPanelShell activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </WindowPanel>
  );
}
