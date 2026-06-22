"use client";

// NotesWindowView — the notes WORKSPACE BODY for the floating window.
//
// Pure content only: tab bar + presence + editor (with split) + version-history
// pane. Every piece of CHROME — the header view-controls, the footer metadata
// bar, the left note tree — is composed by NotesWindow onto WindowPanel's
// header / footer / sidebar slots, NOT here. The body never reinvents chrome and
// never runs a competing resize system (history is a window-relative
// ResizablePanel on desktop, a Drawer on mobile).
//
// Takes ONLY instanceId; every value comes from Redux selectors. ZERO PROP
// DRILLING.

import React, { useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
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
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const NoteVersionHistoryPanel = dynamic(
  () =>
    import("@/features/notes/components/diff/NoteVersionHistoryPanel").then(
      (m) => ({ default: m.NoteVersionHistoryPanel }),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        Loading version history…
      </div>
    ),
  },
);

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

  // ── Editor column (tab bar + presence + editor / split / empty) ────
  const editorColumn = (
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
  );

  // ── Body: history as a window-relative pane (desktop) / Drawer (mobile) ──
  let body: React.ReactNode;
  if (activeTabId && historyOpen && !isMobile) {
    body = (
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          defaultSize={64}
          minSize={38}
          className="min-w-0"
          style={{ overflow: "hidden" }}
        >
          {editorColumn}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={36}
          minSize={22}
          maxSize={55}
          className="min-w-0"
          style={{ overflow: "hidden" }}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3">
              <span className="flex-1 truncate text-xs font-semibold text-foreground">
                Version History
              </span>
              <Link
                href={`/notes/${activeTabId}/diff`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Open full diff view"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close version history"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <NoteVersionHistoryPanel
                noteId={activeTabId}
                variant="embedded"
                onVersionRestored={() =>
                  dispatch(fetchNoteContent(activeTabId))
                }
                className="h-full"
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  } else {
    body = (
      <>
        {editorColumn}
        {isMobile && activeTabId && (
          <NoteVersionHistory
            noteId={activeTabId}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            onVersionRestored={() => dispatch(fetchNoteContent(activeTabId))}
          />
        )}
      </>
    );
  }

  return (
    <NotesInstanceProvider value={instanceId}>
      <div className={cn("flex h-full min-h-0 w-full flex-col", className)}>
        {body}
      </div>
    </NotesInstanceProvider>
  );
}
