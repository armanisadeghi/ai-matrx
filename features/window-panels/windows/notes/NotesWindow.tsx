"use client";

// NotesWindow — The canonical floating notes panel.
//
// Features:
//  1. Sidebar uses WindowPanel's built-in ResizablePanelGroup → collapsible + draggable
//  2. View mode controls are rendered inline (not portaled to shell PageHeader)
//  3. Context menus are portaled to document.body → always above the window stacking context
//  4. Empty state shows the shared FolderQuickPick grid for fast note creation
//  5. Supports multiple simultaneous instances (windowInstanceId per instance)

import React, { useEffect, useState } from "react";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { NoteSidebar } from "@/features/notes/components/NoteSidebar";
import { NotesWindowView } from "@/features/notes/components/NotesWindowView";

export interface NotesWindowProps extends Omit<
  WindowPanelProps,
  "children" | "title" | "sidebar" | "onClose"
> {
  title?: string;
  /** Unique overlay instance ID — used to derive stable notes instance + window IDs. */
  windowInstanceId?: string;
  /** Required — multi-instance overlay; persistence.closeWindow only targets "default". */
  onClose: () => void;
}

export function NotesWindow({
  title = "Notes",
  id,
  windowInstanceId,
  onClose,
  ...windowProps
}: NotesWindowProps) {
  const stableKey = windowInstanceId ?? "default";
  const windowId = id ?? `notes-window-${stableKey}`;
  const notesInstanceId = `notes-${stableKey}`;

  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  return (
    <WindowPanel
      title={title}
      minWidth={700}
      minHeight={600}
      urlSyncKey={`notes-${stableKey}`}
      urlSyncId={stableKey}
      id={windowId}
      overlayId="notesWindow"
      sidebar={
        <NoteSidebar
          instanceId={notesInstanceId}
          contextMenuPortalTarget={portalTarget}
        />
      }
      sidebarDefaultSize={200}
      sidebarMinSize={140}
      sidebarExpandsWindow
      onClose={onClose}
      {...windowProps}
    >
      <NotesWindowView
        config={{
          showTabs: true,
          instanceId: notesInstanceId,
        }}
        className="h-full"
      />
    </WindowPanel>
  );
}
