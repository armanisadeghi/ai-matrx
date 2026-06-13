/**
 * features/files/components/surfaces/dropbox/FileGrid.tsx
 *
 * Card-grid view of files and folders — matches the second Dropbox screenshot
 * (thumbnails with file name + "EXT • size" meta line). Shares filtering
 * logic with FileTable via `row-data.buildRows`.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveFileId,
  selectFocusedId,
  selectKindFilter,
  selectAllFoldersMap,
  selectSelection,
  selectSort,
} from "@/features/files/redux/selectors";
import {
  setActiveFileId,
  setActiveFolderId,
  setFocusedId,
  toggleSelection,
} from "@/features/files/redux/slice";
import { ShareLinkDialog } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { useInfiniteWindow } from "@/features/files/hooks/useInfiniteWindow";
import type {
  CloudFilePermission,
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files/types";
import { FileGridCell } from "./FileGridCell";
import { buildRows, isSharedResource } from "./row-data";
import type { FilterChipKey } from "./FilterChips";
import type { CloudFilesSection } from "./section";

export interface FileGridProps {
  folders: CloudFolderRecord[];
  files: CloudFileRecord[];
  permissionsByResourceId: Record<string, CloudFilePermission[]>;
  section: CloudFilesSection;
  searchQuery: string;
  filter: FilterChipKey | null;
  /** True when this grid is rendering tree-wide search results — drives the
   * banner above the grid + per-cell breadcrumb subtitle. */
  treeWideSearch?: boolean;
  onActivateFolder: (folderId: string) => void;
  onActivateFile: (fileId: string) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

interface ShareDialogState {
  resourceId: string;
  resourceType: "file" | "folder";
}

export function FileGrid({
  folders,
  files,
  permissionsByResourceId,
  section,
  searchQuery,
  filter,
  treeWideSearch = false,
  onActivateFolder,
  onActivateFile,
  emptyState,
  className,
}: FileGridProps) {
  const dispatch = useAppDispatch();
  const selection = useAppSelector(selectSelection);
  const activeFileId = useAppSelector(selectActiveFileId);
  const focusedId = useAppSelector(selectFocusedId);
  const foldersById = useAppSelector(selectAllFoldersMap);

  const resolveFolderPath = useCallback(
    (folderId: string | null): string => {
      if (!folderId) return "/";
      const segments: string[] = [];
      let cursor: string | null = folderId;
      let depth = 0;
      while (cursor && depth < 32) {
        const folder = foldersById[cursor];
        if (!folder) break;
        segments.unshift(folder.folderName);
        cursor = folder.parentId;
        depth += 1;
      }
      return segments.length ? segments.join(" / ") : "/";
    },
    [foldersById],
  );

  const kindFilter = useAppSelector(selectKindFilter);
  const { sortBy, sortDir } = useAppSelector(selectSort);
  // FileGrid never paginates / caps; it just needs the rows. Discard
  // `totalBeforeCap` / `capped` — only FileTable renders those banners.
  const { rows } = useMemo(
    () =>
      buildRows({
        folders,
        files,
        section,
        searchQuery,
        filter,
        kindFilter,
        permissionsByResourceId,
        sortBy,
        sortDir,
      }),
    [
      folders,
      files,
      section,
      searchQuery,
      filter,
      kindFilter,
      permissionsByResourceId,
      sortBy,
      sortDir,
    ],
  );

  // Infinite scroll. Initial 60 cells = 4–6 visible rows depending on
  // breakpoint, which fills the viewport on every screen size. Reset
  // when the user navigates between sections / searches / filters.
  const resetKey = `${section}|${searchQuery}|${filter ?? ""}|${kindFilter}|${sortBy}:${sortDir}`;
  const { visibleCount, hasMore, sentinelRef, ensureIndexVisible } =
    useInfiniteWindow({
      total: rows.length,
      initial: 60,
      pageSize: 60,
      resetKey,
    });
  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount],
  );

  // Reveal a programmatically-focused cell (e.g. just-uploaded file) that
  // would otherwise sit below the rendered window.
  useEffect(() => {
    if (!focusedId) return;
    const idx = rows.findIndex((r) =>
      r.kind === "file" ? r.file.id === focusedId : r.folder.id === focusedId,
    );
    if (idx >= 0) ensureIndexVisible(idx);
  }, [focusedId, rows, ensureIndexVisible]);

  const [shareTarget, setShareTarget] = useState<ShareDialogState | null>(null);

  const handleActivate = useCallback(
    (row: (typeof rows)[number]) => {
      if (row.kind === "folder") {
        dispatch(setActiveFolderId(row.folder.id));
        dispatch(setActiveFileId(null));
        dispatch(setFocusedId(row.folder.id));
        onActivateFolder(row.folder.id);
      } else {
        dispatch(setActiveFileId(row.file.id));
        dispatch(setFocusedId(row.file.id));
        onActivateFile(row.file.id);
      }
    },
    [dispatch, onActivateFolder, onActivateFile],
  );

  // DnD wired at PageShell level so cells can be dropped onto NavSidebar
  // folders too. We just contribute draggable/droppable nodes here.

  if (rows.length === 0) {
    if (treeWideSearch) {
      return (
        <div
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center",
            className,
          )}
        >
          <SearchIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            No matches for &ldquo;{searchQuery}&rdquo;
          </p>
          <p className="text-xs text-muted-foreground">
            Tried searching across all folders.
          </p>
        </div>
      );
    }
    if (emptyState) {
      return <div className={cn("h-full w-full", className)}>{emptyState}</div>;
    }
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {filter === "starred"
          ? "Starred items will appear here."
          : "No files yet. Use the + New button or drop files to upload."}
      </div>
    );
  }

  return (
    <div
      className={cn("flex h-full w-full flex-col overflow-hidden", className)}
    >
      {treeWideSearch ? (
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground shrink-0">
          <SearchIcon className="h-3.5 w-3.5" />
          <span>
            Showing {rows.length} {rows.length === 1 ? "result" : "results"}{" "}
            from all folders for &ldquo;
            <span className="font-medium text-foreground">{searchQuery}</span>
            &rdquo;
          </span>
        </div>
      ) : null}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleRows.map((row) => {
            const id = row.kind === "file" ? row.file.id : row.folder.id;
            const visibility =
              row.kind === "file" ? row.file.visibility : row.folder.visibility;
            const isShared = isSharedResource(
              id,
              visibility,
              permissionsByResourceId,
            );
            const selected = selection.selectedIds.includes(id);
            const isPreviewActive =
              row.kind === "file" && row.file.id === activeFileId;
            const parentFolderId =
              row.kind === "file"
                ? row.file.parentFolderId
                : row.folder.parentId;
            const parentPath = treeWideSearch
              ? resolveFolderPath(parentFolderId ?? null)
              : null;
            return (
              <FileGridCell
                key={id}
                kind={row.kind}
                file={row.kind === "file" ? row.file : undefined}
                folder={row.kind === "folder" ? row.folder : undefined}
                selected={selected}
                isPreviewActive={isPreviewActive}
                isFocused={focusedId === id}
                isShared={isShared}
                onToggleSelected={() => {
                  dispatch(toggleSelection({ id }));
                  dispatch(setFocusedId(id));
                }}
                onActivate={() => handleActivate(row)}
                onOpenShare={() =>
                  setShareTarget({
                    resourceId: id,
                    resourceType: row.kind,
                  })
                }
                parentPath={parentPath}
              />
            );
          })}
        </div>
        {/*
          Sentinel + footer for infinite scroll. Lives BELOW the grid
          (not inside) because the grid is a `grid` container — a
          grid item with `col-span` would interfere with column
          balancing on the last visible row. Outside the grid we get
          a clean centered footer regardless of how many cells are
          rendered above.
        */}
        {hasMore ? (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center gap-2 pt-6 pb-2 text-[11px] text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Loading more…
          </div>
        ) : rows.length > 60 ? (
          <div className="pt-6 pb-2 text-center text-[11px] text-muted-foreground">
            Showing all {rows.length.toLocaleString()} items.
          </div>
        ) : null}
      </div>

      {shareTarget ? (
        <ShareLinkDialog
          open={!!shareTarget}
          onOpenChange={(open) => {
            if (!open) setShareTarget(null);
          }}
          resourceId={shareTarget.resourceId}
          resourceType={shareTarget.resourceType}
        />
      ) : null}
    </div>
  );
}
