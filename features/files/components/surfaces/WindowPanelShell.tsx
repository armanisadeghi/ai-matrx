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
 *   • Search  — tree-wide file/folder search with direct result activation.
 *   • Upload  — dedicated drag/drop, paste, and file-picker surface.
 *   • Recent  — list of recent files (most-recently updated).
 *   • Shared  — files shared with me (visibility=shared and owner≠me).
 *   • Trash   — soft-deleted files (deleted_at != null).
 *
 * The sidebar (FileTree) is only shown for the Browse tab.
 */

"use client";

import { useMemo, useState } from "react";
import {
  Clock,
  FileSearch,
  FolderOpen,
  Loader2,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
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
import { FileUploadDropzone } from "@/features/files/components/core/FileUploadDropzone/FileUploadDropzone";
import { useFileSearch } from "@/features/files/hooks/useFileSearch";
import { ProInput } from "@/components/official/ProInput";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  setActiveFileId,
  setActiveFolderId,
} from "@/features/files/redux/slice";

export type CloudFilesWindowTab =
  "browse" | "search" | "upload" | "recent" | "shared" | "trash";

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
            <TabsTrigger value="search" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Search
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Upload
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
            value="search"
            className="flex-1 mt-2 mx-2 overflow-hidden data-[state=inactive]:hidden"
          >
            <SearchTab onOpenBrowse={() => setTab("browse")} />
          </TabsContent>
          <TabsContent
            value="upload"
            className="flex-1 mt-2 mx-2 overflow-auto data-[state=inactive]:hidden"
          >
            <UploadTab />
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
              showContext
              className="h-full w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SearchTab({ onOpenBrowse }: { onOpenBrowse: () => void }) {
  const dispatch = useAppDispatch();
  const { query, setQuery, files, folders, totalResults, isPending, clear } =
    useFileSearch({ limit: 100 });
  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 pb-4 pt-2">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Search your files</h2>
          <p className="text-sm text-muted-foreground">
            Search names, folder paths, and exact file IDs across your entire
            library.
          </p>
        </div>
        <ProInput
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={clear}
          placeholder="Try a filename, folder, extension, or file ID"
          aria-label="Search your files and folders"
          clearable
          enableVoice={false}
          startIcon={
            isPending ? (
              <Loader2
                className="h-4 w-4 animate-spin"
                aria-label="Searching"
              />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )
          }
          wrapperClassName="w-full"
          className="rounded-xl bg-muted/30"
        />
        {hasQuery && !isPending ? (
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            {totalResults} {totalResults === 1 ? "result" : "results"}
            {folders.length > 0 ? ` · ${folders.length} folders` : ""}
            {files.length > 0 ? ` · ${files.length} files` : ""}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!hasQuery ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 rounded-2xl bg-primary/10 p-4 text-primary">
              <FileSearch className="h-8 w-8" aria-hidden="true" />
            </div>
            <p className="font-medium">Find anything in your library</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Results span every loaded folder, so you don&apos;t need to
              remember where something was saved.
            </p>
          </div>
        ) : !isPending && totalResults === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <FileSearch
              className="mb-3 h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="font-medium">No matches for “{query.trim()}”</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a shorter name, a file extension such as PDF, or part of a
              folder path.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {folders.length > 0 ? (
              <section aria-labelledby="file-search-folders">
                <h3
                  id="file-search-folders"
                  className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Folders
                </h3>
                <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        dispatch(setActiveFolderId(folder.id));
                        dispatch(setActiveFileId(null));
                        onOpenBrowse();
                      }}
                      className="flex min-w-0 items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left hover:border-border hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <FolderOpen
                        className="h-5 w-5 shrink-0 text-blue-500"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {folder.folderName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {folder.folderPath || "Top level"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {files.length > 0 ? (
              <section aria-labelledby="file-search-files">
                <h3
                  id="file-search-files"
                  className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Files
                </h3>
                <div className="divide-y rounded-lg border">
                  {files.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => {
                        dispatch(setActiveFolderId(file.parentFolderId));
                        dispatch(setActiveFileId(file.id));
                        onOpenBrowse();
                      }}
                      className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <FileIcon fileName={file.fileName} size={20} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {file.fileName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {file.filePath}
                        </span>
                      </span>
                      <FileMeta
                        file={{
                          fileSize: file.fileSize,
                          updatedAt: file.updatedAt,
                          visibility: file.visibility,
                        }}
                        className="hidden shrink-0 sm:flex"
                      />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadTab() {
  const dispatch = useAppDispatch();
  const activeFolderId = useAppSelector(selectActiveFolderId);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Upload files</h2>
        <p className="text-sm text-muted-foreground">
          Add files to the selected folder, or choose another destination from
          Browse.
        </p>
      </div>
      <div className="rounded-md border bg-muted/20 px-3 py-2">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Destination
        </div>
        <FileBreadcrumbs
          folderId={activeFolderId}
          onNavigate={(id) => dispatch(setActiveFolderId(id))}
        />
      </div>
      <FileUploadDropzone
        parentFolderId={activeFolderId}
        mode="inline"
        className="min-h-64 flex-1"
      />
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
