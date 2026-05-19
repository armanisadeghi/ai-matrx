/**
 * features/files/components/surfaces/WindowPanelShell.tsx
 *
 * Body for CloudFilesWindow (registered in features/window-panels). Renders
 * the sidebar + tabbed main layout within a WindowPanel. This component does
 * NOT render WindowPanel itself — Phase 6 creates CloudFilesWindow which
 * wraps this body inside features/window-panels/windows/CloudFilesWindow.tsx.
 *
 * Tabs:
 *   • Browse  — full FileTree + FileList, matches PageShell main.
 *   • Recent  — list of recent files (most-recently updated).
 *   • Shared  — files shared with me (visibility=shared and owner≠me).
 *   • Trash   — soft-deleted files (deleted_at != null).
 *
 * The sidebar (FileTree) is only shown for the Browse tab.
 */

"use client";

import { useMemo, useState } from "react";
import { Clock, FolderOpen, Trash2, Users } from "lucide-react";
import { DndContext } from "@dnd-kit/core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllFilesArray,
  selectActiveFolderId,
} from "@/features/files/redux/selectors";
import { FileTree } from "@/features/files/components/core/FileTree/FileTree";
import { FileList } from "@/features/files/components/core/FileList/FileList";
import { FilePreview } from "@/features/files/components/core/FilePreview/FilePreview";
import { FileBreadcrumbs } from "@/features/files/components/core/FileBreadcrumbs/FileBreadcrumbs";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { FileMeta } from "@/features/files/components/core/FileMeta/FileMeta";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setActiveFileId, setActiveFolderId } from "@/features/files/redux/slice";

export type CloudFilesWindowTab = "browse" | "recent" | "shared" | "trash";

export interface WindowPanelShellProps {
  /** Tab controlled externally (so WindowPanel's data persistence can store it). */
  activeTab?: CloudFilesWindowTab;
  onTabChange?: (tab: CloudFilesWindowTab) => void;
  className?: string;
}

export function WindowPanelShell({
  activeTab: activeTabProp,
  onTabChange,
  className,
}: WindowPanelShellProps) {
  const [internalTab, setInternalTab] = useState<CloudFilesWindowTab>("browse");
  const activeTab = activeTabProp ?? internalTab;

  const setTab = (tab: CloudFilesWindowTab) => {
    if (onTabChange) onTabChange(tab);
    else setInternalTab(tab);
  };

  return (
    // FileTree (rendered inside BrowseTab below) calls `useDndMonitor` to
    // listen for drag events. It REQUIRES a DndContext ancestor — the public
    // /files route gets one from PageShell, but the window shell doesn't have
    // a natural top-level DndContext, so we provide a minimal one here. No
    // drag handlers are wired yet (drag-to-organize inside the window is a
    // future enhancement); FileTree's monitor will simply observe an empty
    // stream of drag events, which is fine. FileList renders its own inner
    // DndContext for the file-row dragging that surface already supports.
    <DndContext>
      <div
        className={cn("flex h-full w-full flex-col overflow-hidden", className)}
      >
        <Tabs
          value={activeTab}
          onValueChange={(value) => setTab(value as CloudFilesWindowTab)}
          className="flex flex-1 flex-col overflow-hidden"
        >
        <TabsList className="mx-2 mt-2 shrink-0 self-start">
          <TabsTrigger value="browse" className="gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />
            Browse
          </TabsTrigger>
          <TabsTrigger value="recent" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Recent
          </TabsTrigger>
          <TabsTrigger value="shared" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Shared
          </TabsTrigger>
          <TabsTrigger value="trash" className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            Trash
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="browse"
          className="flex-1 mt-2 mx-0 overflow-hidden data-[state=inactive]:hidden"
        >
          <BrowseTab />
        </TabsContent>
        <TabsContent
          value="recent"
          className="flex-1 mt-2 mx-2 overflow-hidden data-[state=inactive]:hidden"
        >
          <RecentTab />
        </TabsContent>
        <TabsContent
          value="shared"
          className="flex-1 mt-2 mx-2 overflow-hidden data-[state=inactive]:hidden"
        >
          <SharedTab />
        </TabsContent>
        <TabsContent
          value="trash"
          className="flex-1 mt-2 mx-2 overflow-hidden data-[state=inactive]:hidden"
        >
          <TrashTab />
        </TabsContent>
        </Tabs>
      </div>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function BrowseTab() {
  const dispatch = useAppDispatch();
  const activeFolderId = useAppSelector(selectActiveFolderId);
  const activeFileId = useAppSelector((s) => s.cloudFiles.ui.activeFileId);

  return (
    <div className="grid h-full grid-cols-[220px_1fr] overflow-hidden">
      <div className="h-full overflow-hidden border-r">
        <FileTree
          onSelectFolder={(id) => {
            dispatch(setActiveFolderId(id));
            dispatch(setActiveFileId(null));
          }}
          onSelectFile={(id) => dispatch(setActiveFileId(id))}
          onActivateFolder={(id) => {
            dispatch(setActiveFolderId(id));
            dispatch(setActiveFileId(null));
          }}
          onActivateFile={(id) => dispatch(setActiveFileId(id))}
        />
      </div>
      <div className="flex flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-muted/20 px-3 py-1.5">
          <FileBreadcrumbs
            folderId={activeFolderId}
            onNavigate={(id) => {
              dispatch(setActiveFolderId(id));
              dispatch(setActiveFileId(null));
            }}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          {activeFileId ? (
            <FilePreview fileId={activeFileId} className="h-full w-full" />
          ) : (
            <FileList
              folderId={activeFolderId}
              onActivateFile={(id) => dispatch(setActiveFileId(id))}
              onActivateFolder={(id) => {
                dispatch(setActiveFolderId(id));
                dispatch(setActiveFileId(null));
              }}
              className="h-full w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Recent / Shared / Trash share a simple "flat file list" shape --------

interface FlatFilesTabProps {
  emptyMessage: string;
  filter: (file: ReturnType<typeof useAllFiles>[number]) => boolean;
  sort?: (
    a: ReturnType<typeof useAllFiles>[number],
    b: ReturnType<typeof useAllFiles>[number],
  ) => number;
}

function useAllFiles() {
  return useAppSelector(selectAllFilesArray);
}

function FlatFilesTab({ emptyMessage, filter, sort }: FlatFilesTabProps) {
  const dispatch = useAppDispatch();
  const files = useAllFiles();
  const displayed = useMemo(() => {
    const pool = files.filter(filter);
    if (sort) pool.sort(sort);
    return pool;
  }, [files, filter, sort]);

  if (displayed.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="h-full w-full divide-y overflow-auto">
      {displayed.map((file) => (
        <li key={file.id}>
          <button
            type="button"
            onClick={() => dispatch(setActiveFileId(file.id))}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/60"
          >
            <FileIcon fileName={file.fileName} size={16} />
            <div className="flex-1 min-w-0">
              <div className="truncate">{file.fileName}</div>
              <FileMeta
                file={{
                  fileSize: file.fileSize,
                  updatedAt: file.updatedAt,
                  visibility: file.visibility,
                }}
                className="mt-0.5"
              />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecentTab() {
  return (
    <FlatFilesTab
      emptyMessage="No recent files."
      filter={(f) => !f.deletedAt}
      sort={(a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")}
    />
  );
}

function SharedTab() {
  return (
    <FlatFilesTab
      emptyMessage="Nothing has been shared with you yet."
      filter={(f) => !f.deletedAt && f.visibility === "shared"}
    />
  );
}

function TrashTab() {
  return (
    <FlatFilesTab
      emptyMessage="Trash is empty."
      filter={(f) => f.deletedAt != null}
      sort={(a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")}
    />
  );
}
