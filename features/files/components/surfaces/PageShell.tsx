/**
 * features/files/components/surfaces/PageShell.tsx
 *
 * Dropbox-style shell for the `/files` route family. Renders every
 * sibling section (All files, Photos, Shared, File requests, Deleted files,
 * Starred, Activity, Folders) from the same layout — pass `section` to pick.
 *
 * Composition:
 *   IconRail (60px fixed)
 *   │
 *   └── ResizablePanelGroup
 *         ├── NavSidebar (resizable, cookie-persisted)
 *         ├── Main pane
 *         │     ├── TopBar (+ New, search)
 *         │     ├── ContentHeader (breadcrumbs, title, actions, chips, toggle)
 *         │     └── File table / grid / empty state
 *         └── PreviewPane (only when activeFileId is set — slides in on the
 *               right; never replaces the list, so the user always has an
 *               escape route via the Close (X) button or by clicking the
 *               list behind the panel).
 *
 * Mobile delegates to the existing MobileStack — that surface remains
 * unchanged in this pass.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useGroupRef,
  usePanelRef,
  type Layout,
  type OnPanelResize,
} from "react-resizable-panels";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Activity,
  Clock,
  FileInput,
  FileStack,
  Image as ImageIcon,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { pct } from "@/components/matrx/resizable/pct";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveFileId,
  selectActiveFolderId,
  selectAllFilesArray,
  selectAllFilesMap,
  selectAllFoldersArray,
  selectAllFoldersMap,
  selectChipFilter,
  selectSearchQuery,
  selectTreeStatus,
  selectViewMode,
} from "@/features/files/redux/selectors";
import {
  setActiveFileId,
  setActiveFolderId,
  setChipFilter,
  setFocusedId,
  setSearchQuery,
  setUiBatch,
} from "@/features/files/redux/slice";
import type { ChipFilter, UiState } from "@/features/files/types";
import { encodeFolderPathSegments } from "@/features/files/utils/url-state";
import {
  moveFile as moveFileThunk,
  updateFolder as updateFolderThunk,
} from "@/features/files/redux/thunks";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileTree } from "@/features/files/components/core/FileTree/FileTree";
import { FileUploadDropzone } from "@/features/files/components/core/FileUploadDropzone/FileUploadDropzone";
import { OnboardingEmptyState } from "./OnboardingEmptyState";
import { MobileStack } from "./MobileStack";
import { PreviewPane } from "./PreviewPane";
import { useFileShortcuts } from "./useFileShortcuts";
import { RenameHost } from "@/features/files/components/core/RenameDialog/RenameHost";
import { UploadContextPrompt } from "@/features/scopes/components/context-assignment/UploadContextPrompt";
import { CloudFileEditorHost } from "@/features/files/components/core/FileEditor/CloudFileEditorHost";
// Side-effect import: each adapter calls `registerVirtualSource` at module
// load. Must come before `attachVirtualRoots` is dispatched.
import "@/features/files/virtual-sources/registerBuiltinVirtualSources";
import {
  attachVirtualRoots,
  loadVirtualChildren,
  moveAny,
} from "@/features/files/redux/virtual-thunks";
import { BulkActionsBar } from "./desktop/BulkActionsBar";
import { ContentHeader } from "./desktop/ContentHeader";
import { EmptyState } from "./desktop/EmptyState";
import { FileGrid } from "./desktop/FileGrid";
import { FileTable } from "./desktop/FileTable";
import { FilesUrlSync } from "./FilesUrlSync";
import { IconRail } from "./desktop/IconRail";
import { NavSidebar } from "./desktop/NavSidebar";
import {
  SidebarModeProvider,
  type SidebarMode,
} from "./desktop/SidebarModeToggle";
import { TopBar } from "./desktop/TopBar";
import type { CloudFilesSection } from "./desktop/section";

export interface PageShellProps {
  /** Initial selection (for deep-linked routes). */
  initialFolderId?: string | null;
  initialFileId?: string | null;
  /**
   * UI state hydrated from the URL `?…` query string by the server
   * route. Applied once on mount via `useOneShotUiHydration` so the
   * first paint matches the URL (no flicker of unfiltered rows). Pass
   * `undefined` when the route doesn't have URL-encoded UI state.
   */
  initialUiPatch?: Partial<UiState>;
  /** Which section the current route represents. Defaults to "all". */
  section?: CloudFilesSection;
  /** Server-read cookie value so the sidebar mode matches the user's preference on first paint. */
  initialSidebarMode?: SidebarMode;
  /** Initial sidebar width as a percent of parent. Default 18. */
  sidebarDefaultPercent?: number;
  sidebarMinPercent?: number;
  className?: string;
}

export function PageShell(props: PageShellProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileStack
        initialFolderId={props.initialFolderId ?? null}
        initialFileId={props.initialFileId ?? null}
        className={props.className}
      />
    );
  }
  return (
    <SidebarModeProvider initialMode={props.initialSidebarMode ?? "flat"}>
      <PageShellDesktop {...props} />
    </SidebarModeProvider>
  );
}

/**
 * Sections that own a fixed pathname (`/files/recents`, `/files/photos`, …)
 * and never rewrite it on folder activation. Drilling into a folder while
 * inside one of these jumps the user back to the canonical `/files/<path>`
 * surface so the folder's contents actually drive the page (handled by
 * `NavSidebar`); the sync layer in PageShell only rewrites the path for
 * the sections that own it.
 */
const FOLDER_PATH_SECTIONS: ReadonlyArray<CloudFilesSection> = [
  "all",
  "folders",
  "folders-root",
];

// ---------------------------------------------------------------------------
// Desktop
// ---------------------------------------------------------------------------

const PANEL_IDS = {
  SIDE: "cloud-files-side",
  MAIN: "cloud-files-main",
  /** Preview is mounted only when a file is selected — autoSave still
   * remembers its width via this stable id. */
  PREVIEW: "cloud-files-preview",
} as const;

/** Default preview width as a percent of the parent group. */
const PREVIEW_DEFAULT_PCT = 38;
const PREVIEW_MIN_PCT = 10;
const PREVIEW_MAX_PCT = 60;

/** Persist the sidebar collapsed/expanded intent so it survives reloads. */
const SIDEBAR_COLLAPSED_COOKIE = "cloud-files:sidebar-collapsed";

function readSidebarCollapsedCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((entry) => entry.trim() === `${SIDEBAR_COLLAPSED_COOKIE}=1`);
}

function writeSidebarCollapsedCookie(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${
    collapsed ? "1" : "0"
  }; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

function PageShellDesktop({
  initialFolderId,
  initialFileId,
  initialUiPatch,
  section = "all",
  sidebarDefaultPercent = 12,
  sidebarMinPercent = 6,
  className,
}: PageShellProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const activeFolderId = useAppSelector(selectActiveFolderId);
  const activeFileId = useAppSelector(selectActiveFileId);
  const viewMode = useAppSelector(selectViewMode);
  const treeStatus = useAppSelector(selectTreeStatus);
  const allFiles = useAppSelector(selectAllFilesArray);
  const allFolders = useAppSelector(selectAllFoldersArray);
  const filesById = useAppSelector(selectAllFilesMap);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const permissionsByResourceId = useAppSelector(
    (s) => s.cloudFiles.permissionsByResourceId,
  );

  // Search query and chip filter live in Redux so the URL-sync layer can
  // round-trip them as `?q=…` and `?chip=…`. Direct setters are exposed
  // to children that previously took `setState` props.
  const searchQuery = useAppSelector(selectSearchQuery);
  const chipFilter = useAppSelector(selectChipFilter);
  const handleSearchChange = useCallback(
    (next: string) => dispatch(setSearchQuery(next)),
    [dispatch],
  );

  // One-time apply of initial selection + URL-derived UI state. Both run
  // BEFORE first paint so the rendered list matches the URL.
  useOneShotSelection(initialFolderId, initialFileId);
  useOneShotUiHydration(initialUiPatch);

  // Mount one synthetic root folder per registered virtual source. Idempotent
  // — re-calling is a no-op since `attachVirtualRoot` checks for the existing
  // synthetic id. Fires once on mount; the adapters self-registered at module
  // load via `registerBuiltinVirtualSources`.
  useEffect(() => {
    void dispatch(attachVirtualRoots());
  }, [dispatch]);

  // Global keyboard shortcuts — copy link, duplicate, delete. Strictly
  // focus-scoped: skips when an input/textarea/contentEditable is focused
  // or any dialog is open. Returns the pending-delete state so we can
  // gate destructive shortcuts behind a confirm.
  const shortcuts = useFileShortcuts();

  // Drag-and-drop wired at the shell level so a file dragged from the
  // FileTable / FileGrid can be dropped onto a folder ANYWHERE — table
  // rows, grid cells, OR sidebar folder list. PointerSensor distance 6
  // keeps single-clicks (selection) clean.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  // Upload-time context prompt. The dropzone fires onUploadStart the moment
  // bytes start moving; we open the prompt immediately and hand it a deferred
  // that onUploaded resolves — Save inside the prompt awaits it, so the
  // user-picks-first and upload-finishes-first races both just work.
  const [uploadPromptNames, setUploadPromptNames] = useState<string[] | null>(
    null,
  );
  const uploadIdsPromise = useRef<Promise<string[]>>(Promise.resolve([]));
  const uploadIdsResolve = useRef<((ids: string[]) => void) | null>(null);
  const handleUploadStart = useCallback((started: File[]) => {
    uploadIdsPromise.current = new Promise<string[]>((resolve) => {
      uploadIdsResolve.current = resolve;
    });
    setUploadPromptNames(started.map((f) => f.name));
  }, []);
  const handleUploadedIds = useCallback(
    (ids: string[]) => {
      uploadIdsResolve.current?.(ids);
      uploadIdsResolve.current = null;
      // Highlight + scroll the most recently uploaded file into view so it
      // never silently lands somewhere deep in a paginated list.
      const last = ids[ids.length - 1];
      if (last) dispatch(setFocusedId(last));
    },
    [dispatch],
  );

  // Reveal a finished file from the upload tray: scope the list to its
  // folder (so the row exists), open the preview pane, and focus/scroll the
  // row. This is the deterministic "take me to it" path — no hunting through
  // pages to find a just-uploaded file.
  const handleOpenUploadedFile = useCallback(
    (fileId: string) => {
      const file = filesById[fileId];
      if (file && file.parentFolderId !== activeFolderId) {
        // Only re-scope for folder-browsing sections; "all" Home already
        // lists every file regardless of folder.
        if (section !== "all") {
          dispatch(setActiveFolderId(file.parentFolderId ?? null));
        }
      }
      dispatch(setActiveFileId(fileId));
      dispatch(setFocusedId(fileId));
    },
    [dispatch, filesById, activeFolderId, section],
  );
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const active = event.active.data.current as
        | { type?: string; id?: string }
        | undefined;
      if (!active?.id) {
        setDragLabel(null);
        return;
      }
      // Look up the dragged record's display name so the DragOverlay shows
      // a visible "ghost" — drag previously had no feedback at all.
      if (active.type === "file") {
        const f = filesById[active.id];
        setDragLabel(f?.fileName ?? "File");
      } else if (active.type === "folder") {
        const fld = foldersById[active.id];
        setDragLabel(fld?.folderName ?? "Folder");
      } else {
        setDragLabel(null);
      }
    },
    [filesById, foldersById],
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragLabel(null);
      const active = event.active.data.current as
        | { type?: string; id?: string }
        | undefined;
      const over = event.over?.data.current as
        | { type?: string; id?: string }
        | undefined;
      if (!active?.id || !over?.id) return;
      if (over.type !== "folder") return;
      if (active.id === over.id) return;

      // Cross-source drop policy: reject when source records aren't from the
      // same backing store. v1 ships with same-source-only moves; cross-source
      // ("import this Note as a real .md") will land in a follow-up.
      const activeRec =
        active.type === "file" ? filesById[active.id] : foldersById[active.id];
      const overRec = foldersById[over.id];
      if (activeRec && overRec) {
        const a = activeRec.source;
        const o = overRec.source;
        if (a.kind !== o.kind) return;
        if (a.kind === "virtual" && o.kind === "virtual") {
          if (a.adapterId !== o.adapterId) return;
        }
      }

      if (active.type === "file") {
        const file = filesById[active.id];
        if (file && file.parentFolderId === over.id) return; // already there
        // Virtual file → adapter move via moveAny.
        if (file?.source.kind === "virtual") {
          void dispatch(moveAny({ id: active.id, newParentId: over.id }));
          return;
        }
        void dispatch(
          moveFileThunk({ fileId: active.id, newParentFolderId: over.id }),
        );
      } else if (active.type === "folder") {
        // Folder → folder move uses updateFolder with parentId patch (the
        // backend cascades child folder_path updates). Guard against:
        //   • dropping onto the current parent (no-op)
        //   • dropping onto a descendant (cycle)
        const moving = foldersById[active.id];
        if (!moving) return;
        if (moving.parentId === over.id) return;
        let cursor: string | null = over.id;
        const seen = new Set<string>();
        while (cursor && !seen.has(cursor)) {
          if (cursor === active.id) return; // cycle — refuse
          seen.add(cursor);
          cursor = foldersById[cursor]?.parentId ?? null;
        }
        if (moving.source.kind === "virtual") {
          void dispatch(moveAny({ id: active.id, newParentId: over.id }));
          return;
        }
        void dispatch(
          updateFolderThunk({
            folderId: active.id,
            patch: { parentId: over.id },
          }),
        );
      }
    },
    [dispatch, filesById, foldersById],
  );
  const handleDragCancel = useCallback(() => setDragLabel(null), []);

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      dispatch(setActiveFolderId(folderId));
      dispatch(setActiveFileId(null));
      // If this is a virtual root or virtual folder we haven't loaded the
      // children of yet, kick off lazy hydration. Re-running for an already-
      // loaded folder is a no-op — `loadVirtualChildren` short-circuits via
      // the slice's `fullyLoadedFolderIds` set.
      const folder = foldersById[folderId];
      if (folder?.source.kind === "virtual") {
        void dispatch(
          loadVirtualChildren({
            adapterId: folder.source.adapterId,
            parentVirtualId:
              folder.source.virtualId === "__root__"
                ? null
                : folder.source.virtualId,
          }),
        );
      }
      // Mirror the activation in the URL pathname so back/forward works
      // for folder browsing and the URL is always shareable. Only sections
      // that own a folder-path URL get rewritten (Recents/Photos/etc. live
      // at fixed pathnames). Real folders only — virtual folders don't
      // have a stable `folder_path` to round-trip against the catch-all
      // route's Supabase lookup.
      if (
        folder &&
        folder.source.kind === "real" &&
        FOLDER_PATH_SECTIONS.includes(section)
      ) {
        const segments = encodeFolderPathSegments(folder.folderPath);
        const target = segments ? `/files/${segments}` : "/files";
        // `router.push` so the back button retraces folder history; the
        // sync layer's `router.replace` updates only the query string.
        router.push(target);
      }
    },
    [dispatch, foldersById, router, section],
  );

  const handleSelectFile = useCallback(
    (fileId: string) => {
      // Activation always opens the inline preview pane — for both real and
      // virtual files. The adapter's `openInRoute` is exposed as a secondary
      // "Open in <feature>" button in the preview action bar so users keep
      // the option of jumping to the dedicated editor without losing the
      // inline-first default.
      dispatch(setActiveFileId(fileId));
    },
    [dispatch],
  );

  const handleFilterToggle = useCallback(
    (key: ChipFilter) => {
      dispatch(setChipFilter(chipFilter === key ? null : key));
    },
    [dispatch, chipFilter],
  );

  const treeLoaded = treeStatus === "loaded";
  const isEmpty =
    treeLoaded &&
    allFolders.filter((f) => !f.deletedAt).length === 0 &&
    allFiles.filter((f) => !f.deletedAt).length === 0;

  // Folder contents for the active folder (or root).
  const rootFolders = useMemo(
    () =>
      allFolders.filter((f) => f.parentId === activeFolderId && !f.deletedAt),
    [allFolders, activeFolderId],
  );
  const rootFiles = useMemo(
    () =>
      allFiles.filter(
        (f) => f.parentFolderId === activeFolderId && !f.deletedAt,
      ),
    [allFiles, activeFolderId],
  );
  // For filter / photos / shared sections, we want tree-wide matches; for
  // trash, we include every deleted file.
  //
  // "Home" (section === "all") behavior:
  //   - At the root (`activeFolderId === null`): we render ALL files in the
  //     tree, plus root-level folders. Users uniformly expect "Home" to
  //     show everything they own; before this fix we only showed root-level
  //     files, which made files inside subfolders invisible at Home and
  //     made the section feel broken.
  //   - Drilled into a folder (`activeFolderId !== null`): we render that
  //     folder's contents, same as the rest of the app.
  // "folders" / "folders-root" stay strictly scoped to the active folder
  // because that section's whole purpose is folder-scoped browsing.
  const scopedFolders = useMemo(() => {
    if (section === "folders" || section === "folders-root") {
      return rootFolders;
    }
    if (section === "all") {
      // At Home, show root folders so users see top-level organization at
      // a glance. Drilled-in views get the active folder's children.
      return rootFolders;
    }
    if (section === "trash") {
      return allFolders.filter((f) => f.deletedAt);
    }
    // Recents view is files-only — folders mixed in would be confusing
    // ("recently changed folder" rarely matches user intent).
    if (section === "recents") {
      return [];
    }
    return allFolders.filter((f) => !f.deletedAt);
  }, [section, rootFolders, allFolders]);
  const scopedFiles = useMemo(() => {
    if (section === "folders" || section === "folders-root") {
      return rootFiles;
    }
    if (section === "all") {
      // At Home with no active folder, show every file the user owns —
      // this is the user-expected "everything" view. Once they drill into
      // a folder, scope down to that folder's files.
      if (activeFolderId === null) {
        return allFiles.filter((f) => !f.deletedAt);
      }
      return rootFiles;
    }
    if (section === "trash") {
      return allFiles.filter((f) => f.deletedAt);
    }
    return allFiles.filter((f) => !f.deletedAt);
  }, [section, rootFiles, allFiles, activeFolderId]);

  // Tree-wide search: when the user types in the TopBar search box, the table
  // should match across the ENTIRE tree, not just the current folder. Without
  // this, a user sitting in folder A would silently fail to find a file in
  // folder B (a regression flagged in the verification audit). The matching
  // happens in `row-data.ts:matchesQuery`; we just hand it the full set when
  // searching, otherwise we keep the folder-scoped behavior.
  // Recents section implicitly applies the "recents" filter chip so the user
  // sees the most recently updated files without having to click anything.
  // Any explicit chip (e.g. "starred") still wins.
  const effectiveFilter =
    chipFilter ?? (section === "recents" ? "recents" : null);
  const isSearching = searchQuery.trim().length > 0;
  const searchScopedFiles = useMemo(() => {
    if (!isSearching) return scopedFiles;
    if (section === "trash") return scopedFiles; // already tree-wide
    return allFiles.filter((f) => !f.deletedAt);
  }, [isSearching, scopedFiles, section, allFiles]);
  const searchScopedFolders = useMemo(() => {
    if (!isSearching) return scopedFolders;
    if (section === "trash") return scopedFolders;
    return allFolders.filter((f) => !f.deletedAt);
  }, [isSearching, scopedFolders, section, allFolders]);

  const showPlaceholder = section === "requests" || section === "activity";
  // The list ALWAYS renders unless we're showing a placeholder section or the
  // empty-onboarding hero. Selecting a file no longer replaces the main pane —
  // preview slides in as a separate side panel on the right.
  const showTableOrGrid =
    !showPlaceholder &&
    !(isEmpty && (section === "all" || section === "folders"));

  const activeFile = activeFileId ? filesById[activeFileId] : null;
  const showPreviewPane = !!activeFile;

  // ---- Preview maximize (full-page-width, in-place, no re-mount) -----------
  // `setLayout` lets us drive the panel sizes imperatively without unmounting
  // the PreviewPane — so long-running tasks inside it (e.g. RAG classification,
  // PDF analysis) keep running across the toggle. The library still owns the
  // sizes; we only stash the layout map before maximizing so we can restore it.
  // See `.claude/skills/react-resizable-panels-v4` §1 "Imperative handles" and
  // the decision-tree row for "Fullscreen one panel".
  const groupRef = useGroupRef();
  const savedLayoutRef = useRef<Layout | null>(null);
  const [previewMaximized, setPreviewMaximized] = useState(false);
  const previewMaximizedRef = useRef(false);
  previewMaximizedRef.current = previewMaximized;

  // ---- Sidebar collapse ----------------------------------------------------
  // The folders sidebar collapses to a slim icon rail (`IconRail`). The library
  // owns the panel width; we only mirror the open/closed *intent* so the rail
  // and the collapse/expand buttons can render. Drag-to-collapse is tracked via
  // `onResize`. Collapse triggered by the maximize feature (which drives SIDE to
  // 0% imperatively) is ignored so it doesn't flip the user-facing intent.
  const sidebarPanelRef = usePanelRef();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Restore the persisted collapsed state once on mount.
  useEffect(() => {
    if (readSidebarCollapsedCookie()) {
      setSidebarCollapsed(true);
      sidebarPanelRef.current?.collapse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const collapseSidebar = useCallback(() => {
    sidebarPanelRef.current?.collapse();
    setSidebarCollapsed(true);
    writeSidebarCollapsedCookie(true);
  }, [sidebarPanelRef]);

  const expandSidebar = useCallback(() => {
    sidebarPanelRef.current?.expand();
    setSidebarCollapsed(false);
    writeSidebarCollapsedCookie(false);
  }, [sidebarPanelRef]);

  const handleSidebarResize = useCallback<OnPanelResize>((next, _id, prev) => {
    if (prev === undefined) return; // first mount
    if (previewMaximizedRef.current) return; // maximize transient — not user intent
    const wasCollapsed = prev.asPercentage === 0;
    const isCollapsed = next.asPercentage === 0;
    if (wasCollapsed !== isCollapsed) {
      setSidebarCollapsed(isCollapsed);
      writeSidebarCollapsedCookie(isCollapsed);
    }
  }, []);

  // If the user closes the preview while it's maximized, fall back to the
  // normal layout so the next file opens in the regular sheet.
  useEffect(() => {
    if (!showPreviewPane && previewMaximized) {
      setPreviewMaximized(false);
      savedLayoutRef.current = null;
    }
  }, [showPreviewPane, previewMaximized]);

  const togglePreviewMaximize = useCallback(() => {
    const group = groupRef.current;
    if (!group || !showPreviewPane) return;
    if (previewMaximized) {
      // Keep the ref true across the synchronous setLayout below so the
      // resulting onResize events aren't mistaken for a user collapse.
      previewMaximizedRef.current = true;
      const saved = savedLayoutRef.current;
      if (saved) group.setLayout(saved);
      savedLayoutRef.current = null;
      previewMaximizedRef.current = false;
      setPreviewMaximized(false);
    } else {
      previewMaximizedRef.current = true;
      savedLayoutRef.current = group.getLayout();
      group.setLayout({
        [PANEL_IDS.SIDE]: 0,
        [PANEL_IDS.MAIN]: 0,
        [PANEL_IDS.PREVIEW]: 100,
      });
      setPreviewMaximized(true);
    }
  }, [groupRef, previewMaximized, showPreviewPane]);

  return (
    <DndContext
      sensors={dndSensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className={cn("flex h-full overflow-hidden bg-background", className)}
      >
        {/* Collapsed sidebar = slim icon rail. Expanding swaps it back for the
         * full NavSidebar. Hidden during preview-maximize so it doesn't eat
         * width from the full-bleed preview. */}
        {sidebarCollapsed && !previewMaximized && (
          <IconRail section={section} onExpand={expandSidebar} />
        )}

        <ResizablePanelGroup
          orientation="horizontal"
          autoSave="matrx-cloud-files-dropbox-v4"
          className="h-full min-h-0 w-full"
          groupRef={groupRef}
        >
          {/* Nav sidebar — collapsible so the imperative maximize call below
           * can drive its size to 0 without minSize fighting it. Normal drag
           * UX is unaffected (minSize is still respected during pointer drag,
           * with auto-collapse only at the lower bound). */}
          <ResizablePanel
            id={PANEL_IDS.SIDE}
            panelRef={sidebarPanelRef}
            defaultSize={pct(sidebarDefaultPercent)}
            minSize={pct(sidebarMinPercent)}
            maxSize={pct(40)}
            collapsible
            collapsedSize="0%"
            onResize={handleSidebarResize}
            className="border-r border-border/70"
          >
            <NavSidebar section={section} onCollapse={collapseSidebar} />
          </ResizablePanel>

          <ResizableHandle
            disabled={previewMaximized || sidebarCollapsed}
            className={cn(
              (previewMaximized || sidebarCollapsed) &&
                "pointer-events-none !opacity-0",
            )}
          />

          {/* Main — also collapsible for the same maximize-to-100 path. */}
          <ResizablePanel
            id={PANEL_IDS.MAIN}
            minSize={pct(showPreviewPane ? 30 : 40)}
            collapsible
            collapsedSize="0%"
          >
            <div className="flex h-full flex-col overflow-hidden">
              <TopBar
                parentFolderId={activeFolderId}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
              />

              {section === "folders" ? (
                <FolderExplorer
                  onSelectFolder={handleSelectFolder}
                  onSelectFile={handleSelectFile}
                />
              ) : (
                <>
                  <ContentHeader
                    section={section}
                    activeFolderId={activeFolderId}
                    activeFilter={chipFilter}
                    onFilterToggle={handleFilterToggle}
                    showActions={
                      !showPlaceholder &&
                      section !== "trash" &&
                      section !== "starred"
                    }
                    showFilterRow={
                      !showPlaceholder &&
                      section !== "trash" &&
                      section !== "starred"
                    }
                  />

                  <div className="flex-1 overflow-hidden">
                    {showPlaceholder ? (
                      <SectionPlaceholder section={section} />
                    ) : isEmpty && section === "all" ? (
                      <FileUploadDropzone
                        parentFolderId={null}
                        mode="overlay"
                        className="h-full w-full"
                        onUploadStart={handleUploadStart}
                        onUploaded={handleUploadedIds}
                        onOpenFile={handleOpenUploadedFile}
                      >
                        <OnboardingEmptyState />
                      </FileUploadDropzone>
                    ) : section === "starred" ? (
                      <EmptyState
                        icon={Star}
                        title="Starred items"
                        comingSoon
                        description="Star any file or folder to pin it here for quick access."
                      />
                    ) : showTableOrGrid ? (
                      <FileUploadDropzone
                        parentFolderId={activeFolderId}
                        mode="overlay"
                        className="h-full w-full"
                        onUploadStart={handleUploadStart}
                        onUploaded={handleUploadedIds}
                        onOpenFile={handleOpenUploadedFile}
                      >
                        {viewMode === "grid" ? (
                          <FileGrid
                            folders={searchScopedFolders}
                            files={searchScopedFiles}
                            permissionsByResourceId={permissionsByResourceId}
                            section={section}
                            searchQuery={searchQuery}
                            filter={effectiveFilter}
                            treeWideSearch={isSearching}
                            onActivateFolder={handleSelectFolder}
                            onActivateFile={handleSelectFile}
                            emptyState={
                              section === "photos" ||
                              section === "shared" ||
                              section === "recents" ||
                              section === "trash" ? (
                                <SectionPlaceholder section={section} />
                              ) : undefined
                            }
                          />
                        ) : (
                          <FileTable
                            folders={searchScopedFolders}
                            files={searchScopedFiles}
                            permissionsByResourceId={permissionsByResourceId}
                            section={section}
                            searchQuery={searchQuery}
                            filter={effectiveFilter}
                            treeWideSearch={isSearching}
                            onActivateFolder={handleSelectFolder}
                            onActivateFile={handleSelectFile}
                            emptyState={
                              section === "photos" ||
                              section === "shared" ||
                              section === "recents" ||
                              section === "trash" ? (
                                <SectionPlaceholder section={section} />
                              ) : undefined
                            }
                          />
                        )}
                      </FileUploadDropzone>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </ResizablePanel>

          {/* Preview pane — only mounted when a file is selected. The user
           * always has an escape: the Close (X) button on the header bar
           * clears `activeFileId`, which collapses this panel and reveals the
           * full file list behind it. The list itself is also still partially
           * visible behind the resize handle — clicking it (e.g. picking a
           * different file) just swaps the previewed file. autoSave keeps the
           * preferred width across mounts. */}
          {showPreviewPane && (
            <>
              <ResizableHandle
                disabled={previewMaximized}
                className={cn(
                  previewMaximized && "pointer-events-none !opacity-0",
                )}
              />
              <ResizablePanel
                id={PANEL_IDS.PREVIEW}
                defaultSize={pct(PREVIEW_DEFAULT_PCT)}
                minSize={pct(PREVIEW_MIN_PCT)}
                maxSize={pct(100)}
                className="border-l border-border/70"
              >
                <PreviewPane
                  key={activeFile!.id}
                  fileId={activeFile!.id}
                  isMaximized={previewMaximized}
                  onToggleMaximize={togglePreviewMaximize}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>

        {/* Bulk-actions toolbar — fixed-position pill at the bottom of the
         * viewport. Renders nothing unless one or more rows are selected. */}
        <BulkActionsBar />

        {/* Confirm dialog for keyboard-shortcut deletes. Destructive ops
         * always go through a dialog so an accidental Backspace press
         * doesn't quietly trash files. */}
        <AlertDialog
          open={shortcuts.pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) shortcuts.clearPendingDelete();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {shortcuts.pendingDelete?.kind === "batch"
                  ? `Delete ${shortcuts.pendingDelete.ids.length} files?`
                  : "Delete file?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {shortcuts.pendingDelete?.kind === "batch"
                  ? "These files will move to trash. You can restore them for 30 days before bytes are removed."
                  : "This will move the file to trash. You can restore it from versions for 30 days before bytes are removed."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void shortcuts.confirmDelete()}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <RenameHost />
        <CloudFileEditorHost />
        <UploadContextPrompt
          open={uploadPromptNames !== null}
          onOpenChange={(o) => {
            if (!o) setUploadPromptNames(null);
          }}
          fileNames={uploadPromptNames ?? []}
          awaitFileIds={() => uploadIdsPromise.current}
        />
        {/* Render-less Redux → URL bridge. Sees every UI-state change
         *  and writes it back to `?…` via `router.replace`. The reverse
         *  direction (URL → Redux) happens once on mount via
         *  `useOneShotUiHydration` from the server-parsed `initialUiPatch`. */}
        <FilesUrlSync />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragLabel ? (
          <div className="pointer-events-none flex items-center gap-2 rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md">
            <FileIcon
              fileName={dragLabel.includes(".") ? dragLabel : undefined}
              isFolder={!dragLabel.includes(".")}
              size={14}
            />
            <span className="max-w-[200px] truncate font-medium">
              {dragLabel}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SectionPlaceholder({ section }: { section: CloudFilesSection }) {
  if (section === "requests") {
    return (
      <EmptyState
        icon={FileInput}
        title="File requests"
        comingSoon
        description="Collect files from anyone with a shareable link. Requests will be tracked here."
      />
    );
  }
  if (section === "activity") {
    return (
      <EmptyState
        icon={Activity}
        title="Activity"
        comingSoon
        description="A live feed of uploads, shares, and edits across your files will appear here."
      />
    );
  }
  if (section === "shared") {
    return (
      <EmptyState
        icon={Share2}
        title="Nothing shared yet"
        description="Files and folders shared with you will appear here."
      />
    );
  }
  if (section === "photos") {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No photos yet"
        description="Image files you upload will appear here automatically."
      />
    );
  }
  if (section === "trash") {
    return (
      <EmptyState
        icon={Trash2}
        title="Trash is empty"
        description="Deleted files stay here for 30 days before they're purged."
      />
    );
  }
  if (section === "recents") {
    return (
      <EmptyState
        icon={Clock}
        title="No recent activity"
        description="Files you upload or edit will show up here, newest first."
      />
    );
  }
  return null;
}

interface FolderExplorerProps {
  onSelectFolder: (id: string) => void;
  onSelectFile: (id: string) => void;
}

function FolderExplorer({ onSelectFolder, onSelectFile }: FolderExplorerProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3 shrink-0">
        <FileStack className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-lg font-semibold tracking-tight">Folders</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <FileTree
          onSelectFile={onSelectFile}
          onSelectFolder={onSelectFolder}
          onActivateFolder={onSelectFolder}
          onActivateFile={onSelectFile}
          className="h-full"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useOneShotSelection(
  initialFolderId: string | null | undefined,
  initialFileId: string | null | undefined,
): void {
  const dispatch = useAppDispatch();
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
    if (initialFolderId !== undefined) {
      dispatch(setActiveFolderId(initialFolderId));
    }
    if (initialFileId !== undefined) {
      dispatch(setActiveFileId(initialFileId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Apply a server-parsed `initialUiPatch` (sort, filters, view, etc.) to
 * Redux exactly once on mount. Mirrors `useOneShotSelection` — the
 * server route is the single source of truth for the URL → state
 * transformation, and FilesUrlSync handles every subsequent change.
 *
 * No-op when `patch` is undefined or empty. Uses `setUiBatch` so all
 * fields land in a single dispatch (one re-render, not N).
 */
function useOneShotUiHydration(patch: Partial<UiState> | undefined): void {
  const dispatch = useAppDispatch();
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
    if (!patch) return;
    if (Object.keys(patch).length === 0) return;
    dispatch(setUiBatch(patch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
