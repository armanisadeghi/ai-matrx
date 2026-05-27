"use client";

// LegacyNotesWindow — DEPRECATED original floating notes panel.
//
// The canonical Notes window is now `NotesWindow` exported from
// NotesBetaWindow.tsx (overlayId `notesBetaWindow`). This file only
// remains because two surfaces still reference it pending review:
//   - app/(ssr)/ssr/demos/window-demo/page.tsx
//   - app/(authenticated)/(admin-auth)/administration/persistence-test
// Once those are reassessed this file (plus its overlay registry entry,
// opener, and dynamic import) can be deleted entirely.

import React, { useCallback, useEffect, useRef } from "react";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { NotesView } from "@/features/notes/components/NotesView";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectInstanceTabs,
  selectInstanceActiveTab,
} from "@/features/notes/redux/selectors";
import {
  selectWindowRect,
  selectWindowState,
  selectWindowZIndex,
} from "@/lib/redux/slices/windowManagerSlice";
import { useWindowPersistence } from "@/features/window-panels/WindowPersistenceManager";

export interface LegacyNotesWindowProps extends Omit<
  WindowPanelProps,
  "children" | "title"
> {
  title?: string;
  /** Tab IDs to restore from a saved session (from window_sessions.data) */
  initialTabs?: string[];
  /** Active tab ID to restore from a saved session */
  initialActiveTab?: string | null;
  /** Lock this window to a single note — hides sidebar and tabs */
  singleNoteId?: string | null;
}

const INSTANCE_ID = "window-notes-window";
const OVERLAY_ID = "notesWindow";
const WINDOW_ID = "notes-window";

export function LegacyNotesWindow({
  title = "Notes (legacy)",
  id = WINDOW_ID,
  initialTabs,
  initialActiveTab,
  singleNoteId = null,
  ...windowProps
}: LegacyNotesWindowProps) {
  const openTabs = useAppSelector(selectInstanceTabs(INSTANCE_ID));
  const activeTabId = useAppSelector(selectInstanceActiveTab(INSTANCE_ID));

  // Geometry from Redux — used to persist an accurate rect on auto-save
  const windowId = id;
  const rect = useAppSelector(selectWindowRect(windowId));
  const windowState = useAppSelector(selectWindowState(windowId));
  const zIndex = useAppSelector(selectWindowZIndex(windowId));

  const persistence = useWindowPersistence();

  // Stable ref to latest tab state so save callback always has current values
  const tabStateRef = useRef({ openTabs, activeTabId });
  useEffect(() => {
    tabStateRef.current = { openTabs, activeTabId };
  }, [openTabs, activeTabId]);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      openTabs: tabStateRef.current.openTabs ?? [],
      activeTabId: tabStateRef.current.activeTabId ?? null,
    }),
    [],
  );

  // Auto-save to window_sessions whenever tabs change (debounced 1.5s)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Only auto-save when there are tabs open
    if (!openTabs || openTabs.length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const panelState = {
        windowState: (windowState ?? "windowed") as
          | "windowed"
          | "maximized"
          | "minimized",
        rect: rect ?? { x: 100, y: 100, width: 600, height: 500 },
        sidebarOpen: false,
        zIndex: zIndex ?? 1000,
      };
      persistence.saveWindow(OVERLAY_ID, panelState, {
        openTabs: openTabs ?? [],
        activeTabId: activeTabId ?? null,
      });
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTabs, activeTabId]);

  return (
    <WindowPanel
      title={title}
      minWidth={340}
      minHeight={220}
      urlSyncKey="notes"
      urlSyncId="default"
      id={id}
      overlayId={OVERLAY_ID}
      onCollectData={collectData}
      {...windowProps}
    >
      <NotesView
        config={{
          showSidebar: !singleNoteId,
          showTabs: !singleNoteId,
          instanceId: singleNoteId
            ? `${INSTANCE_ID}-single-${singleNoteId}`
            : INSTANCE_ID,
          initialTabs,
          initialActiveTab,
          singleNote: singleNoteId,
        }}
        className="h-full"
      />
    </WindowPanel>
  );
}
