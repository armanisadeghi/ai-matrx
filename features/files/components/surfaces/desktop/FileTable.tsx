/**
 * features/files/components/surfaces/desktop/FileTable.tsx
 *
 * The Files list — the shared `MatrxDataTable`, run CONTROLLED on the files
 * Redux state (`cloudFiles.ui`). Sort, the per-column filters and the visible
 * columns live there because the grid view, the address bar (url-state) and
 * the agent context read the same state; the table only shows and edits it.
 *
 *   - Rows come from `buildRows` (section / search / chip / kind / column
 *     filters / sort), so the table's sort and filters are SOURCE-owned.
 *   - The table's own search narrows this list (names) before windowing.
 *   - Infinite scroll: `useInfiniteWindow` reveals 50 rows at a time and grows
 *     to reveal a programmatically focused row; the table's append mode asks it
 *     for more as the person scrolls.
 *   - Drag, drop, right-click menu and surface attributes ride the row shell
 *     (`FileTableRowShell`, the table's `rowWrapper`).
 */

"use client";

import { useShowSystemFiles } from "@/features/files/hooks/useShowSystemFiles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  ColumnFiltersState,
  ColumnFilterValue,
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectActiveFileId,
  selectColumnFilters,
  selectFocusedId,
  selectKindFilter,
  selectAllFoldersMap,
  selectRagStatuses,
  selectSelection,
  selectSort,
  selectVisibleColumns,
} from "@/features/files/redux/selectors";
import {
  setActiveFileId,
  setActiveFolderId,
  setColumnFilter,
  setColumnVisibility,
  setFocusedId,
  setSelection,
  setSort,
} from "@/features/files/redux/slice";
import { prefetchRagStatusesForFiles } from "@/features/files/redux/rag-thunks";
import { primeEntityScopes } from "@/features/scopes/components/context-assignment/data";
import type {
  AccessFilter,
  CloudFilePermission,
  CloudFileRecord,
  CloudFolderRecord,
  ColumnFilters,
  ColumnId,
  ModifiedFilter,
  RagStatus,
  SizeFilter,
  SortBy,
} from "@/features/files/types";
import { DEFAULT_VISIBLE_COLUMNS } from "@/features/files/types";
import { getFileTypeDetails } from "@/features/files/utils/file-types";
import { formatFileSize } from "@/features/files/utils/format";
import { ShareLinkDialog } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { useInfiniteWindow } from "@/features/files/hooks/useInfiniteWindow";
import { useFilesSurfaceClientTools } from "../useFilesSurfaceClientTools";
import type { CloudFilesSection } from "./section";
import {
  buildRows,
  isSharedResource,
  memberCountForResource,
  type RowItem,
} from "./row-data";
import type { FilterChipKey } from "./FilterChips";
import {
  FileTableCell,
  FileTableRowShell,
  type FileListRow,
  type FileTableRowCommands,
} from "./FileTableRow";
import { ActiveColumnFilters } from "./ActiveColumnFilters";
import {
  COLUMN_ORDER,
  COLUMN_SPECS,
  RAG_FILTER_LABELS,
  TYPE_FILTER_LABELS,
} from "./columns";

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

const FILES_TABLE_LOCATION = "AI Matrx — Files";
const PAGE_SIZE = 50;

const MODIFIED_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
];
const SIZE_OPTIONS = [
  { value: "small", label: "≤ 1 MB" },
  { value: "medium", label: "1 – 10 MB" },
  { value: "large", label: "10 – 100 MB" },
  { value: "huge", label: "> 100 MB" },
];
const ACCESS_OPTIONS = [
  { value: "personal", label: "Personal" },
  { value: "internal", label: "Organization" },
  { value: "link", label: "Link" },
  { value: "public", label: "Public" },
];

const SIZE_VALUES: readonly SizeFilter[] = ["any", "small", "medium", "large", "huge"];
const MODIFIED_VALUES: readonly ModifiedFilter[] = ["any", "today", "week", "month"];
const ACCESS_VALUES: readonly AccessFilter[] = ["any", "personal", "internal", "link", "public"];

/** The picked choice when it is one of `allowed`, else "any" (cleared). */
function oneOf<V extends string>(allowed: readonly V[], value: string | undefined): V {
  const found = allowed.find((v) => v === value);
  return found ?? allowed[0]!;
}

// ── Redux column filters <-> table column filters ─────────────────────────

/** Which Redux filter each table column edits, and its shape. */
const FILTER_BINDINGS: Partial<
  Record<
    ColumnId,
    | { key: "name" | "extension" | "mime" | "path"; shape: "text" }
    | { key: "type" | "owner" | "rag"; shape: "multi" }
    | { key: "size" | "modified" | "created" | "access"; shape: "single" }
  >
> = {
  name: { key: "name", shape: "text" },
  extension: { key: "extension", shape: "text" },
  mime: { key: "mime", shape: "text" },
  path: { key: "path", shape: "text" },
  type: { key: "type", shape: "multi" },
  owner: { key: "owner", shape: "multi" },
  rag_status: { key: "rag", shape: "multi" },
  size: { key: "size", shape: "single" },
  updated_at: { key: "modified", shape: "single" },
  created_at: { key: "created", shape: "single" },
  access: { key: "access", shape: "single" },
};

function toTableFilters(filters: ColumnFilters): ColumnFiltersState {
  const out: ColumnFiltersState = {};
  for (const [columnId, binding] of Object.entries(FILTER_BINDINGS)) {
    if (!binding) continue;
    if (binding.shape === "text") {
      const value = filters[binding.key];
      if (value) out[columnId] = { kind: "text", value };
    } else if (binding.shape === "multi") {
      const values = filters[binding.key];
      if (values.length > 0) {
        out[columnId] = { kind: "select", value: values[0] ?? "", values: [...values] };
      }
    } else {
      const value = filters[binding.key];
      if (value !== "any") out[columnId] = { kind: "select", value, values: [value] };
    }
  }
  return out;
}

function textOf(value: ColumnFilterValue | undefined): string {
  return value?.kind === "text" ? value.value : "";
}

function valuesOf(value: ColumnFilterValue | undefined): string[] {
  if (value?.kind !== "select") return [];
  return value.values ?? (value.value ? [value.value] : []);
}

function sameValue(a: ColumnFilterValue | undefined, b: ColumnFilterValue | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function withCount(label: string, count: number | undefined): string {
  return count ? `${label} (${count.toLocaleString()})` : label;
}

/** First 6 characters of an opaque ownerId, used until the backend exposes
 *  display names. Mirrors the same logic in `OwnerCell` for consistency. */
function shortLabelFor(id: string): string {
  return id.replace(/-/g, "").slice(0, 6);
}

function rowIdOf(item: RowItem): string {
  return item.kind === "file" ? item.file.id : item.folder.id;
}

function rowNameOf(item: RowItem): string {
  return item.kind === "file" ? item.file.fileName : item.folder.folderName;
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
  const { showSystemFiles } = useShowSystemFiles();
  const columnFilters = useAppSelector(selectColumnFilters);
  const visibleColumns = useAppSelector(selectVisibleColumns);
  const currentUserId = useAppSelector(selectUserId);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const ragStatuses = useAppSelector(selectRagStatuses);

  const { rows: builtRows, totalBeforeCap, capped } = useMemo(
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
        showSystemFiles,
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
      showSystemFiles,
    ],
  );

  // The table's own search narrows THIS list by name (the page's search box is
  // the tree-wide one). Applied before windowing so it covers every row.
  const [tableSearch, setTableSearch] = useState("");
  const rows = useMemo(() => {
    const term = tableSearch.trim().toLowerCase();
    if (!term) return builtRows;
    return builtRows.filter((r) => rowNameOf(r).toLowerCase().includes(term));
  }, [builtRows, tableSearch]);

  // Surface client tools (`matrx-user/files`) are registered HERE because
  // `rows` is the exactly-rendered set — see useFilesSurfaceClientTools.
  // FileGrid registers the same tools; the two never mount together.
  useFilesSurfaceClientTools({ rows, viewLabel: "list" });

  // Owner choices: every owner in the unfiltered input, "You" first, with
  // counts that stay stable as other filters change (Google Drive does the same).
  const ownerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) {
      if (f.ownerId) counts.set(f.ownerId, (counts.get(f.ownerId) ?? 0) + 1);
    }
    for (const fo of folders) {
      if (fo.ownerId) counts.set(fo.ownerId, (counts.get(fo.ownerId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a, ac], [b, bc]) =>
        a === currentUserId ? -1 : b === currentUserId ? 1 : bc - ac,
      )
      .map(([ownerId, count]) => ({
        value: ownerId,
        label: withCount(ownerId === currentUserId ? "You" : shortLabelFor(ownerId), count),
      }));
  }, [files, folders, currentUserId]);

  // Type choices with counts from the raw input (stable across other filters).
  const typeOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    if (folders.length > 0) counts.FOLDER = folders.length;
    for (const f of files) {
      const cat = getFileTypeDetails(f.fileName).category;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return TYPE_FILTER_LABELS.filter(
      (o) => counts[o.value] || columnFilters.type.includes(o.value),
    ).map((o) => ({ value: o.value, label: withCount(o.label, counts[o.value]) }));
  }, [files, folders, columnFilters.type]);

  // Knowledge choices: counted over the FILE input; files with no status yet
  // are bucketed as `unknown`.
  const ragColumnVisible = !!visibleColumns.rag_status;
  const ragFileIds = useMemo(() => files.map((f) => f.id), [files]);
  const ragOptions = useMemo(() => {
    const counts: Partial<Record<RagStatus, number>> = {};
    for (const id of ragFileIds) {
      const st = ragStatuses[id] ?? "unknown";
      counts[st] = (counts[st] ?? 0) + 1;
    }
    return RAG_FILTER_LABELS.map((o) => ({
      value: o.value,
      label: withCount(o.label, counts[o.value as RagStatus]),
    }));
  }, [ragFileIds, ragStatuses]);

  // Auto-prefetch Knowledge status while the column is visible; the thunk
  // skips ids already known, so only newly loaded files trigger work.
  useEffect(() => {
    if (!ragColumnVisible || ragFileIds.length === 0) return;
    void dispatch(prefetchRagStatusesForFiles({ fileIds: ragFileIds, force: false }));
  }, [ragColumnVisible, ragFileIds, dispatch]);

  const visibleIds = useMemo(
    () => COLUMN_ORDER.filter((id) => visibleColumns[id] ?? DEFAULT_VISIBLE_COLUMNS[id]),
    [visibleColumns],
  );

  // Prime the row-scope store: ONE bulk association query per page of files
  // (Context AND Access read it).
  const rowScopesNeeded = visibleIds.includes("context") || visibleIds.includes("access");
  useEffect(() => {
    if (!rowScopesNeeded || files.length === 0) return;
    primeEntityScopes(
      "file",
      files.map((f) => f.id),
    );
  }, [rowScopesNeeded, files]);

  const refreshRagStatuses = useCallback(() => {
    if (ragFileIds.length === 0) return;
    void dispatch(prefetchRagStatusesForFiles({ fileIds: ragFileIds, force: true }));
  }, [ragFileIds, dispatch]);

  // Infinite scroll — the rows window resets to the top on any context change.
  const resetKey = `${section}|${searchQuery}|${tableSearch}|${filter ?? ""}|${kindFilter}|${sortBy}:${sortDir}|${JSON.stringify(columnFilters)}|${visibleIds.join(",")}`;
  const { visibleCount, hasMore, loadMore, ensureIndexVisible } = useInfiniteWindow({
    total: rows.length,
    initial: PAGE_SIZE,
    pageSize: PAGE_SIZE,
    resetKey,
  });

  // A programmatically focused row (a just-uploaded file) is revealed so its
  // shell can scroll it into view.
  useEffect(() => {
    if (!focusedId) return;
    const idx = rows.findIndex((r) => rowIdOf(r) === focusedId);
    if (idx >= 0) ensureIndexVisible(idx);
  }, [focusedId, rows, ensureIndexVisible]);

  // "Parent / Child" path for a folder id (search mode breadcrumb).
  const resolveFolderPath = useCallback(
    (folderId: string | null): string => {
      if (!folderId) return "/";
      const segments: string[] = [];
      let cursor: string | null = folderId;
      let depth = 0;
      while (cursor && depth < 32) {
        const folder: CloudFolderRecord | undefined = foldersById[cursor];
        if (!folder) break;
        segments.unshift(folder.folderName);
        cursor = folder.parentId;
        depth += 1;
      }
      return segments.length ? segments.join(" / ") : "/";
    },
    [foldersById],
  );

  // Table rows carry their sharing facts, built once per data change (never
  // per render), so the table's row memo holds every row that did not change.
  const listRows = useMemo<FileListRow[]>(
    () =>
      rows.slice(0, visibleCount).map((item) => {
        const id = rowIdOf(item);
        const visibility = item.kind === "file" ? item.file.visibility : item.folder.visibility;
        const perms = permissionsByResourceId[id] ?? [];
        const parentFolderId = item.kind === "file" ? item.file.parentFolderId : item.folder.parentId;
        return {
          id,
          item,
          // Public grants have no real grantee — never a fake avatar.
          granteeIds: perms.filter((p) => p.granteeType !== "public").map((p) => p.granteeId),
          memberCount: memberCountForResource(id, permissionsByResourceId),
          isShared: isSharedResource(id, visibility, permissionsByResourceId),
          parentPath: treeWideSearch ? resolveFolderPath(parentFolderId ?? null) : null,
        };
      }),
    [rows, visibleCount, permissionsByResourceId, treeWideSearch, resolveFolderPath],
  );

  const [shareTarget, setShareTarget] = useState<ShareDialogState | null>(null);

  const handleRowActivate = useCallback(
    (item: RowItem) => {
      if (item.kind === "folder") {
        dispatch(setActiveFolderId(item.folder.id));
        dispatch(setActiveFileId(null));
        dispatch(setFocusedId(item.folder.id));
        onActivateFolder(item.folder.id);
      } else {
        dispatch(setActiveFileId(item.file.id));
        dispatch(setFocusedId(item.file.id));
        onActivateFile(item.file.id);
      }
    },
    [dispatch, onActivateFolder, onActivateFile],
  );

  // ONE stable commands object for every row's cells: a table render (opening
  // a file moves `activeFileId`) never hands a row new functions.
  const latestRows = useRef(rows);
  const latestActivate = useRef(handleRowActivate);
  useEffect(() => {
    latestRows.current = rows;
    latestActivate.current = handleRowActivate;
  });
  const [commands] = useState<FileTableRowCommands>(() => ({
    activate: (id) => {
      const item = latestRows.current.find((r) => rowIdOf(r) === id);
      if (item) latestActivate.current(item);
    },
    openShare: (id, kind) => setShareTarget({ resourceId: id, resourceType: kind }),
  }));

  // ── Controlled query state, bound to Redux ──────────────────────────────
  const tableFilters = useMemo(() => toTableFilters(columnFilters), [columnFilters]);
  const queryState = useMemo<MatrxDataTableQueryState>(
    () => ({
      page: 1,
      pageSize: PAGE_SIZE,
      search: tableSearch,
      anyOf: "",
      columnFilters: tableFilters,
      sort: { id: sortBy, direction: sortDir },
    }),
    [tableSearch, tableFilters, sortBy, sortDir],
  );

  const onQueryChange = useCallback(
    (next: MatrxDataTableQueryState) => {
      if (next.search !== tableSearch) setTableSearch(next.search);
      // Sort: the files list is always sorted; clearing returns to the default.
      const nextSort = next.sort ?? { id: "updated_at", direction: "desc" as const };
      if (nextSort.id !== sortBy || nextSort.direction !== sortDir) {
        dispatch(setSort({ sortBy: nextSort.id as SortBy, sortDir: nextSort.direction }));
      }
      for (const [columnId, binding] of Object.entries(FILTER_BINDINGS)) {
        if (!binding) continue;
        const value = next.columnFilters[columnId];
        if (sameValue(value, tableFilters[columnId])) continue;
        if (binding.shape === "text") {
          let text = textOf(value);
          if (binding.key === "extension") text = text.replace(/^\./, "").toLowerCase().slice(0, 24);
          if (binding.key === "mime") text = text.slice(0, 64);
          if (binding.key === "path") text = text.slice(0, 128);
          dispatch(setColumnFilter({ column: binding.key, value: text }));
        } else if (binding.shape === "multi") {
          dispatch(setColumnFilter({ column: binding.key, value: valuesOf(value) }));
        } else {
          const picked = valuesOf(value);
          const last = picked[picked.length - 1];
          if (binding.key === "size") {
            dispatch(setColumnFilter({ column: "size", value: oneOf(SIZE_VALUES, last) }));
          } else if (binding.key === "access") {
            dispatch(setColumnFilter({ column: "access", value: oneOf(ACCESS_VALUES, last) }));
          } else {
            dispatch(setColumnFilter({ column: binding.key, value: oneOf(MODIFIED_VALUES, last) }));
          }
        }
      }
    },
    [dispatch, sortBy, sortDir, tableFilters, tableSearch],
  );

  // ── Columns ─────────────────────────────────────────────────────────────
  const columns = useMemo<MatrxColumnDef<FileListRow>[]>(() => {
    const cell = (id: ColumnId) => (row: FileListRow) => (
      <FileTableCell id={id} row={row} currentUserId={currentUserId ?? null} commands={commands} />
    );
    const base = (id: ColumnId, width: number): MatrxColumnDef<FileListRow> => ({
      id,
      header: COLUMN_SPECS[id].label,
      label: COLUMN_SPECS[id].label,
      width,
      align: COLUMN_SPECS[id].align ?? "left",
      sortable: COLUMN_SPECS[id].sortKey !== null,
      cell: cell(id),
      filter: false,
    });
    const fileOnly = (row: FileListRow, read: (f: CloudFileRecord) => unknown) =>
      row.item.kind === "file" ? read(row.item.file) : null;
    const updated = (row: FileListRow) =>
      row.item.kind === "file" ? row.item.file.updatedAt : row.item.folder.updatedAt;
    const created = (row: FileListRow) =>
      row.item.kind === "file" ? row.item.file.createdAt : row.item.folder.createdAt;
    const byId: Record<ColumnId, MatrxColumnDef<FileListRow>> = {
      name: {
        ...base("name", 560),
        hideable: false,
        minWidth: 280,
        accessorFn: (row) => rowNameOf(row.item),
        filter: "text",
      },
      type: {
        ...base("type", 150),
        accessorFn: (row) =>
          row.item.kind === "folder" ? "FOLDER" : getFileTypeDetails(row.item.file.fileName).category,
        copyValue: (row) =>
          row.item.kind === "folder" ? "Folder" : getFileTypeDetails(row.item.file.fileName).category,
        filter: "select",
        filterOptions: typeOptions,
      },
      extension: {
        ...base("extension", 80),
        accessorFn: (row) => fileOnly(row, (f) => f.fileName.split(".").pop()?.toLowerCase() ?? ""),
        filter: "text",
      },
      mime: { ...base("mime", 180), accessorFn: (row) => fileOnly(row, (f) => f.mimeType), filter: "text" },
      path: {
        ...base("path", 220),
        accessorFn: (row) => (row.item.kind === "file" ? row.item.file.filePath : row.item.folder.folderPath),
        filter: "text",
      },
      owner: {
        ...base("owner", 120),
        minWidth: 96,
        accessorFn: (row) => (row.item.kind === "file" ? row.item.file.ownerId : row.item.folder.ownerId),
        copyValue: (row) => {
          const owner = row.item.kind === "file" ? row.item.file.ownerId : row.item.folder.ownerId;
          return owner === currentUserId ? "You" : owner;
        },
        filter: "select",
        filterOptions: ownerOptions,
      },
      size: {
        ...base("size", 100),
        minWidth: 84,
        accessorFn: (row) => fileOnly(row, (f) => f.fileSize),
        copyValue: (row) => fileOnly(row, (f) => formatFileSize(f.fileSize)),
        filter: "select",
        filterSingle: true,
        filterOptions: SIZE_OPTIONS,
      },
      version: { ...base("version", 70), accessorFn: (row) => fileOnly(row, (f) => f.currentVersion) },
      updated_at: {
        ...base("updated_at", 130),
        accessorFn: updated,
        defaultSortDirection: "desc",
        filter: "select",
        filterSingle: true,
        filterOptions: MODIFIED_OPTIONS,
      },
      created_at: {
        ...base("created_at", 130),
        accessorFn: created,
        defaultSortDirection: "desc",
        filter: "select",
        filterSingle: true,
        filterOptions: MODIFIED_OPTIONS,
      },
      access: {
        ...base("access", 140),
        accessorFn: (row) => (row.item.kind === "file" ? row.item.file.visibility : row.item.folder.visibility),
        filter: "select",
        filterSingle: true,
        filterOptions: ACCESS_OPTIONS,
      },
      context: { ...base("context", 110) },
      rag_status: {
        ...base("rag_status", 130),
        accessorFn: (row) => (row.item.kind === "file" ? (ragStatuses[row.id] ?? "unknown") : null),
        filter: "select",
        filterOptions: ragOptions,
        headerMenu: [
          { id: "refresh-knowledge", label: "Refresh knowledge status", onSelect: refreshRagStatuses },
        ],
      },
    };
    return COLUMN_ORDER.map((id) => byId[id]);
  }, [commands, currentUserId, ownerOptions, typeOptions, ragOptions, ragStatuses, refreshRagStatuses]);

  const hiddenColumnIds = useMemo(
    () => COLUMN_ORDER.filter((id) => !visibleIds.includes(id)),
    [visibleIds],
  );
  const defaultHidden = useMemo(
    () => COLUMN_ORDER.filter((id) => !DEFAULT_VISIBLE_COLUMNS[id]),
    [],
  );
  // Column order is this table's own (the grid view has no columns); which
  // columns show is the shared state.
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [...COLUMN_ORDER]);
  const onColumnStateChange = useCallback(
    (next: { order: string[]; hidden: string[] }) => {
      setColumnOrder(next.order);
      for (const id of COLUMN_ORDER) {
        const visible = !next.hidden.includes(id);
        if (visible !== visibleIds.includes(id)) {
          dispatch(setColumnVisibility({ column: id, visible }));
        }
      }
    },
    [dispatch, visibleIds],
  );

  const onSelectedIdsChange = useCallback(
    (ids: string[]) => {
      const before = new Set(selection.selectedIds);
      const changed = ids.filter((id) => !before.has(id));
      const removed = selection.selectedIds.filter((id) => !ids.includes(id));
      dispatch(setSelection({ selectedIds: ids, anchorId: null }));
      const toggled = [...changed, ...removed];
      if (toggled.length === 1) dispatch(setFocusedId(toggled[0]!));
    },
    [dispatch, selection.selectedIds],
  );

  const rowWrapper = useCallback(
    (row: FileListRow, children: React.ReactNode) => (
      <FileTableRowShell row={row}>{children}</FileTableRowShell>
    ),
    [],
  );

  const focusedIndex = focusedId ? listRows.findIndex((r) => r.id === focusedId) : -1;

  if (builtRows.length === 0) {
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
          // read-gate-exempt: rows come from the whole-tree read; PageShell renders FilesTreeErrorState/loading and never mounts this view until that read succeeded
          : "No files yet. Use the + New button or drop files to upload."}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full w-full flex-col overflow-hidden", className)}>
      {treeWideSearch ? (
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground shrink-0">
          <SearchIcon className="h-3.5 w-3.5" />
          <span>
            {/* read-gate-exempt: rows come from the whole-tree read; PageShell shows FilesTreeErrorState on treeStatus error and never mounts this view then */}
            Showing {builtRows.length} {builtRows.length === 1 ? "result" : "results"}{" "}
            from all folders for &ldquo;
            <span className="font-medium text-foreground">{searchQuery}</span>
            &rdquo;
          </span>
        </div>
      ) : null}
      {capped ? (
        <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-warning-ink shrink-0">
          <span>
            {/* read-gate-exempt: rows come from the whole-tree read; PageShell shows FilesTreeErrorState on treeStatus error and never mounts this view then */}
            Showing the {builtRows.length.toLocaleString()} most-recent of{" "}
            <span className="font-medium">{totalBeforeCap.toLocaleString()}</span>{" "}
            items. Open a folder or use search to see older history.
          </span>
        </div>
      ) : null}
      <ActiveColumnFilters />
      <div className="flex-1 min-h-0">
        <MatrxDataTable<FileListRow>
          tableId="files-list"
          data={listRows}
          columns={columns}
          getRowId={(row) => row.id}
          viewTabs={false}
          frameHeight="fill"
          fitToWidth="grow"
          detail={{ enabled: false }}
          onRowOpen={(row) => handleRowActivate(row.item)}
          selectedId={activeFileId}
          highlightedIndex={focusedIndex >= 0 ? focusedIndex : undefined}
          rowClassName={(row) =>
            row.id === activeFileId ? "border-l-2 border-l-primary" : undefined
          }
          rowWrapper={rowWrapper}
          toolbar={{ searchPlaceholder: "Filter this list" }}
          columnState={{
            order: columnOrder,
            hidden: hiddenColumnIds,
            onChange: onColumnStateChange,
            defaults: { order: [...COLUMN_ORDER], hidden: defaultHidden },
          }}
          selection={{
            selectedIds: selection.selectedIds,
            onSelectedIdsChange,
            noun: "item",
          }}
          query={{
            mode: "controlled-append",
            state: queryState,
            onStateChange: onQueryChange,
            sourceProcessing: {
              search: "source",
              columnFilters: "source",
              sort: "source",
              sourceTotal: rows.length,
            },
            pagination: {
              queryKey: resetKey,
              rows: listRows,
              loading: false,
              isFetchingNextPage: false,
              error: null,
              hasNextPage: hasMore,
              loadNextPage: async () => loadMore(),
              refresh: () => undefined,
              totalItems: rows.length,
            },
          }}
          copy={{
            label: "File",
            listLabel: "Files",
            location: FILES_TABLE_LOCATION,
            rowKind: "file",
            listKind: "files",
            humanRow: (row) =>
              row.item.kind === "folder"
                ? `${row.item.folder.folderName} — folder, ${row.item.folder.folderPath}`
                : `${row.item.file.fileName} — ${getFileTypeDetails(row.item.file.fileName).category.toLowerCase()}, ${formatFileSize(row.item.file.fileSize)}, ${row.item.file.filePath}`,
          }}
        />
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
