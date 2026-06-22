"use client";

// NotesWindowView — the notes WORKSPACE BODY for the floating window.
//
// Pure content only: tab bar + presence + editor (with split). The version-
// history panel is NOT here — on desktop it's the WindowPanel `secondaryPanel`
// slot (wired in NotesWindow), on mobile it's a Drawer rendered below. Every
// piece of chrome (header view-controls, footer metadata, left note tree, right
// history) is a WindowPanel slot, never body content.
//
// Takes ONLY instanceId; every value comes from Redux selectors. ZERO PROP
// DRILLING.

import React, { useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setInstanceActiveTab,
  removeInstanceTab,
  markTabInteraction,
  closeSplit,
  setInstanceHistoryOpen,
} from "../redux/slice";
import { fetchNoteContent, saveNote } from "../redux/thunks";
import {
  selectInstanceActiveTab,
  selectInstanceTabs,
  selectInstanceSplitNoteId,
  selectInstanceHistoryOpen,
  selectNoteLabel,
} from "../redux/selectors";
import { NotesInstanceProvider } from "../context/NotesInstanceContext";
import { NoteContentEditor } from "./NoteContentEditor";
import { NoteTabBar } from "./NoteTabBar";
import { NotePresenceBanner } from "./NotePresenceBanner";
import { NoteVersionHistory } from "./NoteVersionHistory";
import { FolderQuickPick } from "./FolderQuickPick";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface NotesWindowViewProps {
  instanceId: string;
  showTabs?: boolean;
  className?: string;
}

export function NotesWindowView({
  instanceId,
  showTabs = true,
  className,
}: NotesWindowViewProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();

  const activeTabId = useAppSelector(selectInstanceActiveTab(instanceId));
  const openTabs = useAppSelector(selectInstanceTabs(instanceId));
  const splitNoteId = useAppSelector(selectInstanceSplitNoteId(instanceId));
  const historyOpen = useAppSelector(selectInstanceHistoryOpen(instanceId));
  const splitNoteLabel = useAppSelector(
    splitNoteId ? selectNoteLabel(splitNoteId) : () => undefined,
  );

  const setHistoryOpen = useCallback(
    (open: boolean) => dispatch(setInstanceHistoryOpen({ instanceId, open })),
    [dispatch, instanceId],
  );

  // ── Keyboard shortcuts (save / close tab / cycle tab) ──────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        if (activeTabId) dispatch(saveNote(activeTabId));
        return;
      }
      if (mod && e.key === "w") {
        e.preventDefault();
        if (activeTabId) {
          dispatch(markTabInteraction({ instanceId }));
          dispatch(removeInstanceTab({ instanceId, noteId: activeTabId }));
        }
        return;
      }
      if (mod && e.key === "Tab") {
        e.preventDefault();
        if (openTabs && openTabs.length > 1 && activeTabId) {
          const idx = openTabs.indexOf(activeTabId);
          const next = openTabs[(idx + 1) % openTabs.length];
          dispatch(markTabInteraction({ instanceId }));
          dispatch(setInstanceActiveTab({ instanceId, noteId: next }));
          dispatch(fetchNoteContent(next));
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch, instanceId, activeTabId, openTabs]);

  return (
    <NotesInstanceProvider value={instanceId}>
      <div className={cn("flex h-full min-h-0 w-full flex-col", className)}>
        {/* Editor column (tab bar + presence + editor / split / empty) */}
        <div className="flex h-full min-h-0 flex-col">
          {showTabs && <NoteTabBar instanceId={instanceId} />}
          <NotePresenceBanner instanceId={instanceId} />
          <div className="flex min-h-0 flex-1">
            {activeTabId ? (
              splitNoteId ? (
                <div className="flex min-h-0 flex-1">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <NoteContentEditor noteId={activeTabId} />
                  </div>
                  <div className="w-px shrink-0 bg-border" />
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-2 py-0.5">
                      <span className="truncate text-[0.625rem] font-medium text-muted-foreground">
                        {splitNoteLabel ?? "Split Note"}
                      </span>
                      <button
                        onClick={() => dispatch(closeSplit(instanceId))}
                        className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                        title="Close split"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <NoteContentEditor noteId={splitNoteId} />
                  </div>
                </div>
              ) : (
                <NoteContentEditor noteId={activeTabId} />
              )
            ) : (
              <FolderQuickPick instanceId={instanceId} />
            )}
          </div>
        </div>

        {/* Mobile-only: version history as a Drawer (desktop uses the
            WindowPanel secondaryPanel slot wired in NotesWindow). */}
        {isMobile && activeTabId && (
          <NoteVersionHistory
            noteId={activeTabId}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            onVersionRestored={() => dispatch(fetchNoteContent(activeTabId))}
          />
        )}
      </div>
    </NotesInstanceProvider>
  );
}
