"use client";

// NotesWindowView — Floating window variant of NotesView.
// Key differences from NotesView:
//  - View mode controls rendered inline (not portaled to PageHeader)
//  - No sidebar rendered here — caller (NotesWindow) passes NoteSidebar as WindowPanel sidebar prop
//  - Empty-state shows the shared FolderQuickPick grid (same as the /notes route)
//  - Designed to live inside a WindowPanel (no shell header dependency)

import React, { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import {
  FileText,
  SplitSquareHorizontal,
  PilcrowRight,
  Columns,
  Eye,
  History,
  ChevronDown,
  Check,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";
import {
  registerInstance,
  unregisterInstance,
  setInstanceActiveTab,
  removeInstanceTab,
  setNoteEditorMode,
  markTabInteraction,
} from "../redux/slice";
import {
  fetchNotesList,
  fetchNoteContent,
  saveNote,
  fetchAllNoteScopes,
} from "../redux/thunks";
import {
  selectOtherUsersActive,
  selectActiveNoteEditedByOthers,
  selectInstanceActiveTab,
  selectInstanceTabs,
  selectNoteEditorMode,
} from "../redux/selectors";
import { NotesInstanceProvider } from "../context/NotesInstanceContext";
import { NoteContentEditor } from "./NoteContentEditor";
import { NoteMetadataBar } from "./NoteMetadataBar";
import { NoteTabBar } from "./NoteTabBar";
import { FolderQuickPick } from "./FolderQuickPick";
import { cn } from "@/lib/utils";

const NoteVersionHistory = dynamic(
  () =>
    import("@/features/notes/components/NoteVersionHistory").then((mod) => ({
      default: mod.NoteVersionHistory,
    })),
  { ssr: false },
);

// ── View mode definitions ────────────────────────────────────────────────────

const VIEW_MODES = [
  { mode: "plain", label: "Edit", icon: FileText },
  { mode: "split", label: "Split", icon: SplitSquareHorizontal },
  { mode: "wysiwyg", label: "Rich", icon: PilcrowRight },
  { mode: "markdown-split", label: "MD Split", icon: Columns },
  { mode: "preview", label: "Preview", icon: Eye },
] as const;

type ViewMode = (typeof VIEW_MODES)[number]["mode"];

// ── Inline toolbar ───────────────────────────────────────────────────────────

interface InlineViewToolbarProps {
  editorMode: string;
  onModeChange: (mode: ViewMode) => void;
  showHistory: boolean;
  onHistoryToggle: () => void;
}

function InlineViewToolbar({
  editorMode,
  onModeChange,
  showHistory,
  onHistoryToggle,
}: InlineViewToolbarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click — skip Radix portal targets (Select, Popover, etc.)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (ref.current && !ref.current.contains(target)) {
        if (target.closest?.("[data-radix-portal]")) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current =
    VIEW_MODES.find((m) => m.mode === editorMode) ?? VIEW_MODES[0];
  const CurrentIcon = current.icon;

  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* View mode dropdown */}
      <div ref={ref} className="relative">
        <button
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] font-medium rounded transition-colors cursor-pointer",
            "[&_svg]:w-3.5 [&_svg]:h-3.5",
            "bg-accent/50 text-foreground hover:bg-accent",
          )}
          onClick={() => setOpen((v) => !v)}
          title="Change view mode"
        >
          <CurrentIcon />
          <span>{current.label}</span>
          <ChevronDown className="opacity-60" />
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-[9990]"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 min-w-[140px] py-1 bg-card border border-border rounded-lg shadow-xl z-[9999]">
              {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer transition-colors",
                    editorMode === mode
                      ? "text-foreground bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                  onClick={() => {
                    onModeChange(mode);
                    setOpen(false);
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                  {editorMode === mode && (
                    <Check className="w-3 h-3 ml-auto shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* History toggle */}
      <button
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] font-medium rounded transition-colors cursor-pointer [&_svg]:w-3.5 [&_svg]:h-3.5",
          showHistory
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
        onClick={onHistoryToggle}
        title="Version history"
      >
        <History />
      </button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export interface NotesWindowViewConfig {
  showTabs?: boolean;
  instanceId?: string;
}

export interface NotesWindowViewProps {
  config?: NotesWindowViewConfig;
  className?: string;
}

export function NotesWindowView({ config, className }: NotesWindowViewProps) {
  const dispatch = useAppDispatch();
  const { id: userId } = useAppSelector(selectUser);

  const showTabs = config?.showTabs ?? true;
  const [showHistory, setShowHistory] = useState(false);

  // ── Generate or use provided instance ID ──────────────────────────
  const instanceIdRef = useRef(
    config?.instanceId ??
      `notes-win-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const instanceId = instanceIdRef.current;

  // ── Register instance on mount, unregister on unmount ─────────────
  useEffect(() => {
    dispatch(registerInstance(instanceId));
    return () => {
      dispatch(unregisterInstance(instanceId));
    };
  }, [dispatch, instanceId]);

  // ── Fetch notes list + scope data on mount ─────────────────────────
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!fetchedRef.current && userId) {
      fetchedRef.current = true;
      dispatch(fetchNotesList());
      dispatch(fetchAllNoteScopes());
    }
  }, [dispatch, userId]);

  const activeTabId = useAppSelector(selectInstanceActiveTab(instanceId));
  const openTabs = useAppSelector(selectInstanceTabs(instanceId));
  const othersActive = useAppSelector(selectOtherUsersActive);
  const activeNoteEditedByOthers = useAppSelector(
    selectActiveNoteEditedByOthers,
  );
  const editorMode =
    useAppSelector(
      activeTabId ? selectNoteEditorMode(activeTabId) : () => "plain",
    ) ?? "plain";

  const setMode = useCallback(
    (mode: ViewMode) => {
      if (activeTabId) dispatch(setNoteEditorMode({ id: activeTabId, mode }));
    },
    [dispatch, activeTabId],
  );

  // ── Keyboard shortcuts ───────────────────────────────────────────
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
      <div className={cn("flex flex-col h-full w-full min-h-0", className)}>
        {/* ── Tab bar row with inline view controls ─────────────────── */}
        {showTabs && (
          <div className="flex items-center shrink-0 border-b border-border min-h-0">
            {/* Tab bar fills remaining space */}
            <div className="flex-1 min-w-0 overflow-hidden">
              <NoteTabBar instanceId={instanceId} />
            </div>

            {/* Inline view mode controls — only show when a note is active */}
            {activeTabId && (
              <div className="shrink-0 px-2 py-1 flex items-center">
                <InlineViewToolbar
                  editorMode={editorMode}
                  onModeChange={setMode}
                  showHistory={showHistory}
                  onHistoryToggle={() => setShowHistory((v) => !v)}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Presence indicators ───────────────────────────────────── */}
        {activeTabId && activeNoteEditedByOthers && (
          <div className="flex items-center gap-2 px-4 py-1 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="text-[0.6875rem] text-amber-700 dark:text-amber-300">
              Another user is editing this note
            </span>
          </div>
        )}
        {othersActive && !activeNoteEditedByOthers && (
          <div className="flex items-center gap-2 px-4 py-0.5 bg-blue-500/5 border-b border-blue-500/10 shrink-0">
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
            </span>
            <span className="text-[0.625rem] text-blue-600/70 dark:text-blue-400/70">
              Other users are active in notes
            </span>
          </div>
        )}

        {/* ── Main content area ─────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          {/* Editor column */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {activeTabId ? (
              <>
                <NoteContentEditor noteId={activeTabId} />
                <NoteMetadataBar noteId={activeTabId} />
              </>
            ) : (
              <FolderQuickPick instanceId={instanceId} />
            )}
          </div>

          {/* Version history — resizable MatrxDynamic panel (desktop) / Drawer (mobile) */}
          {activeTabId && (
            <NoteVersionHistory
              noteId={activeTabId}
              open={showHistory}
              onOpenChange={setShowHistory}
              onVersionRestored={() => {
                dispatch(fetchNoteContent(activeTabId));
              }}
            />
          )}
        </div>
      </div>
    </NotesInstanceProvider>
  );
}
