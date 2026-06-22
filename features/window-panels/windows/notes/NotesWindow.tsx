"use client";

// NotesWindow — the canonical floating notes panel.
//
// Thin COMPOSITION ROOT: it owns the notes instance lifecycle and maps the
// independent notes units onto WindowPanel's slots. The content area holds ONLY
// content — every other concern is a slot:
//   - sidebar      → <NoteSidebar>         (note tree; WindowPanel ResizablePanel)
//   - actionsRight → <NoteViewControls>    (view-mode menu + history toggle)
//   - footer       → <NoteMetadataBar>     (folder, context, tags, save status)
//   - body         → <NotesWindowView>     (tab bar + editor + split + history)
//
// No reinvented header/footer, no `sidebarExpandsWindow` rect mutation, no
// viewport-sized side panels. Multiple instances coexist via windowInstanceId.

import React, { useEffect, useRef, useState } from "react";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";
import {
  registerInstance,
  unregisterInstance,
} from "@/features/notes/redux/slice";
import {
  fetchNotesList,
  fetchAllNoteScopes,
} from "@/features/notes/redux/thunks";
import {
  selectInstanceActiveTab,
  selectInstanceHistoryOpen,
} from "@/features/notes/redux/selectors";
import { NotesInstanceProvider } from "@/features/notes/context/NotesInstanceContext";
import { NoteSidebar } from "@/features/notes/components/NoteSidebar";
import { NoteViewControls } from "@/features/notes/components/NoteViewControls";
import { NoteMetadataBar } from "@/features/notes/components/NoteMetadataBar";
import { NoteHistoryPane } from "@/features/notes/components/NoteHistoryPane";
import { NotesWindowView } from "@/features/notes/components/NotesWindowView";

export interface NotesWindowProps
  extends Omit<
    WindowPanelProps,
    "children" | "title" | "sidebar" | "onClose"
  > {
  title?: string;
  /** Unique overlay instance ID — derives stable notes instance + window IDs. */
  windowInstanceId?: string;
  /** Required — multi-instance overlay. */
  onClose: () => void;
}

export function NotesWindow({
  title = "Notes",
  id,
  windowInstanceId,
  onClose,
  ...windowProps
}: NotesWindowProps) {
  const dispatch = useAppDispatch();
  const { id: userId } = useAppSelector(selectUser);

  const stableKey = windowInstanceId ?? "default";
  const windowId = id ?? `notes-window-${stableKey}`;
  const notesInstanceId = `notes-${stableKey}`;

  // Context menus must escape the window stacking context → portal to body.
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  // Own the instance lifecycle here (the composition root), not in the body —
  // so the sidebar / header / footer slots can all read it immediately.
  useEffect(() => {
    dispatch(registerInstance(notesInstanceId));
    return () => {
      dispatch(unregisterInstance(notesInstanceId));
    };
  }, [dispatch, notesInstanceId]);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!fetchedRef.current && userId) {
      fetchedRef.current = true;
      dispatch(fetchNotesList());
      dispatch(fetchAllNoteScopes());
    }
  }, [dispatch, userId]);

  const activeTabId = useAppSelector(
    selectInstanceActiveTab(notesInstanceId),
  );
  const historyOpen = useAppSelector(
    selectInstanceHistoryOpen(notesInstanceId),
  );

  return (
    <NotesInstanceProvider value={notesInstanceId}>
      <WindowPanel
        id={windowId}
        overlayId="notesWindow"
        title={title}
        width={960}
        height={680}
        position="center"
        minWidth={640}
        minHeight={460}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        urlSyncKey={`notes-${stableKey}`}
        urlSyncId={stableKey}
        sidebar={
          <NoteSidebar
            instanceId={notesInstanceId}
            contextMenuPortalTarget={portalTarget}
          />
        }
        sidebarDefaultSize={220}
        sidebarMinSize={150}
        actionsRight={<NoteViewControls instanceId={notesInstanceId} />}
        footer={
          activeTabId ? <NoteMetadataBar noteId={activeTabId} /> : undefined
        }
        secondaryPanel={
          activeTabId && historyOpen ? (
            <NoteHistoryPane
              instanceId={notesInstanceId}
              noteId={activeTabId}
            />
          ) : undefined
        }
        secondaryPanelDefaultSize={360}
        secondaryPanelMinSize={280}
        onClose={onClose}
        {...windowProps}
      >
        <NotesWindowView instanceId={notesInstanceId} />
      </WindowPanel>
    </NotesInstanceProvider>
  );
}
