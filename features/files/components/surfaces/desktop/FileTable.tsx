/**
 * features/files/components/surfaces/desktop/FileTable.tsx
 *
 * Sortable, configurable file table — Box.com / Google-Drive-style. Columns
 * are driven by `cloudFiles.ui.visibleColumns` so users can mount/unmount
 * Type, Owner, Created, Extension, MIME, Path, and Version on top of the
 * always-on Name + Access columns.
 *
 * Sort and per-column filter state live in Redux (`cloudFiles.ui`). This
 * component is responsible only for rendering, computing dropdown
 * options (owner counts, type counts) and dispatching changes — every
 * column's body is rendered by `FileTableRow`.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectActiveFileId,
  selectColumnFilters,
  selectFocusedId,
  selectIsRagFetching,
  selectKindFilter,
  selectAllFoldersMap,
  selectRagStatuses,
  selectSelection,
  selectSort,
  selectVisibleColumns,
} from "@/features/files/redux/selectors";
import {
  clearSelection,
  setActiveFileId,
  setActiveFolderId,
  setColumnFilter,
  setFocusedId,
  setSelection,
  setSort,
  toggleSelection,
} from "@/features/files/redux/slice";
import { prefetchRagStatusesForFiles } from "@/features/files/redux/rag-thunks";
import { primeEntityScopes } from "@/features/scopes/components/context-assignment/data";
import type {
  AccessFilter,
  CloudFilePermission,
  CloudFileRecord,
  CloudFolderRecord,
  ColumnId,
  ModifiedFilter,
  RagStatus,
  SizeFilter,
  SortBy,
  SortDirection,
} from "@/features/files/types";
import {
  type FileCategory,
  getFileTypeDetails,
} from "@/features/files/utils/file-types";
import { ShareLinkDialog } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { useInfiniteWindow } from "@/features/files/hooks/useInfiniteWindow";
import type { CloudFilesSection } from "./section";
import {
  buildRows,
  isSharedResource,
  memberCountForResource,
} from "./row-data";
import type { FilterChipKey } from "./FilterChips";
import { FileTableRow } from "./FileTableRow";
import { ColumnHeader } from "./ColumnHeader";
import { ActiveColumnFilters } from "./ActiveColumnFilters";
import { ColumnSettings } from "./ColumnSettings";
import { COLUMN_SPECS, visibleColumnIds } from "./columns";
import { TypeFilterPicker } from "./TypeFilterPicker";
import { OwnerFilterPicker, type OwnerOption } from "./OwnerFilterPicker";
import { RagFilterPicker } from "./RagFilterPicker";

export interface FileTableProps {
  folders: CloudFolderRecord[];
  files: CloudFileRecord[];
  permissionsByResourceId: Record<string, CloudFilePermission[]>;
  section: CloudFilesSection;
  searchQuery: string;
  filter: FilterChipKey | null;
  /** True when `folders` + `files` represent the entire tree (search mode),
   * not just the active folder. Drives the "Showing results from all folders"
   * banner and the per-row breadcrumb that disambiguates results. */
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

/**
 * Total number of <th> + <td> cells per row, used by the loading sentinel
 * and the "Showing all N items." footer's `colSpan`. Recomputed on every
 * render — visibleIds.length grows / shrinks with the column-settings
 * dropdown, and the +2 covers the leading checkbox cell and the trailing
 * gear cell.
 */
function totalColSpan(visibleCount: number): number {
  return visibleCount + 2;
}

export function FileTable({
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
}: FileTableProps) {
  const dispatch = useAppDispatch();
  const selection = useAppSelector(selectSelection);
  const activeFileId = useAppSelector(selectActiveFileId);
  const focusedId = useAppSelector(selectFocusedId);
  const { sortBy, sortDir } = useAppSelector(selectSort);
  const kindFilter = useAppSelector(selectKindFilter);
  const columnFilters = useAppSelector(selectColumnFilters);
  const visibleColumns = useAppSelector(selectVisibleColumns);
  const currentUserId = useAppSelector(selectUserId);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const ragStatuses = useAppSelector(selectRagStatuses);
  const isRagFetching = useAppSelector(selectIsRagFetching);

  const visibleIds = useMemo(
    () => visibleColumnIds(visibleColumns),
    [visibleColumns],
  );

  const { rows, totalBeforeCap, capped } = useMemo(
    () =>
      buildRows({
        folders,
        files,
        section,
        searchQuery,
        filter,
        kindFilter,
        columnFilters,
        permissionsByResourceId,
        ragStatusByFileId: ragStatuses,
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
      columnFilters,
      permissionsByResourceId,
      ragStatuses,
      sortBy,
      sortDir,
    ],
  );

  // Owner options for the Owner column dropdown. Computed from the input
  // (unfiltered by other columns) so users always see every owner they
  // *could* filter to — Google Drive does the same. The current user is
  // pinned to the top and labeled "You". Counts reflect the unfiltered
  // input set so they're stable as the user toggles other filters.
  const ownerOptions = useMemo<OwnerOption[]>(() => {
    const counts = new Map<string, number>();
    for (const f of files) {
      if (!f.ownerId) continue;
      counts.set(f.ownerId, (counts.get(f.ownerId) ?? 0) + 1);
    }
    for (const fo of folders) {
      if (!fo.ownerId) continue;
      counts.set(fo.ownerId, (counts.get(fo.ownerId) ?? 0) + 1);
    }
    const out: OwnerOption[] = [];
    for (const [ownerId, count] of counts) {
      out.push({
        ownerId,
        label: ownerId === currentUserId ? "You" : shortLabelFor(ownerId),
        count,
      });
    }
    out.sort((a, b) => {
      if (a.ownerId === currentUserId) return -1;
      if (b.ownerId === currentUserId) return 1;
      return b.count - a.count;
    });
    return out;
  }, [files, folders, currentUserId]);

  // Type counts for the Type column dropdown. Same "from raw input" rule:
  // counts are stable across other filter changes so users can keep their
  // mental map of how the dataset breaks down by category.
  const typeCounts = useMemo<Partial<Record<FileCategory, number>>>(() => {
    const out: Partial<Record<FileCategory, number>> = {};
    if (folders.length > 0) {
      out.FOLDER = folders.length;
    }
    for (const f of files) {
      const cat = getFileTypeDetails(f.fileName).category;
      out[cat] = (out[cat] ?? 0) + 1;
    }
    return out;
  }, [files, folders]);

  // RAG status counts for the RAG column dropdown. We deliberately count
  // against the FILE input set (not the rendered rows) so the breakdown
  // reflects the universe the user could re-filter to. Files with no
  // status yet are bucketed into `unknown` so the column always has a
  // truthful "X files not yet checked" line in the picker.
  const ragColumnVisible = !!visibleColumns.rag_status;
  const ragFileIds = useMemo(() => files.map((f) => f.id), [files]);
  const ragCounts = useMemo<Partial<Record<RagStatus, number>>>(() => {
    const out: Partial<Record<RagStatus, number>> = {};
    for (const id of ragFileIds) {
      const st = ragStatuses[id] ?? "unknown";
      out[st] = (out[st] ?? 0) + 1;
    }
    return out;
  }, [ragFileIds, ragStatuses]);

  // Auto-prefetch RAG status for every file in the current dataset
  // whenever the column is visible. The thunk skips ids whose status is
  // already known, so toggling other filters / scrolling does not refire
  // the fetch — only newly-loaded files trigger work.
  useEffect(() => {
    if (!ragColumnVisible) return;
    if (ragFileIds.length === 0) return;
    void dispatch(
      prefetchRagStatusesForFiles({ fileIds: ragFileIds, force: false }),
    );
  }, [ragColumnVisible, ragFileIds, dispatch]);

  // Prime the Context column's row-scope store: ONE bulk
  // ctx_scope_assignments query per page of files in view
  // (primeEntityScopes itself skips already-known ids).
  const contextColumnVisible = visibleIds.includes("context");
  useEffect(() => {
    if (!contextColumnVisible || files.length === 0) return;
    primeEntityScopes(
      "file",
      files.map((f) => f.id),
    );
  }, [contextColumnVisible, files]);

  const refreshRagStatuses = useCallback(() => {
    if (ragFileIds.length === 0) return;
    void dispatch(
      prefetchRagStatusesForFiles({ fileIds: ragFileIds, force: true }),
    );
  }, [ragFileIds, dispatch]);

  // Infinite scroll — slice the rows window. Resets to the top
  // whenever the user changes context (section / folder / filters /
  // search / sort / visible columns).
  const resetKey = `${section}|${searchQuery}|${filter ?? ""}|${kindFilter}|${sortBy}:${sortDir}|${JSON.stringify(columnFilters)}|${visibleIds.join(",")}`;
  const { visibleCount, hasMore, sentinelRef } = useInfiniteWindow({
    total: rows.length,
    initial: 50,
    pageSize: 50,
    resetKey,
  });
  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount],
  );

  // Resolve "Parent/Child" path for a given folder id. Cached per-render via
  // `useCallback` + `Map`; folder hierarchies are typically <5 levels deep so
  // the recursion cost is negligible.
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

  const [shareTarget, setShareTarget] = useState<ShareDialogState | null>(null);

  const allIds = useMemo(
    () => rows.map((r) => (r.kind === "file" ? r.file.id : r.folder.id)),
    [rows],
  );
  const allSelected =
    allIds.length > 0 &&
    allIds.every((id) => selection.selectedIds.includes(id));

  const toggleAll = useCallback(() => {
    if (allSelected) {
      dispatch(clearSelection());
    } else {
      dispatch(setSelection({ selectedIds: allIds, anchorId: null }));
    }
  }, [dispatch, allIds, allSelected]);

  const handleRowActivate = useCallback(
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
      {capped ? (
        <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-warning shrink-0">
          <span>
            Showing the {rows.length.toLocaleString()} most-recent of{" "}
            <span className="font-medium">
              {totalBeforeCap.toLocaleString()}
            </span>{" "}
            items. Open a folder or use search to see older history.
          </span>
        </div>
      ) : null}
      <ActiveColumnFilters />
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-8 px-2 py-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              {visibleIds.map((id) => (
                <FileTableHeaderCell
                  key={id}
                  id={id}
                  activeSortBy={sortBy}
                  activeSortDir={sortDir}
                  onChangeSort={(next) => dispatch(setSort(next))}
                  columnFilters={columnFilters}
                  onChangeFilter={(action) => dispatch(setColumnFilter(action))}
                  ownerOptions={ownerOptions}
                  typeCounts={typeCounts}
                  ragCounts={ragCounts}
                  isRagFetching={isRagFetching}
                  onRefreshRag={refreshRagStatuses}
                />
              ))}
              <th className="w-10 px-1 py-1 text-right">
                <ColumnSettings className="ml-auto" />
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const id = row.kind === "file" ? row.file.id : row.folder.id;
              const visibility =
                row.kind === "file"
                  ? row.file.visibility
                  : row.folder.visibility;
              const perms = permissionsByResourceId[id] ?? [];
              const granteeIds = perms.map((p) => p.granteeId);
              const memberCount = memberCountForResource(
                id,
                permissionsByResourceId,
              );
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
                <FileTableRow
                  key={id}
                  kind={row.kind}
                  file={row.kind === "file" ? row.file : undefined}
                  folder={row.kind === "folder" ? row.folder : undefined}
                  selected={selected}
                  isPreviewActive={isPreviewActive}
                  isFocused={focusedId === id}
                  visibleColumnIds={visibleIds}
                  currentUserId={currentUserId}
                  onToggleSelected={() => {
                    dispatch(toggleSelection({ id }));
                    dispatch(setFocusedId(id));
                  }}
                  onActivate={() => handleRowActivate(row)}
                  onOpenShare={() =>
                    setShareTarget({
                      resourceId: id,
                      resourceType: row.kind,
                    })
                  }
                  isShared={isShared}
                  memberCount={memberCount}
                  granteeIds={granteeIds}
                  parentPath={parentPath}
                />
              );
            })}
            {hasMore ? (
              <tr ref={sentinelRef as React.LegacyRef<HTMLTableRowElement>}>
                <td
                  colSpan={totalColSpan(visibleIds.length)}
                  className="px-4 py-4 text-center"
                >
                  <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    Loading more…
                  </span>
                </td>
              </tr>
            ) : rows.length > 50 ? (
              <tr>
                <td
                  colSpan={totalColSpan(visibleIds.length)}
                  className="px-4 py-3 text-center text-[11px] text-muted-foreground"
                >
                  Showing all {rows.length.toLocaleString()} items.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
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

// ── Header cell — picks the right filter UI per column id ─────────────────

interface FileTableHeaderCellProps {
  id: ColumnId;
  activeSortBy: SortBy;
  activeSortDir: SortDirection;
  onChangeSort: (next: { sortBy: SortBy; sortDir: SortDirection }) => void;
  columnFilters: ReturnType<typeof selectColumnFilters>;
  onChangeFilter: (action: Parameters<typeof setColumnFilter>[0]) => void;
  ownerOptions: OwnerOption[];
  typeCounts: Partial<Record<FileCategory, number>>;
  ragCounts: Partial<Record<RagStatus, number>>;
  isRagFetching: boolean;
  onRefreshRag: () => void;
}

function FileTableHeaderCell({
  id,
  activeSortBy,
  activeSortDir,
  onChangeSort,
  columnFilters,
  onChangeFilter,
  ownerOptions,
  typeCounts,
  ragCounts,
  isRagFetching,
  onRefreshRag,
}: FileTableHeaderCellProps) {
  const spec = COLUMN_SPECS[id];
  const filter = columnFiltersFor(id, columnFilters, onChangeFilter, {
    ownerOptions,
    typeCounts,
    ragCounts,
    isRagFetching,
    onRefreshRag,
  });
  return (
    <ColumnHeader
      label={spec.label}
      sortKey={spec.sortKey}
      activeSortBy={activeSortBy}
      activeSortDir={activeSortDir}
      onChangeSort={onChangeSort}
      align={spec.align}
      ascLabel={spec.ascLabel}
      descLabel={spec.descLabel}
      hasActiveFilter={filter.active}
      filterContent={filter.content}
    />
  );
}

interface ColumnFilterResolved {
  active: boolean;
  content: React.ReactNode | null;
}

function columnFiltersFor(
  id: ColumnId,
  filters: ReturnType<typeof selectColumnFilters>,
  onChange: (action: Parameters<typeof setColumnFilter>[0]) => void,
  context: {
    ownerOptions: OwnerOption[];
    typeCounts: Partial<Record<FileCategory, number>>;
    ragCounts: Partial<Record<RagStatus, number>>;
    isRagFetching: boolean;
    onRefreshRag: () => void;
  },
): ColumnFilterResolved {
  switch (id) {
    case "name":
      return {
        active: filters.name.length > 0,
        content: (
          <input
            type="text"
            value={filters.name}
            onChange={(e) =>
              onChange({ column: "name", value: e.target.value })
            }
            placeholder="Filter by name…"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        ),
      };
    case "type":
      return {
        active: filters.type.length > 0,
        content: (
          <TypeFilterPicker
            value={filters.type}
            onChange={(value) => onChange({ column: "type", value })}
            counts={context.typeCounts}
          />
        ),
      };
    case "extension":
      return {
        active: filters.extension.length > 0,
        content: (
          <input
            type="text"
            value={filters.extension}
            onChange={(e) =>
              onChange({
                column: "extension",
                value: e.target.value
                  .replace(/^\./, "")
                  .toLowerCase()
                  .slice(0, 24),
              })
            }
            placeholder="pdf, jp, mp4…"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        ),
      };
    case "mime":
      return {
        active: filters.mime.length > 0,
        content: (
          <input
            type="text"
            value={filters.mime}
            onChange={(e) =>
              onChange({ column: "mime", value: e.target.value.slice(0, 64) })
            }
            placeholder="image/, application/pdf…"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        ),
      };
    case "path":
      return {
        active: filters.path.length > 0,
        content: (
          <input
            type="text"
            value={filters.path}
            onChange={(e) =>
              onChange({ column: "path", value: e.target.value.slice(0, 128) })
            }
            placeholder="folder name fragment…"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        ),
      };
    case "owner":
      return {
        active: filters.owner.length > 0,
        content: (
          <OwnerFilterPicker
            value={filters.owner}
            onChange={(value) => onChange({ column: "owner", value })}
            options={context.ownerOptions}
          />
        ),
      };
    case "size":
      return {
        active: filters.size !== "any",
        content: (
          <SizeFilterPicker
            value={filters.size}
            onChange={(value) => onChange({ column: "size", value })}
          />
        ),
      };
    case "version":
      return { active: false, content: null };
    case "updated_at":
      return {
        active: filters.modified !== "any",
        content: (
          <ModifiedFilterPicker
            value={filters.modified}
            onChange={(value) => onChange({ column: "modified", value })}
          />
        ),
      };
    case "created_at":
      return {
        active: filters.created !== "any",
        content: (
          <ModifiedFilterPicker
            value={filters.created}
            onChange={(value) => onChange({ column: "created", value })}
          />
        ),
      };
    case "access":
      return {
        active: filters.access !== "any",
        content: (
          <AccessFilterPicker
            value={filters.access}
            onChange={(value) => onChange({ column: "access", value })}
          />
        ),
      };
    case "rag_status":
      return {
        active: filters.rag.length > 0,
        content: (
          <RagFilterPicker
            value={filters.rag}
            onChange={(value) => onChange({ column: "rag", value })}
            counts={context.ragCounts}
            isFetching={context.isRagFetching}
            onRefresh={context.onRefreshRag}
          />
        ),
      };
    case "context":
      // Context is a status/assignment column — no header filter yet.
      return { active: false, content: null };
  }
}

// ── Per-column filter pickers ──────────────────────────────────────────────

interface ModifiedFilterPickerProps {
  value: ModifiedFilter;
  onChange: (next: ModifiedFilter) => void;
}

const MODIFIED_OPTIONS: ReadonlyArray<{
  value: ModifiedFilter;
  label: string;
}> = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
];

function ModifiedFilterPicker({ value, onChange }: ModifiedFilterPickerProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {MODIFIED_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded px-2 py-1 text-left text-xs hover:bg-accent",
            value === opt.value && "bg-accent font-medium",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface SizeFilterPickerProps {
  value: SizeFilter;
  onChange: (next: SizeFilter) => void;
}

const SIZE_OPTIONS: ReadonlyArray<{ value: SizeFilter; label: string }> = [
  { value: "any", label: "Any size" },
  { value: "small", label: "≤ 1 MB" },
  { value: "medium", label: "1 – 10 MB" },
  { value: "large", label: "10 – 100 MB" },
  { value: "huge", label: "> 100 MB" },
];

function SizeFilterPicker({ value, onChange }: SizeFilterPickerProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {SIZE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded px-2 py-1 text-left text-xs hover:bg-accent",
            value === opt.value && "bg-accent font-medium",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface AccessFilterPickerProps {
  value: AccessFilter;
  onChange: (next: AccessFilter) => void;
}

const ACCESS_OPTIONS: ReadonlyArray<{ value: AccessFilter; label: string }> = [
  { value: "any", label: "Any" },
  { value: "private", label: "Private" },
  { value: "shared", label: "Shared" },
  { value: "public", label: "Public" },
];

function AccessFilterPicker({ value, onChange }: AccessFilterPickerProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {ACCESS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded px-2 py-1 text-left text-xs hover:bg-accent",
            value === opt.value && "bg-accent font-medium",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** First 6 characters of an opaque ownerId, used until the backend exposes
 *  display names. Mirrors the same logic in `OwnerCell` for consistency. */
function shortLabelFor(id: string): string {
  const clean = id.replace(/-/g, "");
  return clean.slice(0, 6);
}
