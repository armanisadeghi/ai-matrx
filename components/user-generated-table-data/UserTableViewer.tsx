"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import TableToolbar from "./TableToolbar";
import {
  Pencil,
  Trash,
  Expand,
  Link,
  Zap,
  Eye,
  AlertCircle,
  History,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
  Paintbrush,
  Plus,
} from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { VersionHistoryViewer } from "@/features/data-tables/components/VersionHistoryViewer";
import {
  EditableCell,
  normalizeCellValue,
} from "@/features/data-tables/components/EditableCell";
import { InlineMarkdownWithLinks } from "@/components/mardown-display/blocks/links/InlineMarkdownWithLinks";
import { FormattedFieldValue } from "@/lib/field-formats/FormattedFieldValue";
import { parseFieldInput, resolveFieldFormat } from "@/lib/field-formats/format";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import {
  choicesForRow,
  useFieldChoiceMap,
  withResolvedChoices,
} from "@/lib/field-formats/choices";
import { defaultFormatForBase } from "@/lib/field-formats/registry";
import { useTableViewUrlState } from "@/features/data-tables/hooks/useTableViewUrlState";
import { useSavedViews } from "@/features/data-tables/saved-views/useSavedViews";
import { SavedViewBar } from "@/features/data-tables/saved-views/SavedViewBar";
import {
  clampColumnWidth,
  resolveTableLayout,
  resolveViewColumns,
} from "@/features/data-tables/table-view-url";
import { ColumnViewMenu } from "@/features/data-tables/components/ColumnViewMenu";
import {
  useTableRealtime,
  type TableRealtimeEvent,
} from "@/features/data-tables/hooks/useTableRealtime";
import { useGridSelection } from "@/features/data-tables/hooks/useGridSelection";
import { useCellUndo } from "@/features/data-tables/hooks/useCellUndo";
import {
  cellDomKey,
  rangeRows as rangeRowsOf,
  type CellAddress,
} from "@/features/data-tables/grid-selection";
import { classifyEcho } from "@/features/data-tables/realtime-echo";
import {
  bulkWrite,
  deleteField,
  getCompleteTable,
  getTableMetadata,
  listUserTables,
  renameColumn,
  renumberFields,
  setTableStyle,
  upsertCell,
} from "@/features/data-tables/service";
import {
  CELL_TINT_CLASS,
  ROW_TINT_CLASS,
  applyStylePath,
  colorForChoice,
  parseTableStyle,
  resolveCellColor,
  resolveRowColor,
  stylePath,
  tableStyleFromMetadata,
  type ChoiceColorLookup,
  type StylePath,
  type TableStyle,
} from "@/features/data-tables/table-style";
import { ColorRulesDialog } from "@/features/data-tables/components/ColorRulesDialog";
import { isChoiceFormat } from "@/lib/field-formats/choices";
import {
  formulaColumnsOf,
  isFormulaColumn,
  withComputedColumns,
} from "@/features/data-tables/formulas";
import {
  hasValidationRules,
  parseValidationRules,
  validateCellValue,
  type ValidationRules,
} from "@/features/data-tables/validation";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  isBulkOpError,
  isServiceFailure,
  type BulkMergeOp,
  type BulkOp,
  type FieldDataType,
} from "@/features/data-tables/types";
import {
  buildDuplicateOps,
  buildFillDownOps,
  buildSetColumnOps,
  capturePriorValues,
  orderSelectedRows,
  type SelectableRow,
} from "@/features/data-tables/bulk-row-actions";
import {
  cellClipboardText,
  gridToTsv,
  parseClipboardGrid,
  planPaste,
  storedValuesEqual,
} from "@/features/data-tables/grid-clipboard";
import {
  EMPTY_GRID_MENU_TARGET,
  GRID_FIELD_DOM_ATTR,
  GRID_ROW_DOM_ATTR,
  buildGridCellMenuSection,
  buildGridColumnMenuSection,
  buildGridRowMenuSection,
  resolveGridMenuTarget,
  type GridMenuTarget,
} from "@/features/data-tables/grid-context-menu";
import {
  buildDatasetTableMenuSection,
  datasetTableEntityRef,
} from "@/features/data-tables/dataset-table-actions";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { BulkRowActions } from "@/features/data-tables/components/BulkRowActions";
import {
  applyColumnFilters as applyFilters,
  hasAnyActiveFilter,
  type ColumnFilter,
  type ColumnFilterMap,
} from "@/features/data-tables/column-filters";
import { TableSkeleton } from "./TableSkeleton";
import { CellCleanupButton } from "@/components/content-cleanup/CellCleanupButton";
import { cleanValue } from "@/lib/content-cleanup/clean-cells";
import { DEFAULT_ENABLED_VALUE_OPERATIONS } from "@/lib/content-cleanup/value-operations";
import type { CleanableRow, RowPatch } from "@/lib/content-cleanup/value-types";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import TableReferenceModal from "./TableReferenceModal";
import ColumnHeaderMenu from "./ColumnHeaderMenu";
import { TableLayoutMenu } from "@/features/data-tables/components/TableLayoutMenu";
import type { TableField } from "@/utils/user-table-utls/table-utils";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  buildDataTablesScope,
  type DataTableScopeField,
  type DataTableScopeInput,
} from "@/features/data-tables/agent-context/buildDataTablesScope";
import {
  useDataTableWriteHandlers,
  type DataTableWriteLiveState,
} from "@/features/data-tables/hooks/useDataTableWriteHandlers";
import { TableCopyControls } from "@/features/data-tables/components/TableCopyControls";
import { useIsMobile } from "@/hooks/use-mobile";

interface TableDataRow {
  id: string;
  data: Record<string, unknown>;
  /**
   * Server write time. Load-bearing: it is what lets a realtime echo of OUR
   * OWN write be recognized and dropped instead of triggering a refetch.
   * Always the value the SERVER returned — never a client clock, whose skew
   * would make a genuine remote change look older than ours and vanish.
   */
  updated_at?: string;
}

interface RowOrderingConfig {
  enabled?: boolean;
  order?: unknown;
  default_sort?: {
    field: string;
    direction?: "asc" | "desc";
  };
}

export interface TableInfo {
  table_name: string;
  description?: string;
  user_id?: string;
  /** The owning organization. The platform's example tables live in the global system org and are read-only for everyone. */
  organization_id?: string;
  row_ordering_config?: RowOrderingConfig;
  /** `permissive` | `strict` — read by TableConfigModal's Strict Validation switch. */
  validation_mode?: string;
  /** The full `udt_datasets.metadata` blob; `metadata.style` is the table's colors (`table-style.ts`). */
  metadata?: unknown;
}

interface UserTable {
  id: string;
  table_name: string;
  description: string;
  row_count: number;
  field_count: number;
  user_id?: string;
}

/** User-table RPCs return `{ success: boolean, error?: string, ... }` as `Json` — validate before reading fields. */
function assertRpcSuccessEnvelope(
  data: unknown,
): asserts data is { success: boolean; error?: string } {
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as { success?: unknown }).success !== "boolean"
  ) {
    throw new Error("Invalid table RPC response");
  }
}

function rowOrderingIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function rowIdFromRpcDataRow(row: unknown): string | undefined {
  if (row && typeof row === "object" && "id" in row) {
    const id = (row as { id: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function asTableDataRows(raw: unknown): TableDataRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): TableDataRow[] => {
    if (
      row &&
      typeof row === "object" &&
      "id" in row &&
      typeof (row as { id: unknown }).id === "string" &&
      "data" in row &&
      typeof (row as { data: unknown }).data === "object" &&
      (row as { data: unknown }).data !== null
    ) {
      const updatedAt = (row as { updated_at?: unknown }).updated_at;
      return [
        {
          id: (row as { id: string }).id,
          data: (row as { data: Record<string, unknown> }).data,
          ...(typeof updatedAt === "string" ? { updated_at: updatedAt } : {}),
        },
      ];
    }
    return [];
  });
}

function asTableFields(raw: unknown): TableField[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (field): field is TableField =>
      !!field &&
      typeof field === "object" &&
      typeof (field as TableField).id === "string" &&
      typeof (field as TableField).field_name === "string" &&
      typeof (field as TableField).display_name === "string" &&
      typeof (field as TableField).data_type === "string",
  );
}

interface UserTableViewerProps {
  tableId: string;
  /**
   * Fill the page's own body height instead of sizing to content. Route
   * surfaces (`/data/[id]`) turn this on so the grid uses the whole viewport
   * and the pagination bar sits at the bottom edge; embedded surfaces
   * (windows, sheets, chat artifacts) leave it off and keep the natural flow.
   */
  fillHeight?: boolean;
  /**
   * Render cell text as inline markdown (bold/italic/links) instead of showing
   * raw `**syntax**`. OFF by default so existing data tables are unchanged; the
   * chat artifact (whose cells hold markdown from the agent) turns it on.
   */
  renderCellMarkdown?: boolean;
  /**
   * Hide this component's own title/description header. For when an outer
   * surface (chat artifact, canvas pane) already provides the title, so it
   * isn't shown twice.
   */
  hideHeader?: boolean;
  /** Trailing controls in the data-table toolbar row. */
  toolbarTrailing?: React.ReactNode;
  /**
   * Fires whenever the loaded table's identity changes — lets an outer
   * route header (e.g. the `/data/[id]` shell header) show the table's
   * name without a second fetch of the same RPC.
   */
  onTableInfoChange?: (info: TableInfo | null) => void;
  /**
   * Fires with the user's full table list once loaded. Supplied by a surface
   * that renders its OWN table switcher (the `/data/[id]` header identity
   * menu), so the list is fetched once here rather than twice. Passing this
   * is what opts the viewer into loading the list at all — there is no
   * in-body selector any more, because a second control for a choice the
   * header already owns is exactly the duplication the header rules forbid.
   */
  onTablesChange?: (tables: UserTable[]) => void;
  /**
   * Mount the `matrx-user/data-tables` surface runtime (live agent scope + the
   * `table_description` / `cell_value` write targets) around this viewer.
   *
   * OPT-IN ON PURPOSE, and it must stay that way. This component is also
   * rendered inside overlays that belong to OTHER surfaces — `DatasetOverlay`
   * (tool-call visualisation), `ViewTableModal` (markdown display) and the
   * `UserTableWindow` panel — and the surface registry resolves deepest-first
   * while `listLiveWriteTargets()` walks the whole mounted stack. An
   * unconditional provider here would therefore shadow the host page's surface
   * AND offer this surface's write targets on someone else's page. Only the
   * `/data/[id]` route (`DataTableDetailClient`) turns it on.
   */
  emitSurfaceScope?: boolean;
}

const DATA_TABLES_SURFACE_NAME = "matrx-user/data-tables" as const;

/**
 * Up to this many visible columns the desktop grid shares the width evenly
 * (`table-fixed`); beyond it every column keeps its natural width and the
 * grid scrolls sideways. Eight 150px columns fill a 1280px viewport.
 */
const FIXED_LAYOUT_MAX_COLUMNS = 8;

/** Shared with the saved-view codec so "default page size" means one thing. */
const SAVED_VIEW_DEFAULTS = { pageSize: 20 } as const;

const UserTableViewer = ({
  tableId,
  fillHeight = false,
  renderCellMarkdown = false,
  hideHeader = false,
  toolbarTrailing,
  onTableInfoChange,
  onTablesChange,
  emitSurfaceScope = false,
}: UserTableViewerProps) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [fields, setFields] = useState<TableField[]>([]);
  const [data, setData] = useState<TableDataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ownership state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Sharing gate: owner ALWAYS edits; a non-owner edits when has_permission
  // grants editor on the dataset (same pattern as /workbooks/[id]). Derived,
  // not stored — only the async shared-editor lookup is state, and it is
  // keyed by tableId so a grant on one table can never leak into another
  // while the next lookup is in flight.
  const [sharedEditorGrant, setSharedEditorGrant] = useState<{
    tableId: string;
    granted: boolean;
  } | null>(null);
  const sharedEditor =
    sharedEditorGrant !== null &&
    sharedEditorGrant.tableId === tableId &&
    sharedEditorGrant.granted;

  // Pagination state
  // ─── View state lives in the URL ─────────────────────────────────────────
  //
  // Search, sort, column filters, page and page size are all query parameters,
  // so a refresh reproduces exactly what was on screen, a copied link shows a
  // colleague the same view, and Back/Forward walk the user's own decisions
  // rather than only the route. Same parameter vocabulary (`q` `sort` `f` `p`
  // `ps`) every other table surface in the app uses.
  const {
    searchTerm,
    setSearchTerm,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    columnFilters,
    setColumnFilters,
    currentPage,
    setCurrentPage,
    limit,
    setLimit,
    hiddenColumns,
    setHiddenColumns,
    columnOrder,
    setColumnOrder,
    layoutMode,
    setLayoutMode,
    columnWidths,
    setColumnWidth,
    clearColumnWidths,
    rowDensity,
    setRowDensity,
    freezeFirstColumn,
    setFreezeFirstColumn,
    viewState,
    applyViewState,
    resetView,
    isViewCustomized,
  } = useTableViewUrlState({ defaultPageSize: 20, resetKey: tableId });

  // ─── Column resizing (features/data-tables/table-view-url.ts `widths`) ────
  // Drag a header's right edge. The width is painted straight onto the header
  // during the drag (no re-render per pixel) and committed to the view state
  // on mouse-up, so the URL and a saved view carry it.
  const resizeDrag = useRef<{
    fieldName: string;
    startX: number;
    startWidth: number;
    th: HTMLElement;
  } | null>(null);
  const beginColumnResize = (
    event: React.MouseEvent<HTMLElement>,
    fieldName: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const th = (event.currentTarget as HTMLElement).closest("th");
    if (!th) return;
    resizeDrag.current = {
      fieldName,
      startX: event.clientX,
      startWidth: th.getBoundingClientRect().width,
      th,
    };
    const onMove = (e: MouseEvent) => {
      const d = resizeDrag.current;
      if (!d) return;
      const next = clampColumnWidth(d.startWidth + (e.clientX - d.startX));
      d.th.style.width = `${next}px`;
      d.th.style.minWidth = `${next}px`;
      d.th.style.maxWidth = `${next}px`;
    };
    const onUp = (e: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const d = resizeDrag.current;
      resizeDrag.current = null;
      if (!d) return;
      const next = clampColumnWidth(d.startWidth + (e.clientX - d.startX));
      if (Math.abs(next - d.startWidth) >= 2) setColumnWidth(d.fieldName, next);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const columnWidthStyle = (fieldName: string): React.CSSProperties | undefined => {
    const px = columnWidths[fieldName];
    return px ? { width: px, minWidth: px, maxWidth: px } : undefined;
  };

  // Saved views — named, re-runnable arrangements of THIS table. Applying one
  // writes the URL through the same setters a click uses, so a view stays a
  // shortcut to a URL rather than a second source of truth.
  const savedViews = useSavedViews({
    tableId,
    viewState,
    defaults: SAVED_VIEW_DEFAULTS,
    applyViewState,
    viewIsPristine: !isViewCustomized,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Sorting state
  const [savedSortField, setSavedSortField] = useState<string | null>(null);
  const [savedSortDirection, setSavedSortDirection] = useState<
    "asc" | "desc" | null
  >(null);
  const [savingSortPreference, setSavingSortPreference] = useState(false);

  // Search state

  // Per-column filter state. Maps field_name -> a STRUCTURED filter (pick
  // values / match text / range) — never a bare substring again. See
  // `features/data-tables/column-filters.ts` for why, and for the one place a
  // row is tested against a filter.
  /** Set when a filter ran over a capped subset — never left implicit. */
  const [filterTruncatedAt, setFilterTruncatedAt] = useState<number | null>(
    null,
  );
  /** Set when the rows a filter needs could not be loaded at all. */
  const [fullDatasetError, setFullDatasetError] = useState<string | null>(null);
  const [fullDatasetCache, setFullDatasetCache] = useState<
    TableDataRow[] | null
  >(null);
  const [loadingFullDataset, setLoadingFullDataset] = useState(false);

  // Row action state
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedRowData, setSelectedRowData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const lastSelectedRowIndex = React.useRef<number | null>(null);
  const shiftSelectionRequested = React.useRef(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Row history sheet state. historyRowId is the udt_dataset_rows.id whose
  // version log is currently visible; null = sheet closed.
  const [historyRowId, setHistoryRowId] = useState<string | null>(null);

  // Additional modals
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  // Inline column rename: the header label becomes an input, in place — the
  // way Airtable, Notion and Sheets rename a column. `null` = not renaming.
  const [renamingField, setRenamingField] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  /** When the rename input opened — see the blur guard on the input. */
  const renameOpenedAtRef = React.useRef(0);
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [showColorsDialog, setShowColorsDialog] = useState(false);
  /**
   * The table's colors, patched locally the moment a write is sent so the grid
   * repaints without a round trip. Keyed on the metadata object identity: a
   * reload brings a new `tableInfo.metadata` and the local patch retires in
   * favour of what the server holds (which includes the write).
   */
  const [localStyle, setLocalStyle] = useState<{
    base: unknown;
    style: TableStyle;
  } | null>(null);
  /** Right-click "Insert column left/right" — where the next new column lands. */
  const [pendingColumnInsert, setPendingColumnInsert] = useState<{
    order: number;
  } | null>(null);
  const [showPasteRowsDialog, setShowPasteRowsDialog] = useState(false);
  const [showTableConfigModal, setShowTableConfigModal] = useState(false);
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(false);

  // Text expansion modal state
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const [expandedFieldName, setExpandedFieldName] = useState<string | null>(
    null,
  );
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [expandedFieldKey, setExpandedFieldKey] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [expandedTextModified, setExpandedTextModified] = useState(false);
  const [savingExpandedText, setSavingExpandedText] = useState(false);

  // Reference modal state
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [referenceRowId, setReferenceRowId] = useState<string | null>(null);
  const [referenceRowData, setReferenceRowData] = useState<any>(null);

  // Row ordering state
  const [rowOrderingEnabled, setRowOrderingEnabled] = useState(false);
  const [showRowOrderingModal, setShowRowOrderingModal] = useState(false);

  // Fetch current user on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    fetchCurrentUser();
  }, []);

  const [systemOrgId, setSystemOrgId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveSystemOrgId()
      .then((id) => {
        if (!cancelled) setSystemOrgId(id);
      })
      .catch((err) => {
        // Without it an example table would look editable to its seeding
        // account; say so rather than silently guessing either way.
        console.error("Could not resolve the system organization:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // has_permission is the source of truth for sharing, so the UI matches
  // what the RLS-protected RPCs will actually accept — previously shared
  // EDITORS were wrongly shown the read-only UI.
  const isOwner =
    tableInfo !== null &&
    currentUserId !== null &&
    tableInfo.user_id === currentUserId;
  // The platform's example tables (Arman: "defaults that they can see, which
  // are read-only") belong to the global system org. They are read-only for
  // EVERYONE in the UI — including the admin account that seeded them, since
  // every agent signs in as that account and one stray keystroke would rewrite
  // the showcase every user sees. Their only writer is the seed script.
  const isExampleTable =
    tableInfo !== null &&
    systemOrgId !== null &&
    tableInfo.organization_id === systemOrgId;
  const isReadOnly =
    tableInfo !== null &&
    currentUserId !== null &&
    (isExampleTable || (!isOwner && !sharedEditor));

  useEffect(() => {
    if (!tableInfo || currentUserId === null || isOwner) return;
    let cancelled = false;
    supabase
      .rpc("has_permission", {
        p_resource_type: "dataset",
        p_resource_id: tableId,
        p_required_permission: "editor",
      })
      .then(({ data: perm }) => {
        if (!cancelled)
          setSharedEditorGrant({ tableId, granted: perm === true });
      });
    return () => {
      cancelled = true;
    };
  }, [tableInfo, currentUserId, isOwner, tableId]);

  // Why the grid is read-only, in one sentence, for the context menu's
  // disabled-item hints. The default "ask the owner for edit access" is a LIE
  // on an example table for the account that seeded it — it IS the owner.
  const readOnlyReason = isExampleTable
    ? "Platform example table — read-only for everyone"
    : undefined;

  // Show toast when trying to edit in read-only mode
  const showReadOnlyToast = () => {
    toast({
      title: "View Only",
      description: isExampleTable
        ? "This is one of the platform's example tables, so it is read-only for everyone. Create a table of your own to try this out."
        : "You don't have edit access to this shared table. You would need to duplicate it first to make changes.",
      variant: "default",
    });
  };

  // Single-cell cleanup runs the SHARED value-cleanup engine
  // (lib/content-cleanup) with its recommended defaults — the same operations
  // the bulk "Clean" control offers, so a one-cell fix and a whole-table pass
  // can never disagree about what "clean" means. It replaces the old
  // HTML-only helpers that lived here.
  const cleanCellValue = (text: string): string => {
    if (typeof text !== "string") return text;
    return cleanValue(text, DEFAULT_ENABLED_VALUE_OPERATIONS).after;
  };

  const isCellValueDirty = (text: string): boolean => {
    if (typeof text !== "string" || text.length === 0) return false;
    return cleanValue(text, DEFAULT_ENABLED_VALUE_OPERATIONS).changed;
  };

  // Add this function to handle the cleanup and update
  const handleCleanupText = async (
    fieldName: string,
    originalText: string,
    rowId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation(); // Prevent row edit modal from opening

    try {
      const cleanedText = cleanCellValue(originalText);

      if (cleanedText === originalText) {
        // No changes needed
        return;
      }

      // Surgical single-field write via udt_upsert_cell — uses jsonb_set so
      // it cannot accidentally drop other fields, fires validation + version
      // triggers, and is permission-gated by owner-or-editor.
      const result = await upsertCell({
        tableId,
        rowId,
        fieldName,
        value: cleanedText,
      });
      if (isServiceFailure(result)) throw new Error(result.error);

      // Clear sorted data cache when data is modified
      setAllSortedData(null);

      // Reload the table data to reflect changes
      loadTableData(currentPage, limit, sortField, sortDirection, searchTerm);
    } catch (err) {
      console.error("Error cleaning up text:", err);
      setError(err instanceof Error ? err.message : "Failed to cleanup text");
    }
  };

  // Load the user's table list ONCE, for whatever outer surface renders the
  // switcher. Nothing in this component consumes it — it exists purely so the
  // header's identity menu doesn't have to repeat the RPC.
  const loadTables = async () => {
    if (!onTablesChange) return;

    try {
      const result = await listUserTables();
      if (isServiceFailure(result)) throw new Error(result.error);
      onTablesChange(result.data as unknown as UserTable[]);
    } catch (err) {
      console.error("Error fetching tables:", err);
    }
  };

  // Surface the loaded table's identity to an outer route header, if any.
  useEffect(() => {
    onTableInfoChange?.(tableInfo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableInfo]);

  // Load table data
  const loadTableData = async (
    page = 1,
    pageLimit = limit,
    sort = sortField,
    direction = sortDirection,
    search = searchTerm,
    forceReload = false,
  ) => {
    setLoading(true);
    // Any server reload makes the client-side filter cache stale; drop it so
    // the filter effect re-fetches fresh full data when filters are active.
    setFullDatasetCache(null);
    try {
      // Load table metadata and fields (always reload if forceReload is true)
      let currentTableInfo = tableInfo;
      let currentFields = fields;
      let effectiveSort = sort;
      let effectiveDirection = direction;

      if (!tableInfo || !fields.length || forceReload) {
        // Metadata only — schema + a real COUNT(*), no rows. The page of rows
        // this surface actually renders is fetched below. (Until 2026-08-14
        // this called get_user_table_complete, which has no LIMIT: opening any
        // dataset shipped every row to the browser to read three facts.)
        const meta = await getTableMetadata({ tableId });
        if (isServiceFailure(meta)) throw new Error(meta.error);

        currentTableInfo = meta.data.table as unknown as TableInfo;
        currentFields = asTableFields(meta.data.columns);

        setTableInfo(currentTableInfo);
        setFields(currentFields);
        setTotalCount(meta.data.row_count);
        setTotalPages(Math.ceil(meta.data.row_count / pageLimit));

        // Apply saved default sort on initial load (when no sort is specified)
        if (!sort && currentTableInfo?.row_ordering_config?.default_sort) {
          const savedSort = currentTableInfo.row_ordering_config.default_sort;
          const fieldExists = currentFields.some(
            (f) => f.field_name === savedSort.field,
          );
          if (fieldExists) {
            effectiveSort = savedSort.field;
            effectiveDirection = savedSort.direction || "asc";
            // Update state to reflect the applied sort
            setSortField(savedSort.field);
            setSortDirection(savedSort.direction || "asc");
            setSavedSortField(savedSort.field);
            setSavedSortDirection(savedSort.direction || "asc");
          }
        }
      }

      // Then load paginated data
      const offset = (page - 1) * pageLimit;
      const { data: paginatedData, error: paginatedError } = await supabase.rpc(
        "get_user_table_data_paginated_v2",
        {
          p_table_id: tableId,
          p_limit: pageLimit,
          p_offset: offset,
          p_sort_field: effectiveSort ?? undefined,
          p_sort_direction: effectiveDirection,
          p_search_term: search ? search : undefined,
        },
      );

      if (paginatedError) throw paginatedError;
      assertRpcSuccessEnvelope(paginatedData);
      if (!paginatedData.success)
        throw new Error(paginatedData.error || "Failed to load data");

      const pagePayload = paginatedData as typeof paginatedData & {
        data: unknown[];
        pagination: {
          total_count: number;
          page_count: number;
          current_page: number;
        };
      };
      let processedData = asTableDataRows(pagePayload.data);

      // Apply row ordering if enabled and no other sorting is active
      if (
        currentTableInfo?.row_ordering_config?.enabled &&
        currentTableInfo.row_ordering_config.order &&
        !effectiveSort
      ) {
        const orderConfig = rowOrderingIds(
          currentTableInfo.row_ordering_config.order,
        );
        processedData = [...processedData].sort((a, b) => {
          const aId = a.id;
          const bId = b.id;
          const aIndex = aId !== undefined ? orderConfig.indexOf(aId) : -1;
          const bIndex = bId !== undefined ? orderConfig.indexOf(bId) : -1;

          // If both items are in the order config, sort by their position
          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
          }

          // If only one item is in the order config, prioritize it
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;

          // If neither item is in the order config, maintain original order
          return 0;
        });
      }

      // Apply client-side sorting if we have a sort field and conditions are right for client-side sorting
      if (
        effectiveSort &&
        !search &&
        page === 1 &&
        pageLimit >= pagePayload.pagination.total_count
      ) {
        // Use currentFields (local variable) since state might not be updated yet
        const fieldDef = currentFields.find(
          (f) => f.field_name === effectiveSort,
        );
        const fieldDataType = fieldDef?.data_type;
        processedData = smartSort(
          processedData,
          effectiveSort,
          effectiveDirection as "asc" | "desc",
          fieldDataType,
        );
      }

      setData(processedData);
      setTotalCount(pagePayload.pagination.total_count);
      setTotalPages(pagePayload.pagination.page_count);
      setCurrentPage(pagePayload.pagination.current_page);
    } catch (err) {
      console.error("Error loading table data:", err);
      setError(err instanceof Error ? err.message : "Failed to load table");
    } finally {
      setLoading(false);
    }
  };

  // Initial data load
  useEffect(() => {
    if (tableId) {
      loadTableData();
      void loadTables();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  useEffect(() => {
    // A selection belongs to exactly one dataset; never carry ids into the
    // next table when an embedded viewer switches in place.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedRowIds([]);
    lastSelectedRowIndex.current = null;
  }, [tableId]);

  // --- Choice options -----------------------------------------------------
  //
  // Every choice column's options resolve ONCE for the whole grid, not once per
  // cell: a bound pick list is fetched here (shared session cache) and handed to
  // each cell, so a 500-row page of a choice column is one resolution, not 500.
  // A hook per column is impossible anyway — the column count is data.
  const choiceMap = useFieldChoiceMap(
    fields.map((field) => ({
      field_name: field.field_name,
      format: resolveFieldFormat(field.data_type, field.metadata),
    })),
  );

  // ─── Colors (table-style.ts) ─────────────────────────────────────────────
  const serverStyle = tableStyleFromMetadata(tableInfo?.metadata);
  const tableStyle: TableStyle =
    localStyle && localStyle.base === tableInfo?.metadata
      ? localStyle.style
      : serverStyle;

  /** A choice column's option color for a value — what color-by paints with. */
  const choiceColorFor: ChoiceColorLookup = (fieldName, value) =>
    colorForChoice(choiceMap.get(fieldName)?.choices, value);

  /** Write ONE style path: optimistic repaint, then the server's answer wins. */
  const writeStylePath = async (path: StylePath, value: unknown) => {
    if (isReadOnly) return;
    const before = tableStyle;
    const base = tableInfo?.metadata;
    setLocalStyle({ base, style: applyStylePath(before, path, value) });
    const result = await setTableStyle({ tableId, path, value });
    if (isServiceFailure(result)) {
      setLocalStyle({ base, style: before });
      toast({
        title: "Could not save the color",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    setLocalStyle({ base, style: parseTableStyle(result.data.style) });
  };

  const rowTintClass = (row: TableDataRow): string | undefined => {
    const color = resolveRowColor(tableStyle, row, choiceColorFor);
    return color ? ROW_TINT_CLASS[color] : undefined;
  };
  const cellTintClass = (row: TableDataRow, fieldName: string): string | undefined => {
    const color = resolveCellColor(tableStyle, row, fieldName, choiceColorFor);
    return color ? CELL_TINT_CLASS[color] : undefined;
  };
  const fieldCanColorBy = (field: TableField): boolean =>
    field.data_type === "boolean" ||
    isChoiceFormat(resolveFieldFormat(field.data_type, field.metadata).id);

  // --- Column filtering -------------------------------------------------

  // Cap on how many rows we pull for client-side column filtering. Large
  // tables beyond this filter only across the loaded subset.
  const FILTER_FETCH_CAP = 5000;

  const hasColumnFilters = hasAnyActiveFilter(columnFilters);

  // Load the full dataset (sans server sort/pagination) so column filters can
  // run across every row. Respects the active global search term so the two
  // compose. Triggered lazily the first time a column filter becomes active.
  const loadFullDataset = async () => {
    try {
      setLoadingFullDataset(true);
      setFullDatasetError(null);
      const { data: allData, error } = await supabase.rpc(
        "get_user_table_data_paginated_v2",
        {
          p_table_id: tableId,
          p_limit: Math.min(Math.max(totalCount, 1), FILTER_FETCH_CAP),
          p_offset: 0,
          p_sort_field: undefined,
          p_sort_direction: "asc",
          p_search_term: searchTerm ? searchTerm : undefined,
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(allData);
      if (!allData.success)
        throw new Error(allData.error || "Failed to load data for filtering");

      const payload = allData as typeof allData & { data: unknown[] };
      const rows = asTableDataRows(payload.data);
      setFullDatasetCache(rows);
      // LOUD, not silent. Past the cap the filter runs over a subset while the
      // row count reads like the whole truth — a confident wrong answer. Record
      // it so the grid can say so instead of quietly lying.
      setFilterTruncatedAt(
        totalCount > FILTER_FETCH_CAP ? FILTER_FETCH_CAP : null,
      );
    } catch (err) {
      // A failed load used to reach console.error and leave an empty grid,
      // which the user reads as "nothing matched". Say what actually happened.
      console.error("Error loading full dataset for filtering:", err);
      setFullDatasetError(
        err instanceof Error
          ? err.message
          : "The rows needed for this filter could not be loaded.",
      );
    } finally {
      setLoadingFullDataset(false);
    }
  };

  useEffect(() => {
    if (!hasColumnFilters) return;
    if (fullDatasetCache || loadingFullDataset) return;
    if (totalCount === 0) return;
    void loadFullDataset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasColumnFilters, fullDatasetCache, loadingFullDataset, totalCount]);

  // Update a single column's filter. Resets to page 1; when the last filter is
  // cleared we re-sync with the server page so pagination stays authoritative.
  const handleColumnFilterChange = (
    fieldName: string,
    next: ColumnFilter | undefined,
  ) => {
    const nextFilters = { ...columnFilters };
    // An EMPTY filter is still stored, so the column remembers which control
    // the user chose while they are mid-edit. `isActiveFilter` decides what
    // actually narrows rows; only `undefined` clears the column entirely.
    if (next) nextFilters[fieldName] = next;
    else delete nextFilters[fieldName];
    setColumnFilters(nextFilters);
    setCurrentPage(1);

    if (!hasAnyActiveFilter(nextFilters)) {
      loadTableData(1, limit, sortField, sortDirection, searchTerm);
    }
  };

  // ONE matcher for the grid, copy, and export — `column-filters.ts` owns what
  // "matching" means so these can never drift apart.
  const applyColumnFilters = (rows: TableDataRow[]): TableDataRow[] =>
    applyFilters(rows, columnFilters);

  // ─── Realtime: suppress our own echoes, patch what is genuinely remote ────
  //
  // 🚨 SUPABASE SENDS YOU YOUR OWN WRITES, 50–500ms after your REST call already
  // returned the fresh row. This used to trigger a debounced refetch of the
  // whole table on EVERY event, including our own — so a beat after each save
  // the grid reloaded, remounted, flashed, and lost the user's place. We were
  // reloading the table to learn what we had just written.
  //
  // The guard is TIMESTAMP-MONOTONIC, never an in-flight flag: by the time the
  // echo lands the flag is long cleared, so flags always miss it
  // (`supabase-realtime` skill, rule 1).
  //
  //   older `updated_at` than we hold      → drop; it carries no information
  //   equal `updated_at` AND equal content → drop; that is our own echo
  //   equal `updated_at`, different content → DELIVER; a same-millisecond
  //                                           collaborator write is real
  //   unparseable timestamps                → fall through to delivering
  //
  // Degrading toward DELIVERING is deliberate: showing a change we could have
  // suppressed is a cosmetic flicker, while suppressing one we should have
  // shown is silent data loss on screen.
  const realtimeRefetchTimer = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const rowsRef = React.useRef<TableDataRow[]>(data);
  rowsRef.current = data;

  const handleRealtime = useCallback(
    (event: TableRealtimeEvent) => {
      // A row appeared or vanished: the page contents, the total and the
      // pagination all genuinely moved, and only a refetch can say what the
      // page is now. Debounced so a bulk import does not fire one per row.
      if (event.kind !== "UPDATE" || !event.rowId || !event.row) {
        if (realtimeRefetchTimer.current) {
          clearTimeout(realtimeRefetchTimer.current);
        }
        realtimeRefetchTimer.current = setTimeout(() => {
          void loadTableData(
            currentPage,
            limit,
            sortField,
            sortDirection,
            searchTerm,
          );
        }, 400);
        return;
      }

      const local = rowsRef.current.find((r) => r.id === event.rowId);
      const incomingData = event.row.data;
      if (!local || !incomingData) return;

      // The decision itself lives in `realtime-echo.ts` and is unit-tested —
      // this is the class that has frozen browsers before, and it should not be
      // re-derived inline in a 2,700-line component.
      const decision = classifyEcho({
        localUpdatedAt: local.updated_at,
        incomingUpdatedAt: event.row.updated_at,
        localData: local.data,
        incomingData,
      });
      if (decision !== "deliver") return;

      // A genuine remote change. Patch the row rather than refetching, so a
      // collaborator's edit appears without the grid flashing under the user.
      setData((prev) =>
        prev.map((row) =>
          row.id === event.rowId
            ? { ...row, data: incomingData, updated_at: event.row?.updated_at }
            : row,
        ),
      );
      setFullDatasetCache((prev) =>
        prev
          ? prev.map((row) =>
              row.id === event.rowId
                ? {
                    ...row,
                    data: incomingData,
                    updated_at: event.row?.updated_at,
                  }
                : row,
            )
          : prev,
      );
      setAllSortedData((prev) =>
        prev
          ? prev.map((row) =>
              row.id === event.rowId
                ? {
                    ...row,
                    data: incomingData,
                    updated_at: event.row?.updated_at,
                  }
                : row,
            )
          : prev,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPage, limit, sortField, sortDirection, searchTerm],
  );

  useTableRealtime(tableId, handleRealtime, {
    // Another editor renamed the table, rewrote its description or changed
    // its colors: adopt the row. `metadata` arriving as a NEW object is what
    // retires any optimistic local style patch in favour of the server's.
    onTableChange: (row) =>
      setTableInfo((prev) =>
        prev
          ? {
              ...prev,
              ...(typeof row.table_name === "string"
                ? { table_name: row.table_name }
                : {}),
              ...(row.description !== undefined
                ? { description: row.description ?? undefined }
                : {}),
              ...(row.metadata !== undefined ? { metadata: row.metadata } : {}),
            }
          : prev,
      ),
  });

  useEffect(
    () => () => {
      if (realtimeRefetchTimer.current)
        clearTimeout(realtimeRefetchTimer.current);
    },
    [],
  );

  // Check row ordering status when table info changes
  useEffect(() => {
    if (tableInfo) {
      setRowOrderingEnabled(checkRowOrderingEnabled());
    }
  }, [tableInfo]);

  // Keep saved sort state in sync with tableInfo (for UI display purposes)
  // Note: The actual sort is applied in loadTableData when the table info is first loaded
  useEffect(() => {
    if (tableInfo?.row_ordering_config?.default_sort) {
      const { field, direction } = tableInfo.row_ordering_config.default_sort;
      setSavedSortField(field);
      setSavedSortDirection(direction || "asc");
    } else if (tableInfo) {
      setSavedSortField(null);
      setSavedSortDirection(null);
    }
  }, [tableInfo?.row_ordering_config?.default_sort]);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);

    // When column filters are active, pagination is purely client-side over
    // the filtered set — the derived slice handles it, no server fetch.
    if (hasColumnFilters) {
      return;
    }

    // If we have client-side sorted data cached, use it for pagination
    if (allSortedData && allSortedData.length > 0 && sortField) {
      const startIndex = (page - 1) * limit;
      const pageData = allSortedData.slice(startIndex, startIndex + limit);
      setData(pageData);
    } else {
      loadTableData(page, limit);
    }
  };

  // Handle rows per page change
  const handleLimitChange = (newLimit: string) => {
    const numLimit = parseInt(newLimit, 10);
    setLimit(numLimit);
    // Reset to first page when changing limit
    setCurrentPage(1);

    // Column filters paginate client-side over the derived slice.
    if (hasColumnFilters) {
      return;
    }

    // If we have client-side sorted data cached, use it
    if (allSortedData && allSortedData.length > 0 && sortField) {
      const pageData = allSortedData.slice(0, numLimit);
      setData(pageData);
      setTotalPages(Math.ceil(allSortedData.length / numLimit));
    } else {
      loadTableData(1, numLimit);
    }
  };

  // Threshold for client-side sorting (rows) - prevents loading too much data
  const CLIENT_SORT_THRESHOLD = 1000;

  // State for storing all sorted data when doing client-side sorting
  const [allSortedData, setAllSortedData] = useState<TableDataRow[] | null>(
    null,
  );

  // Smart numeric sorting helper
  const isNumericValue = (value: any): boolean => {
    if (value === null || value === undefined || value === "") return false;
    const stringValue = String(value).trim();
    return !isNaN(Number(stringValue)) && isFinite(Number(stringValue));
  };

  const parseNumericValue = (value: any): number => {
    if (value === null || value === undefined || value === "") return -Infinity;
    return Number(String(value).trim());
  };

  // Get the data type for a field by name
  const getFieldDataType = (fieldName: string): string | undefined => {
    const field = fields.find((f) => f.field_name === fieldName);
    return field?.data_type;
  };

  const smartSort = (
    rows: TableDataRow[],
    fieldName: string,
    direction: "asc" | "desc",
    declaredDataType?: string,
  ) => {
    // If the field is declared as integer or number, force numeric sorting
    const forceNumeric =
      declaredDataType === "integer" || declaredDataType === "number";

    return [...rows].sort((a, b) => {
      const aValue = a.data[fieldName];
      const bValue = b.data[fieldName];

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) {
        if (bValue === null || bValue === undefined) return 0;
        return direction === "asc" ? -1 : 1;
      }
      if (bValue === null || bValue === undefined) {
        return direction === "asc" ? 1 : -1;
      }

      // Use declared data type to determine if numeric, otherwise detect from values
      const aIsNumeric = forceNumeric || isNumericValue(aValue);
      const bIsNumeric = forceNumeric || isNumericValue(bValue);

      if (aIsNumeric && bIsNumeric) {
        // Both are numeric - do numeric comparison
        const aNum = parseNumericValue(aValue);
        const bNum = parseNumericValue(bValue);
        const result = aNum - bNum;
        return direction === "asc" ? result : -result;
      } else if (aIsNumeric && !bIsNumeric) {
        // Mixed types - numeric values come first in ascending order
        return direction === "asc" ? -1 : 1;
      } else if (!aIsNumeric && bIsNumeric) {
        // Mixed types - numeric values come first in ascending order
        return direction === "asc" ? 1 : -1;
      } else {
        // Both are non-numeric - do string comparison
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        const result = aStr.localeCompare(bStr);
        return direction === "asc" ? result : -result;
      }
    });
  };

  // Handle sorting. Pass an explicit direction to set it directly (used by the
  // per-column header menu); omit it to toggle asc/desc on repeated clicks.
  const handleSort = async (
    field: string,
    explicitDirection?: "asc" | "desc",
  ) => {
    const newDirection =
      explicitDirection ??
      (field === sortField && sortDirection === "asc" ? "desc" : "asc");

    // A formula column exists only in the browser: the server's sort RPC
    // reads the stored (empty) cell. Client-side sorting covers it whenever
    // the browser can hold every row; when it cannot, say so — never a sort
    // arrow over an order that is not real.
    const sortTarget = fields.find((f) => f.field_name === field);
    if (
      sortTarget &&
      isFormulaColumn(sortTarget) &&
      !hasColumnFilters &&
      (totalCount > CLIENT_SORT_THRESHOLD || Boolean(searchTerm))
    ) {
      toast({
        title: `Can't sort by ${sortTarget.display_name} right now`,
        description: searchTerm
          ? "Formula columns are calculated in your browser, so they can't be sorted while a search is active. Clear the search, then sort."
          : `Formula columns are calculated in your browser, and this table has more than ${CLIENT_SORT_THRESHOLD.toLocaleString()} rows. Filter the table down first, then sort.`,
        variant: "destructive",
      });
      return;
    }

    setSortField(field);
    setSortDirection(newDirection);

    // While column filters are active, sorting is applied client-side over the
    // filtered set in the render derivation — no server round-trip needed.
    if (hasColumnFilters) {
      return;
    }

    // Get the declared data type for type-aware sorting
    const fieldDataType = getFieldDataType(field);

    // For small datasets without search, use client-side sorting for correct type handling
    if (totalCount <= CLIENT_SORT_THRESHOLD && !searchTerm) {
      // Check if we already have all data cached, just resort it
      if (allSortedData && allSortedData.length === totalCount) {
        const resortedData = smartSort(
          allSortedData,
          field,
          newDirection,
          fieldDataType,
        );
        setAllSortedData(resortedData);
        // Show the appropriate page slice
        const startIndex = (currentPage - 1) * limit;
        const pageData = resortedData.slice(startIndex, startIndex + limit);
        setData(pageData);
        return;
      }

      // Load all data for client-side sorting
      setLoading(true);
      try {
        const { data: allData, error } = await supabase.rpc(
          "get_user_table_data_paginated",
          {
            p_table_id: tableId,
            p_limit: totalCount,
            p_offset: 0,
            p_sort_field: undefined,
            p_sort_direction: "asc",
            p_search_term: undefined,
          },
        );

        if (error) throw error;
        assertRpcSuccessEnvelope(allData);
        if (!allData.success)
          throw new Error(allData.error || "Failed to load data");

        const allPayload = allData as typeof allData & { data: unknown[] };
        // Sort all data client-side with type awareness
        // A formula column has no stored value to sort by — compute it over
        // the freshly loaded rows first, then sort on what the user sees.
        const sortedData = smartSort(
          withComputedColumns(asTableDataRows(allPayload.data), fields).rows,
          field,
          newDirection,
          fieldDataType,
        );
        setAllSortedData(sortedData);

        // Show the appropriate page slice
        const startIndex = (currentPage - 1) * limit;
        const pageData = sortedData.slice(startIndex, startIndex + limit);
        setData(pageData);
      } catch (err) {
        console.error("Error during client-side sorting:", err);
        // Fallback to server-side sorting
        setAllSortedData(null);
        loadTableData(currentPage, limit, field, newDirection);
      } finally {
        setLoading(false);
      }
    } else {
      // Fall back to server-side sorting for large datasets or when searching
      setAllSortedData(null);
      loadTableData(currentPage, limit, field, newDirection);
    }
  };

  // Clear the active sort and restore the table's natural/server order.
  const clearSort = () => {
    setSortField(null);
    setSortDirection("asc");
    setAllSortedData(null);
    if (!hasColumnFilters) {
      loadTableData(currentPage, limit, null, "asc", searchTerm);
    }
  };

  /**
   * One complete, sorted/filtered row source for Copy, Copy for AI, and the
   * custom picker. This deliberately reuses the same RPC as full export, so a
   * direct copy never means "only the currently-loaded page".
   */
  const loadRowsForCopy = async (): Promise<TableDataRow[]> => {
    const complete = await getCompleteTable({
      tableId,
      sortField,
      sortDirection,
    });
    if (isServiceFailure(complete)) throw new Error(complete.error);

    // Formula columns are EMPTY in what the database returns — compute them
    // before the search, the filters and the sort look at the rows.
    let rows: TableDataRow[] = withComputedColumns(
      complete.data.rows.map((row) => ({ id: row.id, data: row.data })),
      fields,
    ).rows;
    const query = searchTerm.trim().toLowerCase();
    if (query) {
      rows = rows.filter((row) =>
        Object.values(row.data).some((value) => {
          const text =
            typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : String(value ?? "");
          return text.toLowerCase().includes(query);
        }),
      );
    }
    rows = applyColumnFilters(rows);
    if (sortField) {
      rows = smartSort(
        rows,
        sortField,
        sortDirection,
        getFieldDataType(sortField),
      );
    }
    return rows;
  };

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Clear sorted data cache when searching (server-side search + sort needed)
    setAllSortedData(null);
    loadTableData(1, limit, sortField, sortDirection, searchTerm);
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm("");
    // Clear sorted data cache when clearing search
    setAllSortedData(null);
    loadTableData(1, limit, sortField, sortDirection, "");
  };

  // Handle edit row
  const handleEditRow = (rowId: string, rowData: Record<string, unknown>) => {
    setSelectedRowId(rowId);
    setSelectedRowData(rowData);
    setShowEditModal(true);
  };

  // Handle delete row
  const handleDeleteRow = (rowId: string) => {
    setSelectedRowId(rowId);
    setShowDeleteModal(true);
  };

  // Handle text expansion
  const handleExpandText = (
    text: string,
    fieldName: string,
    rowId: string,
    fieldKey: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation(); // Prevent row edit modal from opening
    setExpandedText(text);
    setExpandedFieldName(fieldName);
    setExpandedRowId(rowId);
    setExpandedFieldKey(fieldKey);
    setExpandedTextModified(false);
    setShowTextModal(true);
  };

  // Handle HTML cleanup in the text expansion modal
  const handleCleanupExpandedText = () => {
    if (!expandedText) return;

    const cleanedText = cleanCellValue(expandedText);
    setExpandedText(cleanedText);
    setExpandedTextModified(true);
  };

  // Handle saving expanded text changes to the database
  const handleSaveExpandedText = async () => {
    if (!expandedRowId || !expandedFieldKey || !expandedText) return;

    try {
      setSavingExpandedText(true);

      // Surgical single-field write via udt_upsert_cell.
      const result = await upsertCell({
        tableId,
        rowId: expandedRowId,
        fieldName: expandedFieldKey,
        value: expandedText,
      });
      if (isServiceFailure(result)) throw new Error(result.error);

      // Clear sorted data cache when data is modified
      setAllSortedData(null);

      // Reload the table data to reflect changes
      await loadTableData(
        currentPage,
        limit,
        sortField,
        sortDirection,
        searchTerm,
      );

      setExpandedTextModified(false);
      setShowTextModal(false);

      // Reset expanded text state
      setExpandedText(null);
      setExpandedFieldName(null);
      setExpandedRowId(null);
      setExpandedFieldKey(null);
    } catch (err) {
      console.error("Error saving expanded text:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save text changes",
      );
    } finally {
      setSavingExpandedText(false);
    }
  };

  // Handle manual text changes in the expanded modal
  const handleExpandedTextChange = (newText: string) => {
    setExpandedText(newText);
    setExpandedTextModified(true);
  };

  // Check if row ordering is enabled for this table
  const checkRowOrderingEnabled = () => {
    if (!tableInfo?.row_ordering_config) return false;
    return tableInfo.row_ordering_config.enabled === true;
  };

  // Get the current row order from the table config
  const getCurrentRowOrder = () => {
    if (!tableInfo?.row_ordering_config?.order) return [];
    return tableInfo.row_ordering_config.order;
  };

  // Update row ordering configuration
  const updateRowOrdering = async (newOrder: string[]) => {
    try {
      const { data, error } = await supabase.rpc(
        "update_user_table_row_ordering",
        {
          p_table_id: tableId,
          p_enabled: true,
          p_order: newOrder,
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(data);
      if (!data.success)
        throw new Error(data.error || "Failed to update row order");

      // Clear sorted data cache when row ordering changes
      setAllSortedData(null);

      // Reload table data to reflect new order
      await loadTableData(
        currentPage,
        limit,
        sortField,
        sortDirection,
        searchTerm,
        true,
      );
    } catch (err) {
      console.error("Error updating row order:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update row order",
      );
    }
  };

  // Enable row ordering for the table
  const enableRowOrdering = async () => {
    if (!data.length) return;

    // Create initial order based on current data
    const initialOrder = data.map((row) => row.id);
    await updateRowOrdering(initialOrder);
    setRowOrderingEnabled(true);
  };

  // Disable row ordering
  const disableRowOrdering = async () => {
    try {
      const { data, error } = await supabase.rpc(
        "update_user_table_row_ordering",
        {
          p_table_id: tableId,
          p_enabled: false,
          p_order: [],
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(data);
      if (!data.success)
        throw new Error(data.error || "Failed to disable row ordering");

      // Clear sorted data cache when row ordering changes
      setAllSortedData(null);

      setRowOrderingEnabled(false);
      await loadTableData(
        currentPage,
        limit,
        sortField,
        sortDirection,
        searchTerm,
        true,
      );
    } catch (err) {
      console.error("Error disabling row ordering:", err);
      setError(
        err instanceof Error ? err.message : "Failed to disable row ordering",
      );
    }
  };

  // Save current sort as default
  const saveDefaultSort = async () => {
    if (!sortField) return;

    try {
      setSavingSortPreference(true);

      const { data, error } = await supabase.rpc(
        "update_user_table_default_sort",
        {
          p_table_id: tableId,
          p_sort_field: sortField,
          p_sort_direction: sortDirection,
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(data);
      if (!data.success)
        throw new Error(data.error || "Failed to save sort preference");

      // Update saved sort state
      setSavedSortField(sortField);
      setSavedSortDirection(sortDirection);

      // Update tableInfo to reflect the change
      if (tableInfo) {
        setTableInfo({
          ...tableInfo,
          row_ordering_config: {
            ...tableInfo.row_ordering_config,
            default_sort: { field: sortField, direction: sortDirection },
          },
        });
      }
    } catch (err) {
      console.error("Error saving sort preference:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save sort preference",
      );
    } finally {
      setSavingSortPreference(false);
    }
  };

  // Clear saved default sort
  const clearDefaultSort = async () => {
    try {
      setSavingSortPreference(true);

      const { data, error } = await supabase.rpc(
        "update_user_table_default_sort",
        {
          p_table_id: tableId,
          p_sort_field: undefined,
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(data);
      if (!data.success)
        throw new Error(data.error || "Failed to clear sort preference");

      // Clear saved sort state
      setSavedSortField(null);
      setSavedSortDirection(null);

      // Update tableInfo to reflect the change
      if (tableInfo) {
        const newConfig = { ...tableInfo.row_ordering_config };
        delete newConfig.default_sort;
        setTableInfo({
          ...tableInfo,
          row_ordering_config: newConfig,
        });
      }
    } catch (err) {
      console.error("Error clearing sort preference:", err);
      setError(
        err instanceof Error ? err.message : "Failed to clear sort preference",
      );
    } finally {
      setSavingSortPreference(false);
    }
  };

  // Check if current sort matches saved sort
  const isSortSaved =
    sortField === savedSortField && sortDirection === savedSortDirection;

  // --- Bulk cell cleanup ------------------------------------------------
  //
  // Backs the toolbar's <CellCleanupButton>. The button owns the operation
  // choice and the review; this side owns only "give me every row" and
  // "write these patches" — the two things that need the table's own
  // canonical paths (paginated RPC in, udt_bulk_write out).

  /** Every row, not just the current page — cleaning only what you can see is
   *  the wrong answer for a table that paginates. */
  const loadAllRowsForCleanup = async (): Promise<CleanableRow[]> => {
    const { data: allData, error: allError } = await supabase.rpc(
      "get_user_table_data_paginated_v2",
      {
        p_table_id: tableId,
        p_limit: Math.min(Math.max(totalCount, 1), FILTER_FETCH_CAP),
        p_offset: 0,
        p_sort_field: undefined,
        p_sort_direction: "asc",
        p_search_term: undefined,
      },
    );
    if (allError) throw allError;
    assertRpcSuccessEnvelope(allData);
    if (!allData.success) {
      throw new Error(allData.error || "Failed to load rows for cleanup");
    }
    const payload = allData as typeof allData & { data: unknown[] };
    return asTableDataRows(payload.data);
  };

  /** Write the accepted patches as ONE atomic merge bulkWrite — only the
   *  changed fields per row, so every other key survives untouched. */
  const applyCleanupPatches = async (patches: RowPatch[]) => {
    if (patches.length === 0) return;
    const operations: BulkMergeOp[] = patches.map((p) => ({
      op: "merge",
      row_id: p.rowId,
      data: p.data,
    }));
    const bulkResult = await bulkWrite({ tableId, operations });
    if (isServiceFailure(bulkResult)) {
      toast({
        title: "Cleanup failed",
        description: bulkResult.error,
        variant: "destructive",
      });
      throw new Error(bulkResult.error);
    }

    setAllSortedData(null);
    await loadTableData(
      currentPage,
      limit,
      sortField,
      sortDirection,
      searchTerm,
    );
    toast({
      title: "Cells cleaned",
      description: `Updated ${patches.length} row${patches.length !== 1 ? "s" : ""}.`,
    });
  };

  // Handle reference modal
  const handleShowReference = (
    rowId: string,
    rowData: any,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation(); // Prevent row edit modal from opening
    setReferenceRowId(rowId);
    setReferenceRowData(rowData);
    setShowReferenceModal(true);
  };

  /**
   * Remove a column from the grid header menu.
   *
   * Deliberately the SAME confirm copy and the SAME RPC as TableConfigModal —
   * one delete-column path, so the header shortcut and the settings dialog can
   * never diverge on what deletion means or what it warns about.
   */
  /**
   * Begin renaming a column in its header. Deferred a beat: this is called
   * from a menu row, and the menu hands focus back to its trigger as it
   * closes — an input mounted before that would be blurred (and cancelled)
   * the instant it appeared.
   */
  const startColumnRename = (fieldName: string) => {
    if (isReadOnly) {
      showReadOnlyToast();
      return;
    }
    const field = fields.find((f) => f.field_name === fieldName);
    if (!field) return;
    window.setTimeout(() => {
      renameOpenedAtRef.current = Date.now();
      setRenameDraft(field.display_name);
      setRenamingField(fieldName);
    }, 150);
  };

  const cancelColumnRename = () => {
    setRenamingField(null);
    setRenameDraft("");
  };

  const commitColumnRename = async () => {
    if (renameSaving || renamingField === null) return;
    const field = fields.find((f) => f.field_name === renamingField);
    const nextName = renameDraft.trim();
    if (!field || !nextName || nextName === field.display_name) {
      cancelColumnRename();
      return;
    }
    setRenameSaving(true);
    const result = await renameColumn({
      tableId,
      field,
      newName: nextName,
      fields,
    });
    setRenameSaving(false);
    if (isServiceFailure(result)) {
      // Keep the input open with what was typed, so it can be fixed.
      toast({
        title: "Couldn't rename the column",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    cancelColumnRename();
    const { formulasUpdated, formulasFailed } = result.data;
    if (formulasFailed.length > 0) {
      toast({
        title: `Renamed to "${nextName}" — but a formula still uses the old name`,
        description: `Open Table settings and fix the formula in: ${formulasFailed.join(", ")}. Until then it shows #ERROR.`,
        variant: "destructive",
      });
    } else if (formulasUpdated.length > 0) {
      toast({
        title: `Renamed to "${nextName}"`,
        description: `Updated the formula in ${formulasUpdated.join(", ")} to use the new name.`,
        variant: "success",
      });
    }
    await loadTableData(
      currentPage,
      limit,
      sortField,
      sortDirection,
      searchTerm,
      true,
    );
  };

  const handleDeleteColumn = async (field: TableField) => {
    const ok = await confirmDialog({
      title: `Remove "${field.display_name}"?`,
      description:
        "This column and its values are removed from every row in the table. Row history keeps a record, but there is no undo in the app.",
      confirmLabel: "Remove column",
      variant: "destructive",
    });
    if (!ok) return;

    const result = await deleteField({ tableId, fieldId: field.id });
    if (isServiceFailure(result)) {
      toast({
        title: "Could not remove the column",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: `Removed "${result.data.display_name}"`,
      description:
        result.data.rows_cleared > 0
          ? `Cleared its value from ${result.data.rows_cleared} row${result.data.rows_cleared === 1 ? "" : "s"}.`
          : "No rows carried a value for it.",
      variant: "success",
    });

    setAllSortedData(null);
    await loadTableData(
      currentPage,
      limit,
      sortField,
      sortDirection,
      searchTerm,
      true,
    );
  };

  // Add this helper function somewhere in the component, before the return statement
  const formatCellValue = (value: any, dataType: string) => {
    if (value === null || value === undefined)
      return {
        display: "—",
        isTruncated: false,
        fullText: "",
        hasCleanableHtml: false,
      };

    // Format based on data type
    switch (dataType) {
      case "json":
        const jsonDisplay =
          typeof value === "object" ? JSON.stringify(value) : value;
        return {
          display: jsonDisplay,
          isTruncated: false,
          fullText: jsonDisplay,
          hasCleanableHtml: false,
        };
      case "array":
        const arrayDisplay = Array.isArray(value)
          ? JSON.stringify(value)
          : value;
        return {
          display: arrayDisplay,
          isTruncated: false,
          fullText: arrayDisplay,
          hasCleanableHtml: false,
        };
      case "boolean":
        const boolDisplay = value ? "True" : "False";
        return {
          display: boolDisplay,
          isTruncated: false,
          fullText: boolDisplay,
          hasCleanableHtml: false,
        };
      case "date":
      case "datetime":
        try {
          const dateDisplay = new Date(value).toLocaleString();
          return {
            display: dateDisplay,
            isTruncated: false,
            fullText: dateDisplay,
            hasCleanableHtml: false,
          };
        } catch (e) {
          return {
            display: value,
            isTruncated: false,
            fullText: value,
            hasCleanableHtml: false,
          };
        }
      case "string":
        // For string fields, handle multiline content intelligently
        const stringValue = String(value);
        const hasCleanableHtml = isCellValueDirty(stringValue);
        const lines = stringValue.split("\n");

        // If multiline, show first line with indicator
        if (lines.length > 1) {
          const firstLine = lines[0];
          return {
            display: firstLine,
            isTruncated: true,
            fullText: stringValue,
            hasCleanableHtml,
            multilineIndicator: `+${lines.length - 1} more lines`,
          };
        }

        // For single line, let CSS handle truncation based on available space
        return {
          display: stringValue,
          isTruncated: stringValue.length > 100, // Only consider "truncated" if reasonably long
          fullText: stringValue,
          hasCleanableHtml,
        };
      default:
        const defaultDisplay = String(value);
        const defaultHasCleanableHtml = isCellValueDirty(defaultDisplay);
        return {
          display: defaultDisplay,
          isTruncated: defaultDisplay.length > 100,
          fullText: defaultDisplay,
          hasCleanableHtml: defaultHasCleanableHtml,
        };
    }
  };

  // ─── Surface runtime (matrx-user/data-tables) ─────────────────────────────
  //
  // Both refs are reassigned by the grid root's callback ref during commit
  // (below, once displayRows is known). That matters for the write handlers:
  // `applySurfaceWrite` resolves the handler closure BEFORE the user answers
  // the confirm dialog, so anything a handler reads off its render closure can
  // be stale by the time Apply is pressed — on a grid, that is the difference
  // between validating against the rows the user is looking at now and the
  // rows they were looking at a page ago. Reading through a
  // commit-synchronously advanced ref is what makes `cell_value`'s coordinate
  // check trustworthy without mutating refs during render.
  const surfaceScopeRef = React.useRef<DataTableScopeInput | null>(null);
  const surfaceWriteRef = React.useRef<DataTableWriteLiveState | null>(null);

  const surfaceWriteHandlers = useDataTableWriteHandlers(surfaceWriteRef, {
    onDescriptionSaved: (description) => {
      // Same shape the metadata modals produce, so the header label and the
      // read twin (`table_description`) refresh without refetching the table.
      setTableInfo((prev) => (prev ? { ...prev, description } : prev));
    },
    // An agent write is still ONE cell — patch it in place for the same reason
    // a hand edit does, so the grid does not flash under the user mid-run.
    onCellSaved: (rowId, fieldName, value) => {
      patchLocalCell(rowId, fieldName, value);
    },
  });

  const getSurfaceScope = React.useCallback(
    () =>
      buildDataTablesScope(
        surfaceScopeRef.current ?? {
          // Pre-first-paint of the grid: identity only. Every other value is
          // genuinely absent, and the manifest promises "empty when …" rather
          // than a fabricated shape.
          tableId,
          isReadOnly: null,
          fields: [],
          visibleRows: [],
          totalCount: 0,
          searchTerm: "",
          fullDataset: null,
          openCell: null,
          openRow: null,
        },
      ),
    [tableId],
  );

  // ─── Derivation + grid hooks — MUST STAY ABOVE THE EARLY RETURNS ─────────
  //
  // The three `return`s just below are conditional, so every hook has to be
  // called before them or React sees a different hook count between a loading
  // render and a loaded one ("rendered more hooks than during the previous
  // render") and the whole viewer drops into its error boundary. The row
  // derivation moves up with them because the selection hook needs the row ids.

  // Derive the rows actually shown. When column filters are active we filter
  // (and sort) the full dataset client-side, then paginate the result. With no
  // filters we defer entirely to the server-driven `data`.
  let displayRows: TableDataRow[] = data;
  let effectiveTotalCount = totalCount;
  let effectiveTotalPages = totalPages;

  if (hasColumnFilters) {
    // Formula values are computed BEFORE the filter and the sort run, so a
    // filter on a formula column judges the number the user sees.
    const source = withComputedColumns(fullDatasetCache ?? data, fields).rows;
    let filtered = applyColumnFilters(source);
    if (sortField) {
      filtered = smartSort(
        filtered,
        sortField,
        sortDirection,
        getFieldDataType(sortField),
      );
    }
    effectiveTotalCount = filtered.length;
    effectiveTotalPages = Math.max(1, Math.ceil(filtered.length / limit));
    const startIndex = (currentPage - 1) * limit;
    displayRows = filtered.slice(startIndex, startIndex + limit);
  }

  // ─── Formula columns (features/data-tables/formulas.ts) ──────────────────
  //
  // A formula column STORES nothing; its value is computed from the row at
  // read time by ONE helper, `withComputedColumns` — used here for the page,
  // by `loadRowsForCopy` / `loadAllRows` for every copy and export, by the
  // client-side sort, and by the agent scope — so every reader sees the same
  // number and a write can never land in it (the cell is read-only below, and
  // paste / clear / fill skip it). Errors are per cell: a bad reference or a
  // division by zero renders #ERROR with the reason.
  const formulaColumns = formulaColumnsOf(fields);
  const computedPage = withComputedColumns(displayRows, fields);
  displayRows = computedPage.rows;
  const formulaErrors = computedPage.errors;
  const isFormulaField = (fieldName: string): boolean =>
    formulaColumns.some((c) => c.field.field_name === fieldName);

  // ─── Validation rules (features/data-tables/validation.ts) ───────────────
  // Parsed once per render per column; the cell editors, the amber mismatch
  // marker and the paste path all judge against the same parsed rules.
  const validationByField = new Map<string, ValidationRules>(
    fields.flatMap((field) => {
      const rules = parseValidationRules(field.validation_rules);
      return hasValidationRules(rules) ? [[field.field_name, rules] as const] : [];
    }),
  );
  /**
   * Every OTHER loaded row's value for a `unique` column. Read from the full
   * cache when the viewer holds it, else the page — the honest set the browser
   * has; the strict-mode trigger does not enforce uniqueness (cross-row).
   */
  const existingValuesFor = (fieldName: string, rowId: string): unknown[] | undefined => {
    if (!validationByField.get(fieldName)?.unique) return undefined;
    return (fullDatasetCache ?? data)
      .filter((row) => row.id !== rowId)
      .map((row) => row.data[fieldName]);
  };

  // True while we're fetching the full dataset for a freshly-applied filter.
  const filteringInProgress =
    hasColumnFilters && loadingFullDataset && !fullDatasetCache;
  const showLoadingRow = loading || filteringInProgress;

  const selectedRowIdSet = new Set(selectedRowIds);
  // ─── Cell selection, keyboard navigation and undo ────────────────────────
  //
  // Three states, not two: nothing selected / one cell selected / one cell
  // being edited. The middle state is what makes arrow keys, Tab, copy and
  // Delete mean anything — see `features/data-tables/grid-selection.ts`.

  /**
   * A cell write landed — patch that ONE cell in the rows we already hold.
   *
   * 🚨 NEVER REFETCH FOR A SINGLE CELL. A full reload replaces every row object,
   * so React remounts the whole body: the grid visibly flashes, the scroll
   * position jumps, and the cell you just left stops being the cell you are
   * looking at. For a value the server already confirmed, the browser knows the
   * answer — going back to the network to learn what we just wrote is both
   * slower and worse.
   *
   * The write is already authoritative: `udt_upsert_cell` is a surgical
   * jsonb_set that cannot touch another field, and it returns the stored row.
   * So this is not an optimistic guess that might diverge — it is applying the
   * result we were handed.
   *
   * Every row source has to be patched together or they disagree: `data` is the
   * page on screen, `fullDatasetCache` backs column filtering, `allSortedData`
   * backs whole-table sorting. Patching one and dropping the others is how a
   * filtered view starts showing a stale value.
   */
  const patchLocalCell = useCallback(
    (
      rowId: string,
      fieldName: string,
      value: unknown,
      /**
       * The `updated_at` the SERVER stored for this write. Recording it is what
       * makes the incoming echo recognizable as ours: the echo arrives with the
       * same stamp and the same content, and is dropped. Omitted for a purely
       * local patch, which then simply fails to suppress — degrading to a
       * refetch, never to showing the wrong value.
       */
      serverUpdatedAt?: string,
    ) => {
      const patch = (rows: TableDataRow[] | null): TableDataRow[] | null => {
        if (!rows) return rows;
        let hit = false;
        const next = rows.map((row) => {
          if (row.id !== rowId) return row;
          hit = true;
          return {
            ...row,
            data: { ...row.data, [fieldName]: value },
            ...(serverUpdatedAt ? { updated_at: serverUpdatedAt } : {}),
          };
        });
        // Identity is preserved when nothing matched, so React skips the
        // re-render entirely rather than reconciling an equal list.
        return hit ? next : rows;
      };
      setData((prev) => patch(prev) ?? prev);
      setFullDatasetCache((prev) => patch(prev));
      setAllSortedData((prev) => patch(prev));
    },
    [],
  );

  /**
   * A write changed which ROWS exist (insert, delete) — only then is a refetch
   * the honest answer, because the page's contents genuinely changed and the
   * total and pagination move with it.
   */
  const refreshAfterWrite = useCallback(() => {
    setAllSortedData(null);
    setFullDatasetCache(null);
    void loadTableData(
      currentPage,
      limit,
      sortField,
      sortDirection,
      searchTerm,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, limit, sortField, sortDirection, searchTerm]);

  const cellUndo = useCellUndo({
    // Undo restores ONE cell; patch it rather than reloading the table. A
    // reload here would be doubly wrong — undo exists to put things back, and
    // a flashing, scroll-jumping grid is not "back".
    onApplied: (edit, appliedValue) =>
      patchLocalCell(edit.rowId, edit.fieldName, appliedValue),
    readOnly: isReadOnly,
  });

  // An undo stack must never outlive its table: restoring a value into a table
  // the user has navigated away from would be a write they never asked for.
  useEffect(() => {
    cellUndo.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const rowIdsOnPage = displayRows.map((row) => row.id);
  /**
   * The columns THIS VIEW renders, in this view's order.
   *
   * `fields` stays the table's full truth (Table Settings, the agent scope, the
   * row editor all need every column). `viewFields` is what the GRID draws.
   * Keeping both is deliberate: hiding a column from your view must never hide
   * it from the row editor, from export, or from an agent reading the schema.
   */
  const viewFields = resolveViewColumns(fields, {
    hidden: hiddenColumns,
    order: columnOrder,
  });
  const effectiveLayout = resolveTableLayout(
    layoutMode,
    viewFields.length,
    FIXED_LAYOUT_MAX_COLUMNS,
  );
  const firstViewFieldName = viewFields[0]?.field_name ?? null;

  const fieldNamesInOrder = viewFields.map((f) => f.field_name);

  const readCell = useCallback(
    (address: CellAddress): unknown =>
      displayRows.find((r) => r.id === address.rowId)?.data?.[
        address.fieldName
      ],
    [displayRows],
  );

  /** What a cell puts on the clipboard — the same text a spreadsheet would. */
  const getCellText = useCallback(
    (address: CellAddress): string => cellClipboardText(readCell(address)),
    [readCell],
  );

  const handleCopied = useCallback((cells: CellAddress[], text: string) => {
    toast({
      title: cells.length > 1 ? `Copied ${cells.length} cells` : "Copied",
      description: text.slice(0, 80) || "Empty cell",
    });
  }, []);

  /**
   * Coerce pasted text EXACTLY the way a hand edit does: the column's declared
   * format owns the parse (currency strips "$", a number column yields a
   * number, empty text becomes null). A second normalizer here is how a paste
   * and a typed edit end up storing different things for the same characters.
   */
  const coerceForField = useCallback(
    (field: TableField, raw: string): unknown =>
      parseFieldInput(
        raw,
        resolveFieldFormat(field.data_type, field.metadata),
        field.data_type,
      ),
    [],
  );

  /**
   * Delete / Backspace on the selection (one cell or a range), and the second
   * half of a cut. ONE transaction however many cells, each recorded on the
   * undo stack so Cmd-Z walks the clearing back cell by cell. Cells that are
   * already empty are skipped — nothing to write, nothing to undo.
   */
  const handleClearCells = useCallback(
    async (addresses: CellAddress[]) => {
      if (isReadOnly) return;
      const fieldByName = new Map(fields.map((f) => [f.field_name, f]));
      const targets = addresses
        .filter((address) => !isFormulaField(address.fieldName))
        .map((address) => ({ address, prior: readCell(address) }))
        .filter(
          ({ prior }) => prior !== null && prior !== undefined && prior !== "",
        );
      if (targets.length === 0) return;

      const ops: BulkOp[] = targets.map(({ address }) => ({
        op: "cell",
        row_id: address.rowId,
        field_name: address.fieldName,
        value: null,
      }));
      const result = await bulkWrite({ tableId, operations: ops });
      if (isServiceFailure(result)) {
        toast({
          title:
            targets.length === 1
              ? "Could not clear that cell"
              : `Could not clear ${targets.length} cells`,
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      const failed = new Set(
        result.data.results.filter(isBulkOpError).map((r) => r.row_id),
      );
      for (const { address, prior } of targets) {
        if (failed.has(address.rowId)) continue;
        cellUndo.record({
          tableId,
          rowId: address.rowId,
          fieldName: address.fieldName,
          fieldDisplayName:
            fieldByName.get(address.fieldName)?.display_name ?? address.fieldName,
          priorValue: prior,
          nextValue: null,
        });
        patchLocalCell(address.rowId, address.fieldName, null);
      }
      if (failed.size > 0) {
        toast({
          title: `Cleared ${targets.length - failed.size} of ${targets.length}`,
          description: `${failed.size} row${failed.size === 1 ? "" : "s"} could not be found — they may have been removed by someone else.`,
          variant: "destructive",
        });
      } else if (targets.length > 1) {
        toast({ title: `Cleared ${targets.length} cells` });
      }
    },
    [cellUndo, fields, isReadOnly, patchLocalCell, readCell, tableId],
  );
  const handleClearCell = useCallback(
    (address: CellAddress) => handleClearCells([address]),
    [handleClearCells],
  );

  /** Run one bulk transaction and report it honestly. */
  const runBulkOps = useCallback(
    async (
      ops: BulkOp[],
      describe: string,
      /**
       * Refetch afterwards. TRUE only when the write changed which ROWS exist
       * (insert, delete) — then the page contents, the total and the pagination
       * all genuinely moved. A pure cell batch patches in place instead.
       */
      refetch = true,
    ): Promise<boolean> => {
      if (isReadOnly || ops.length === 0) return false;
      const result = await bulkWrite({ tableId, operations: ops });
      if (isServiceFailure(result)) {
        toast({
          title: "Bulk change failed",
          description: result.error,
          variant: "destructive",
        });
        return false;
      }
      // udt_bulk_write reports per-op failures inside a successful envelope, so
      // a green result is NOT proof every row landed. Say what actually
      // happened rather than claiming the whole batch.
      const failed = result.data.results.filter(isBulkOpError);
      if (failed.length > 0) {
        toast({
          title: `${describe.split(" ")[0]} ${ops.length - failed.length} of ${ops.length}`,
          description: `${failed.length} row${failed.length === 1 ? "" : "s"} could not be found — they may have been removed by someone else.`,
          variant: "destructive",
        });
      } else {
        toast({ title: describe });
      }
      if (refetch) refreshAfterWrite();
      return true;
    },
    [isReadOnly, refreshAfterWrite, tableId],
  );

  /**
   * Set one column across the selection. Each cell is recorded individually on
   * the undo stack so Cmd-Z walks the change back cell by cell rather than
   * offering an all-or-nothing revert the user cannot aim.
   */
  const applyBulkColumn = useCallback(
    async (
      fieldName: string,
      ops: BulkOp[],
      rows: readonly SelectableRow[],
      describe: string,
    ) => {
      const field = fields.find((f) => f.field_name === fieldName);
      const prior = capturePriorValues(rows, fieldName);
      // Cell-only batch — no row appears or disappears, so patch in place.
      const landed = await runBulkOps(ops, describe, false);
      if (!landed) return;
      for (const op of ops) {
        if (op.op !== "cell") continue;
        patchLocalCell(op.row_id, fieldName, op.value);
        cellUndo.record({
          tableId,
          rowId: op.row_id,
          fieldName,
          fieldDisplayName: field?.display_name ?? fieldName,
          priorValue: prior.get(op.row_id) ?? null,
          nextValue: op.value,
        });
      }
    },
    [cellUndo, fields, patchLocalCell, runBulkOps, tableId],
  );

  /**
   * Clipboard text landed on a selected cell (Cmd-V, the Edit menu, or the
   * right-click Paste). One value writes one cell; a spreadsheet block (tabs /
   * line breaks) lands from that cell downward and rightward over the rows on
   * this page, in ONE transaction, every cell recorded on the undo stack.
   *
   * Rows that do not fit below the anchor are never dropped silently: the user
   * is asked whether to append them as new rows or skip them. Columns that
   * fall off the right edge are reported after the write lands.
   */
  const handlePasteText = useCallback(
    async (anchor: CellAddress, text: string, targetCells?: CellAddress[]) => {
      if (isReadOnly) return;
      let block = parseClipboardGrid(text);
      // ONE value pasted over a RANGE fills every cell of the range — Excel's
      // gesture. The single value is tiled into the range's shape so the
      // normal block planner does the landing.
      if (
        targetCells &&
        targetCells.length > 1 &&
        block.length === 1 &&
        block[0].length === 1
      ) {
        const value = block[0][0];
        const rowSet = new Set(targetCells.map((c) => c.rowId));
        const colSet = new Set(targetCells.map((c) => c.fieldName));
        block = Array.from(rowSet, () => Array.from(colSet, () => value));
      }
      const plan = planPaste(anchor, block, rowIdsOnPage, fieldNamesInOrder);
      if (!plan) {
        toast({
          title: "Nothing to paste into",
          description:
            "The selected cell is no longer on this page. Click a cell and paste again.",
          variant: "destructive",
        });
        return;
      }

      const fieldByName = new Map(fields.map((f) => [f.field_name, f]));
      const ops: BulkOp[] = [];
      const priors = new Map<string, unknown>();
      let skippedComputed = 0;
      const rejected: string[] = [];
      for (const cell of plan.cells) {
        const field = fieldByName.get(cell.fieldName);
        if (!field) continue;
        if (isFormulaField(cell.fieldName)) {
          skippedComputed += 1;
          continue;
        }
        const next = coerceForField(field, cell.raw);
        const rules = validationByField.get(cell.fieldName);
        if (rules) {
          const verdict = validateCellValue({
            rules,
            dataType: field.data_type,
            format: resolveFieldFormat(field.data_type, field.metadata),
            value: next,
            existingValues: existingValuesFor(cell.fieldName, cell.rowId),
          });
          if (!verdict.ok) {
            rejected.push(`${field.display_name}: ${verdict.reason}`);
            continue;
          }
        }
        const prior = readCell(cell) ?? null;
        if (storedValuesEqual(next, prior)) continue;
        ops.push({
          op: "cell",
          row_id: cell.rowId,
          field_name: cell.fieldName,
          value: next,
        });
        priors.set(`${cell.rowId}::${cell.fieldName}`, prior);
      }

      let appended = 0;
      if (plan.overflowRows.length > 0) {
        const n = plan.overflowRows.length;
        const rowsWord = n === 1 ? "row" : "rows";
        const colsWord = plan.fieldNames.length === 1 ? "column" : "columns";
        const ok = await confirmDialog({
          title: `Add ${n} new ${rowsWord}?`,
          description: `The pasted block has ${n} more ${rowsWord} than this page has below the selected cell. Adding them creates ${n} new ${rowsWord} filled from the ${plan.fieldNames.length} pasted ${colsWord}; skipping keeps only the rows that fit.`,
          confirmLabel: `Add ${n} ${rowsWord}`,
          cancelLabel: "Skip them",
        });
        if (ok) {
          for (const overflow of plan.overflowRows) {
            const data: Record<string, unknown> = {};
            plan.fieldNames.forEach((fieldName, i) => {
              const field = fieldByName.get(fieldName);
              if (field) data[fieldName] = coerceForField(field, overflow[i] ?? "");
            });
            ops.push({ op: "insert", data });
            appended += 1;
          }
        }
      }

      const cellCount = ops.length - appended;
      if (ops.length === 0) {
        toast({
          title: "Nothing changed",
          description: "The pasted values match what is already there.",
        });
        return;
      }

      const describe =
        `Pasted ${cellCount} cell${cellCount === 1 ? "" : "s"}` +
        (appended > 0
          ? ` and added ${appended} row${appended === 1 ? "" : "s"}`
          : "");
      // Inserting rows changes which rows exist, so that case refetches; a
      // pure cell batch patches in place and stays undoable cell by cell.
      const landed = await runBulkOps(ops, describe, appended > 0);
      if (!landed) return;
      for (const op of ops) {
        if (op.op !== "cell") continue;
        patchLocalCell(op.row_id, op.field_name, op.value);
        cellUndo.record({
          tableId,
          rowId: op.row_id,
          fieldName: op.field_name,
          fieldDisplayName:
            fieldByName.get(op.field_name)?.display_name ?? op.field_name,
          priorValue: priors.get(`${op.row_id}::${op.field_name}`) ?? null,
          nextValue: op.value,
        });
      }
      if (plan.clippedColumns > 0) {
        const c = plan.clippedColumns;
        toast({
          title: `${c} column${c === 1 ? "" : "s"} did not fit`,
          description:
            "The pasted block is wider than the columns to the right of the selected cell. Paste again from a column further left, or add columns first.",
        });
      }
      if (skippedComputed > 0) {
        toast({
          title: `${skippedComputed} formula cell${skippedComputed === 1 ? "" : "s"} skipped`,
          description:
            "A formula column computes its own values, so nothing can be pasted into it.",
        });
      }
      if (rejected.length > 0) {
        toast({
          title: `${rejected.length} value${rejected.length === 1 ? "" : "s"} did not pass the column rules`,
          description: [...new Set(rejected)].slice(0, 3).join(" · "),
          variant: "destructive",
        });
      }
    },
    [
      cellUndo,
      coerceForField,
      fieldNamesInOrder,
      fields,
      isReadOnly,
      patchLocalCell,
      readCell,
      rowIdsOnPage,
      runBulkOps,
      tableId,
    ],
  );

  /**
   * Cmd-D / "Fill down": copy the range's FIRST row into every row below it,
   * column by column, in one transaction, each cell undoable.
   */
  const handleFillDownRange = useCallback(
    async (rows: CellAddress[][]) => {
      if (isReadOnly || rows.length < 2) return;
      const fieldByName = new Map(fields.map((f) => [f.field_name, f]));
      const ops: BulkOp[] = [];
      const priors = new Map<string, unknown>();
      const source = rows[0];
      for (let c = 0; c < source.length; c += 1) {
        if (isFormulaField(source[c].fieldName)) continue;
        const value = readCell(source[c]) ?? null;
        for (let r = 1; r < rows.length; r += 1) {
          const target = rows[r][c];
          const prior = readCell(target) ?? null;
          if (storedValuesEqual(value, prior)) continue;
          ops.push({
            op: "cell",
            row_id: target.rowId,
            field_name: target.fieldName,
            value,
          });
          priors.set(`${target.rowId}::${target.fieldName}`, prior);
        }
      }
      if (ops.length === 0) {
        toast({ title: "Nothing to fill", description: "The rows below already match." });
        return;
      }
      const landed = await runBulkOps(
        ops,
        `Filled ${ops.length} cell${ops.length === 1 ? "" : "s"} down`,
        false,
      );
      if (!landed) return;
      for (const op of ops) {
        if (op.op !== "cell") continue;
        patchLocalCell(op.row_id, op.field_name, op.value);
        cellUndo.record({
          tableId,
          rowId: op.row_id,
          fieldName: op.field_name,
          fieldDisplayName:
            fieldByName.get(op.field_name)?.display_name ?? op.field_name,
          priorValue: priors.get(`${op.row_id}::${op.field_name}`) ?? null,
          nextValue: op.value,
        });
      }
    },
    [cellUndo, fields, isReadOnly, patchLocalCell, readCell, runBulkOps, tableId],
  );

  /** Duplicate ONE row from the right-click menu — the bulk-bar action, for one row. */
  const handleDuplicateRow = useCallback(
    async (rowId: string) => {
      const row = displayRows.find((r) => r.id === rowId);
      if (!row) return;
      await runBulkOps(buildDuplicateOps([row]), "Duplicated 1 row");
    },
    [displayRows, runBulkOps],
  );

  /** Copy ONE row as a spreadsheet-ready TSV line, in the view's column order. */
  const copyRowToClipboard = useCallback(
    (rowId: string) => {
      const row = displayRows.find((r) => r.id === rowId);
      if (!row) return;
      const text = gridToTsv([
        viewFields.map((f) => row.data?.[f.field_name] ?? null),
      ]);
      void navigator.clipboard.writeText(text).then(
        () => toast({ title: "Row copied", description: text.slice(0, 80) }),
        () =>
          toast({
            title: "Could not copy",
            description: "The browser refused clipboard access.",
            variant: "destructive",
          }),
      );
    },
    [displayRows, viewFields],
  );

  const handleBulkSetColumn = useCallback(
    async (fieldName: string, rawValue: string) => {
      const rows = orderSelectedRows(displayRows, selectedRowIds);
      const field = fields.find((f) => f.field_name === fieldName);
      // Coerce exactly the way a hand edit does — a second normalizer is how an
      // agent write and a bulk write end up storing different things.
      const value = normalizeCellValue(rawValue, field?.data_type ?? "string");
      await applyBulkColumn(
        fieldName,
        buildSetColumnOps(
          rows.map((r) => r.id),
          fieldName,
          value,
        ),
        rows,
        `Set ${field?.display_name ?? fieldName} on ${rows.length} row${rows.length === 1 ? "" : "s"}`,
      );
    },
    [applyBulkColumn, displayRows, fields, selectedRowIds],
  );

  const handleFillDown = useCallback(
    async (fieldName: string) => {
      const rows = orderSelectedRows(displayRows, selectedRowIds);
      const field = fields.find((f) => f.field_name === fieldName);
      await applyBulkColumn(
        fieldName,
        buildFillDownOps(rows, fieldName),
        rows,
        `Filled ${field?.display_name ?? fieldName} down ${Math.max(rows.length - 1, 0)} row${rows.length === 2 ? "" : "s"}`,
      );
    },
    [applyBulkColumn, displayRows, fields, selectedRowIds],
  );

  const grid = useGridSelection({
    rowIds: rowIdsOnPage,
    fieldNames: fieldNamesInOrder,
    editable: !isReadOnly,
    // A formula cell is computed — Enter / typing / double-click must not
    // open an editor on it, or the grid would sit in an invisible edit state.
    canEdit: (address) => !isFormulaField(address.fieldName),
    getCellText,
    onCopied: handleCopied,
    onClearCells: (addresses) => void handleClearCells(addresses),
    // A block paste may open a confirm dialog; when it closes the grid must
    // get focus back or the very next Cmd-Z goes nowhere.
    onPasteText: (address, text, targetCells) =>
      void handlePasteText(address, text, targetCells).finally(() =>
        grid.refocusGrid(),
      ),
    onFillDown: (rows) => void handleFillDownRange(rows),
    onUndo: () => void cellUndo.undo(),
    onRedo: () => void cellUndo.redo(),
  });

  // ─── The ONE right-click menu for the grid ──────────────────────────────
  //
  // Single-instance delegation (context-menu-v3): one `NonEditableContextMenu`
  // wraps the scroll container and `resolveContextOnOpen` works out which
  // cell / row / column was clicked from the DOM anchors the grid already
  // renders. A ref keeps `getApplicationScope` (read at click time) truthful;
  // the state is what re-renders the section labels with the clicked cell's
  // column name. Right-clicking a cell SELECTS it, the way every spreadsheet
  // does, so the menu's Cut / Paste / Clear act on the cell under the cursor.
  const menuTargetRef = useRef<GridMenuTarget>(EMPTY_GRID_MENU_TARGET);
  const [menuTarget, setMenuTarget] = useState<GridMenuTarget>(
    EMPTY_GRID_MENU_TARGET,
  );

  const resolveGridMenu = (target: HTMLElement | null) => {
    const next = resolveGridMenuTarget(target);
    menuTargetRef.current = next;
    setMenuTarget(next);
    // Right-clicking a cell selects it — unless it is already inside the
    // extended range, which must survive so the menu can act on the range.
    if (
      next.cell &&
      !grid.isEditing(next.cell.rowId, next.cell.fieldName) &&
      !grid.isInRange(next.cell.rowId, next.cell.fieldName)
    ) {
      grid.select(next.cell);
    }
    // No per-row entity: a dataset row has no entity token of its own, so the
    // menu-level `entity` (the dataset) stands for Attach To / Share.
    return null;
  };

  const getMenuApplicationScope = () => {
    const t = menuTargetRef.current;
    // `content` is what the menu's own Copy verb copies: the clicked cell's
    // text, else the clicked row as TSV. Never the whole grid's DOM text.
    const content = t.cell
      ? getCellText(t.cell)
      : t.rowId
        ? gridToTsv([
            viewFields.map(
              (f) =>
                displayRows.find((r) => r.id === t.rowId)?.data?.[
                  f.field_name
                ] ?? null,
            ),
          ])
        : "";
    return buildApplicationScopeFromMenuContext({
      selectedText: window.getSelection?.()?.toString() ?? "",
      selectionRange: null,
      contextData: {
        ...(getSurfaceScope() as Record<string, unknown>),
        content,
      },
    });
  };

  if (loading && !tableInfo)
    return (
      <div className="space-y-4 p-2">
        {/* Title placeholder */}
        <div className="space-y-2">
          <div className="h-7 w-56 rounded bg-muted/40 animate-pulse" />
          <div className="h-4 w-80 rounded bg-muted/30 animate-pulse" />
        </div>
        {/* Toolbar placeholder — mirrors the dense action row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <div className="h-7 w-20 rounded-md bg-muted/40 animate-pulse" />
            <div className="h-7 w-16 rounded-md bg-muted/40 animate-pulse" />
            <div className="h-7 w-16 rounded-md bg-muted/40 animate-pulse" />
          </div>
          <div className="h-7 w-full max-w-sm rounded-md bg-muted/40 animate-pulse" />
          <div className="flex gap-1">
            <div className="h-7 w-7 rounded-md bg-muted/40 animate-pulse" />
            <div className="h-7 w-7 rounded-md bg-muted/40 animate-pulse" />
            <div className="h-7 w-7 rounded-md bg-muted/40 animate-pulse" />
          </div>
        </div>
        <TableSkeleton rows={5} />
      </div>
    );
  if (error)
    return (
      <div className="py-6 text-center text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <p className="font-medium">Error: {error}</p>
        <p className="text-sm mt-1 text-red-400 dark:text-red-300">
          Please try again or contact support if the issue persists.
        </p>
      </div>
    );
  if (!tableInfo)
    return (
      <div className="py-6 text-center bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
        <p className="font-medium">No table found</p>
        <p className="text-muted-foreground mt-2">
          The requested table could not be found or accessed.
        </p>
      </div>
    );

  const selectedOnPageCount = displayRows.filter((row) =>
    selectedRowIdSet.has(row.id),
  ).length;
  const allRowsOnPageSelected =
    displayRows.length > 0 && selectedOnPageCount === displayRows.length;
  const someRowsOnPageSelected =
    selectedOnPageCount > 0 && !allRowsOnPageSelected;

  const togglePageSelection = () => {
    const next = new Set(selectedRowIds);
    for (const row of displayRows) {
      if (allRowsOnPageSelected) next.delete(row.id);
      else next.add(row.id);
    }
    setSelectedRowIds([...next]);
    lastSelectedRowIndex.current = null;
  };

  const toggleRowSelection = (index: number, checked: boolean) => {
    const next = new Set(selectedRowIds);
    const anchor = lastSelectedRowIndex.current;
    const shift = shiftSelectionRequested.current && anchor !== null;
    const from = shift ? Math.min(anchor, index) : index;
    const to = shift ? Math.max(anchor, index) : index;
    for (let cursor = from; cursor <= to; cursor += 1) {
      const row = displayRows[cursor];
      if (!row) continue;
      if (checked) next.add(row.id);
      else next.delete(row.id);
    }
    setSelectedRowIds([...next]);
    lastSelectedRowIndex.current = index;
    shiftSelectionRequested.current = false;
  };

  // ─── Publish live surface state (synchronous, every render) ───────────────
  //
  // `displayRows` — not `data` — is what the user can actually see once column
  // filters are on, and it is therefore the blast-radius bound `cell_value`
  // validates against: an agent may only write a cell that is on screen.
  //
  // Permission is deliberately null (= "unknown, refuse") until BOTH the table
  // row and the signed-in user have loaded, because `isReadOnly` computes to
  // false in that gap and false means "writable". The same applies while the
  // shared-editor grant is still in flight: a shared editor briefly reads as
  // read-only, which refuses a write it could have allowed. Refusing early is
  // the safe direction; allowing early is not.
  const surfacePermissionKnown = tableInfo !== null && currentUserId !== null;
  // The "current cell" an agent is told about: the one whose full-content
  // editor is open wins (its draft is the live value); otherwise the cell the
  // user has SELECTED on the grid. Before the grid had a persistent selection
  // this was editor-only, and the manifest said so — now a click is enough.
  const surfaceOpenCell =
    showTextModal && expandedRowId && expandedFieldKey
      ? {
          rowId: expandedRowId,
          fieldName: expandedFieldKey,
          value: expandedText ?? "",
        }
      : grid.selected
        ? {
            rowId: grid.selected.rowId,
            fieldName: grid.selected.fieldName,
            value: getCellText(grid.selected),
          }
        : null;

  const surfaceWriteSnapshot: DataTableWriteLiveState = {
    tableId,
    isReadOnly: surfacePermissionKnown ? isReadOnly : null,
    fields,
    visibleRows: displayRows,
  };
  // What an agent is told about each column. The storage type alone misleads a
  // writer — a `percent` column typed `number` holding 45 means 45%, not 0.45 —
  // so the DECLARED FORMAT and, for a choice column, its resolved options ride
  // along. Options come from the same grid-wide resolution the cells render
  // from, so the agent can never be offered a set the user cannot see.
  const surfaceFields: DataTableScopeField[] = fields.map((field) => {
    const declared = resolveFieldFormat(field.data_type, field.metadata);
    const isDefault = declared.id === defaultFormatForBase(field.data_type);
    const resolvedChoices = choiceMap.get(field.field_name)?.choices;
    return {
      validationRules: field.validation_rules,
      field_name: field.field_name,
      display_name: field.display_name,
      data_type: field.data_type,
      field_order: field.field_order,
      is_required: field.is_required,
      ...(isDefault ? {} : { format: declared.id }),
      ...(resolvedChoices && resolvedChoices.length > 0
        ? { choices: resolvedChoices.map((c) => c.value) }
        : {}),
    };
  });

  // "These cells" / "these rows" for an agent: the range (with a header line
  // of machine field names) and the checkbox-ticked rows.
  const selectedRangeTsv =
    grid.range && grid.selectedCells.length > 1
      ? [
          [...new Set(grid.selectedCells.map((c) => c.fieldName))].join("\t"),
          grid.selectionText(),
        ].join("\n")
      : null;
  // Both agent-facing row sets carry computed formula values — the same
  // numbers the user is looking at, never the stored blanks.
  const tickedRows = withComputedColumns(
    (fullDatasetCache ?? data).filter((row) => selectedRowIdSet.has(row.id)),
    fields,
  ).rows;
  const fullDatasetForScope = fullDatasetCache
    ? withComputedColumns(fullDatasetCache, fields).rows
    : null;

  const surfaceScopeSnapshot: DataTableScopeInput = {
    tableId,
    selectedRangeTsv,
    selectedRangeCellCount: selectedRangeTsv ? grid.selectedCells.length : 0,
    selectedRows: tickedRows,
    tableName: tableInfo?.table_name,
    tableDescription: tableInfo?.description,
    isReadOnly: surfacePermissionKnown ? isReadOnly : null,
    fields: surfaceFields,
    visibleRows: displayRows,
    totalCount: effectiveTotalCount,
    searchTerm,
    fullDataset: fullDatasetForScope,
    openCell: surfaceOpenCell,
    openRow:
      showEditModal && selectedRowId
        ? { rowId: selectedRowId, data: selectedRowData }
        : null,
  };

  const menuField = menuTarget.fieldName
    ? (fields.find((f) => f.field_name === menuTarget.fieldName) ?? null)
    : null;
  const menuRow = menuTarget.rowId
    ? (displayRows.find((r) => r.id === menuTarget.rowId) ?? null)
    : null;
  // WHAT WAS RIGHT-CLICKED decides the menu's shape (Arman, 2026-09-17: a
  // header click buried the column's actions under dead Cell and Row groups).
  // The clicked target's section is `primary` — first in the menu, inline,
  // under its own heading — and a group with no target at all is not offered:
  // a header has no cell and no row. A cell shows Cell → Row → Column → Table,
  // most specific first.
  const gridMenuTargetKind: "cell" | "row" | "column" | "table" = menuTarget.cell
    ? "cell"
    : menuTarget.rowId
      ? "row"
      : menuTarget.fieldName
        ? "column"
        : "table";
  const gridCellSection = buildGridCellMenuSection({
      primary: gridMenuTargetKind === "cell",
      cell:
        menuTarget.cell && menuField
          ? {
              address: menuTarget.cell,
              displayName: menuField.display_name,
              highlight:
                tableStyle.cells?.[menuTarget.cell.rowId]?.[
                  menuTarget.cell.fieldName
                ] ?? null,
            }
          : null,
      // The right-clicked cell is inside the extended range → the menu acts
      // on the whole range (cut / clear / fill / highlight every cell).
      rangeCells:
        grid.range &&
        menuTarget.cell &&
        grid.isInRange(menuTarget.cell.rowId, menuTarget.cell.fieldName)
          ? grid.selectedCells
          : null,
      readOnly: isReadOnly,
      readOnlyReason: readOnlyReason,
      on: {
        copy: (address) => grid.copyCell(address),
        cut: (address) => grid.cutCell(address),
        paste: (address) => void grid.pasteIntoCell(address),
        clear: (address) => void handleClearCell(address),
        clearMany: (addresses) => void handleClearCells(addresses),
        edit: (address) => grid.beginEdit(address),
        fillDown: () => {
          if (grid.range)
            void handleFillDownRange(
              rangeRowsOf(grid.range, rowIdsOnPage, fieldNamesInOrder),
            );
        },
        highlight: (address, color) =>
          void writeStylePath(
            stylePath.cell(address.rowId, address.fieldName),
            color,
          ),
        highlightMany: (addresses, color) => {
          for (const address of addresses) {
            void writeStylePath(
              stylePath.cell(address.rowId, address.fieldName),
              color,
            );
          }
        },
      },
    });
  const gridRowSection = buildGridRowMenuSection({
      primary: gridMenuTargetKind === "row",
      row: menuRow
        ? {
            id: menuRow.id,
            label:
              viewFields
                .map((f) => cellClipboardText(menuRow.data?.[f.field_name]).trim())
                .find(Boolean)
                ?.slice(0, 40) ?? "row",
            highlight: tableStyle.rows?.[menuRow.id] ?? null,
          }
        : null,
      readOnly: isReadOnly,
      readOnlyReason: readOnlyReason,
      on: {
        add: () => setShowAddRowModal(true),
        highlight: (rowId, color) =>
          void writeStylePath(stylePath.row(rowId), color),
        edit: (rowId) => {
          const row = displayRows.find((r) => r.id === rowId);
          if (row) handleEditRow(row.id, row.data);
        },
        duplicate: (rowId) => void handleDuplicateRow(rowId),
        copy: copyRowToClipboard,
        history: (rowId) => setHistoryRowId(rowId),
        reference: (rowId) => {
          const row = displayRows.find((r) => r.id === rowId);
          if (!row) return;
          setReferenceRowId(row.id);
          setReferenceRowData(row.data);
          setShowReferenceModal(true);
        },
        remove: (rowId) => handleDeleteRow(rowId),
      },
    });
  const gridColumnSection = buildGridColumnMenuSection({
      primary: gridMenuTargetKind === "column",
      column: menuField
        ? {
            fieldName: menuField.field_name,
            displayName: menuField.display_name,
            sortedBy: sortField === menuField.field_name ? sortDirection : null,
            highlight: tableStyle.columns?.[menuField.field_name] ?? null,
            canColorBy: fieldCanColorBy(menuField),
            isColorBy: tableStyle.colorBy?.field === menuField.field_name,
          }
        : null,
      readOnly: isReadOnly,
      readOnlyReason: readOnlyReason,
      isOnlyColumn: fields.length <= 1,
      on: {
        rename: (fieldName) => startColumnRename(fieldName),
        insert: (fieldName, side) => {
          const field = fields.find((f) => f.field_name === fieldName);
          if (!field) return;
          setPendingColumnInsert({
            order: side === "left" ? field.field_order : field.field_order + 1,
          });
          setShowAddColumnModal(true);
        },
        highlight: (fieldName, color) =>
          void writeStylePath(stylePath.column(fieldName), color),
        colorBy: (fieldName, on) =>
          void writeStylePath(
            stylePath.colorBy(),
            on ? { field: fieldName, target: "row" } : null,
          ),
        colors: () => setShowColorsDialog(true),
        sortAsc: (fieldName) => void handleSort(fieldName, "asc"),
        sortDesc: (fieldName) => void handleSort(fieldName, "desc"),
        clearSort,
        hide: (fieldName) =>
          setHiddenColumns(
            hiddenColumns.includes(fieldName)
              ? hiddenColumns
              : [...hiddenColumns, fieldName],
          ),
        configure: () => setShowTableConfigModal(true),
        remove: (fieldName) => {
          const field = fields.find((f) => f.field_name === fieldName);
          if (field) void handleDeleteColumn(field);
        },
      },
    });
  const gridMenuSections = [
    ...(gridMenuTargetKind === "cell"
      ? [gridCellSection, gridRowSection, gridColumnSection]
      : gridMenuTargetKind === "row"
        ? [gridRowSection]
        : gridMenuTargetKind === "column"
          ? [gridColumnSection]
          : []),
    buildDatasetTableMenuSection({
      label: tableInfo.table_name ? `Table · ${tableInfo.table_name}` : "Table",
      getRow: () => ({ id: tableId, name: tableInfo.table_name ?? null }),
      unavailable: {
        // On the route itself the door leads to where the user already is.
        "dataset-open-workspace":
          emitSurfaceScope && "Already open in the Data Workspace",
      },
    }),
  ];

  const body = (
    // fillHeight: a three-band column (chrome / grid / pagination) where only
    // the grid scrolls, so the table uses every pixel the route gives it and
    // the pagination bar sits on the bottom edge instead of floating in the
    // middle above dead space.
    <div
      ref={(node) => {
        if (!node) return;
        surfaceWriteRef.current = surfaceWriteSnapshot;
        surfaceScopeRef.current = surfaceScopeSnapshot;
      }}
      className={
        fillHeight ? "flex h-full min-h-0 flex-col gap-2 p-2" : "space-y-4 p-2"
      }
    >
      {/* Title band — only for embedded surfaces that have no header of their
          own. Route surfaces show the identity in the shell header instead. */}
      {!hideHeader && (
        <div>
          <h2 className="text-2xl font-bold">{tableInfo.table_name}</h2>
          {tableInfo.description && (
            <p className="text-gray-500 dark:text-gray-400">
              {tableInfo.description}
            </p>
          )}
        </div>
      )}

      {/* Read-only banner for shared tables */}
      {isReadOnly && (
        <div
          data-surface-value="is_read_only"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm"
        >
          <Eye className="h-4 w-4" />
          <span className="font-medium">Shared Table</span>
          <span className="text-purple-500 dark:text-purple-400">
            (read only)
          </span>
        </div>
      )}

      {/* Sort indicator with save option */}
      {sortField && !isReadOnly && (
        <div className="hidden shrink-0 items-center gap-2 text-xs md:flex">
          <span className="text-gray-500 dark:text-gray-400">
            Sorted by{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {fields.find((f) => f.field_name === sortField)?.display_name ||
                sortField}
            </span>
            <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
          </span>
          {isSortSaved ? (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Saved as default
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              onClick={saveDefaultSort}
              disabled={savingSortPreference}
            >
              {savingSortPreference ? "Saving..." : "Save as default"}
            </Button>
          )}
          {savedSortField && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
              onClick={clearDefaultSort}
              disabled={savingSortPreference}
              title="Clear saved sort"
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Toolbar with search */}
      <TableToolbar
        tableId={tableId}
        tableInfo={tableInfo}
        fields={fields}
        loadTableData={(forceReload) =>
          loadTableData(
            currentPage,
            limit,
            sortField,
            sortDirection,
            searchTerm,
            forceReload,
          )
        }
        selectedRowId={selectedRowId}
        selectedRowData={selectedRowData}
        isReadOnly={isReadOnly}
        // Search props
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        handleSearch={handleSearch}
        clearSearch={clearSearch}
        // Modal visibility state
        showEditModal={showEditModal}
        showDeleteModal={showDeleteModal}
        showAddColumnModal={showAddColumnModal}
        showAddRowModal={showAddRowModal}
        showTableConfigModal={showTableConfigModal}
        showReferenceOverlay={showReferenceOverlay}
        showRowOrderingModal={showRowOrderingModal}
        showPasteRowsDialog={showPasteRowsDialog}
        // Modal visibility state setters
        setShowEditModal={setShowEditModal}
        setShowDeleteModal={setShowDeleteModal}
        setShowAddColumnModal={(show) => {
          // Opening from the toolbar appends; only the right-click insert
          // carries a position, and it is consumed once the modal closes.
          if (!show) setPendingColumnInsert(null);
          setShowAddColumnModal(show);
        }}
        setShowAddRowModal={setShowAddRowModal}
        addColumnInsertAtOrder={pendingColumnInsert?.order}
        onColumnAdded={async () => {
          const insert = pendingColumnInsert;
          setPendingColumnInsert(null);
          if (!insert) return;
          // The new column already sits AT `order`; shift the columns that
          // held that slot or a later one so no two share a position.
          const result = await renumberFields({
            tableId,
            updates: fields
              .filter((f) => f.field_order >= insert.order)
              .map((f) => ({ id: f.id, field_order: f.field_order + 1 })),
          });
          if (isServiceFailure(result)) {
            toast({
              title: "Column added at the end instead",
              description: `It could not be moved into place: ${result.error}. Drag it in Table Settings.`,
              variant: "destructive",
            });
          }
        }}
        colorsControl={
          !isReadOnly ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowColorsDialog(true)}
              className="whitespace-nowrap"
              title="Color rows by a column, or add color rules"
            >
              <Paintbrush className="h-3.5 w-3.5 md:mr-1.5" />
              <span className="hidden md:inline">Colors</span>
            </Button>
          ) : undefined
        }
        setShowTableConfigModal={setShowTableConfigModal}
        setShowReferenceOverlay={setShowReferenceOverlay}
        setShowRowOrderingModal={setShowRowOrderingModal}
        setShowPasteRowsDialog={setShowPasteRowsDialog}
        // Success callbacks
        onEditSuccess={() => {
          setShowEditModal(false);
          setSelectedRowId(null);
          setSelectedRowData(null);
          // Clear sorted data cache when data is modified
          setAllSortedData(null);
          loadTableData(currentPage, limit);
        }}
        onDeleteSuccess={() => {
          setShowDeleteModal(false);
          setSelectedRowId(null);
          // Clear sorted data cache when data is modified
          setAllSortedData(null);
          loadTableData(currentPage, limit);
        }}
        // Sort state for export
        sortField={sortField}
        sortDirection={sortDirection}
        // Cell cleanup — single-cell helpers for the row editor, plus the bulk
        // control itself (the toolbar just hosts it; the button owns the flow).
        cleanCellValue={cleanCellValue}
        isCellValueDirty={isCellValueDirty}
        cleanupControl={
          isReadOnly ? null : (
            <CellCleanupButton
              fields={fields.map((f) => ({
                fieldName: f.field_name,
                label: f.display_name,
              }))}
              rows={data}
              loadAllRows={loadAllRowsForCleanup}
              scopeLabel={tableInfo.table_name}
              onApply={applyCleanupPatches}
            />
          )
        }
        // Row ordering functions
        rowOrderingEnabled={rowOrderingEnabled}
        enableRowOrdering={enableRowOrdering}
        disableRowOrdering={disableRowOrdering}
        onRowOrderingSuccess={() => {
          // Clear any active sorting when row ordering is updated
          setSortField(null);
          setSortDirection("asc");
          // Clear sorted data cache when row ordering changes
          setAllSortedData(null);
          loadTableData(currentPage, limit, null, "asc", searchTerm, true);
        }}
        copyControls={(onChooseReference) => (
          <TableCopyControls
            tableId={tableId}
            tableName={tableInfo.table_name}
            fields={fields}
            hiddenColumns={hiddenColumns}
            selectedRowIds={selectedRowIds}
            loadRows={loadRowsForCopy}
            loadAllRows={async () => {
              const complete = await getCompleteTable({ tableId, sortField, sortDirection });
              if (isServiceFailure(complete)) throw new Error(complete.error);
              // Same rule as `loadRowsForCopy`: formula columns are computed
              // before anything downstream (export, sort) reads the rows.
              const rows = withComputedColumns(complete.data.rows, fields).rows;
              return sortField
                ? smartSort(rows, sortField, sortDirection, getFieldDataType(sortField))
                : rows;
            }}
            onChooseReference={onChooseReference}
          />
        )}
        mobileViewControls={
          <div className="space-y-2">
            {sortField && !isReadOnly ? (
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
                <div className="flex min-h-11 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    Sorted by{" "}
                    <span className="font-medium text-foreground">
                      {fields.find((field) => field.field_name === sortField)
                        ?.display_name || sortField}
                    </span>{" "}
                    {sortDirection === "asc" ? "↑" : "↓"}
                  </span>
                  {isSortSaved ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Default
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-11 shrink-0 px-2 text-xs text-primary"
                      onClick={saveDefaultSort}
                      disabled={savingSortPreference}
                    >
                      {savingSortPreference ? "Saving…" : "Make default"}
                    </Button>
                  )}
                </div>
                {savedSortField ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 w-full justify-start px-2 text-xs text-muted-foreground"
                    onClick={clearDefaultSort}
                    disabled={savingSortPreference}
                  >
                    Clear default sort
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="[&_button]:min-h-11">
              <SavedViewBar
                views={savedViews.views}
                loading={savedViews.loading}
                liveDefinition={savedViews.liveDefinition}
                activeViewId={savedViews.activeViewId}
                readOnly={isReadOnly}
                displayNameFor={(fieldName) =>
                  fields.find((field) => field.field_name === fieldName)
                    ?.display_name ?? fieldName
                }
                onApply={savedViews.apply}
                onClearActive={savedViews.clearActive}
                onSaveNew={savedViews.saveNew}
                onUpdate={savedViews.update}
                onRename={savedViews.rename}
                onSetDefault={savedViews.setDefault}
                onDelete={savedViews.remove}
              />
            </div>

            <div className="[&>button]:h-11 [&>button]:w-full [&>button]:justify-start [&>button]:px-2 [&>button]:text-sm">
              <ColumnViewMenu
                fields={fields.map((field) => ({
                  field_name: field.field_name,
                  display_name: field.display_name,
                  field_order: field.field_order,
                }))}
                hidden={hiddenColumns}
                order={columnOrder}
                onHiddenChange={setHiddenColumns}
                onAddColumn={
                  isReadOnly
                    ? undefined
                    : () => {
                        setPendingColumnInsert(null);
                        setShowAddColumnModal(true);
                      }
                }
                onOrderChange={setColumnOrder}
              />
              <TableLayoutMenu
                layoutMode={layoutMode}
                autoResolvesTo={resolveTableLayout("auto", viewFields.length, FIXED_LAYOUT_MAX_COLUMNS)}
                onLayoutModeChange={setLayoutMode}
                rowDensity={rowDensity}
                onRowDensityChange={setRowDensity}
                freezeFirstColumn={freezeFirstColumn}
                onFreezeFirstColumnChange={setFreezeFirstColumn}
                customWidthCount={Object.keys(columnWidths).length}
                onResetColumnWidths={clearColumnWidths}
              />
            </div>

            {isViewCustomized ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full justify-start px-2 text-sm text-muted-foreground"
                onClick={() => {
                  resetView();
                  savedViews.clearActive();
                }}
              >
                Reset search, sort, filters, and columns
              </Button>
            ) : null}
          </div>
        }
        toolbarTrailing={toolbarTrailing}
      />

      {/* A filter that could not read every row must SAY so. Both of these were
          silent before: the cap produced a confident wrong count, and a failed
          load produced an empty grid the user read as "no matches". */}
      {hasColumnFilters && fullDatasetError && (
        <div className="flex shrink-0 items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-destructive">
              This filter couldn&rsquo;t be applied
            </p>
            <p className="text-muted-foreground">
              {fullDatasetError} The rows below are unfiltered — clear the
              filter or try again.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 shrink-0 px-2 text-xs"
            onClick={() => {
              setFullDatasetCache(null);
              setFullDatasetError(null);
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {hasColumnFilters && !fullDatasetError && filterTruncatedAt !== null && (
        <div className="flex shrink-0 items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="min-w-0 text-muted-foreground">
            <span className="font-medium text-amber-700 dark:text-amber-300">
              Filtering the first {filterTruncatedAt.toLocaleString()} rows
              only.
            </span>{" "}
            This table has {totalCount.toLocaleString()}, so the count below is
            not the whole table. Narrow it with the search box first for an
            exact answer.
          </p>
        </div>
      )}

      <div className="hidden md:block">
        <SavedViewBar
          views={savedViews.views}
          loading={savedViews.loading}
          liveDefinition={savedViews.liveDefinition}
          activeViewId={savedViews.activeViewId}
          readOnly={isReadOnly}
          displayNameFor={(fieldName) =>
            fields.find((f) => f.field_name === fieldName)?.display_name ??
            fieldName
          }
          onApply={savedViews.apply}
          onClearActive={savedViews.clearActive}
          onSaveNew={savedViews.saveNew}
          onUpdate={savedViews.update}
          onRename={savedViews.rename}
          onSetDefault={savedViews.setDefault}
          onDelete={savedViews.remove}
        />
      </div>

      {/* Column visibility + order for THIS VIEW. Deliberately next to the
          grid rather than inside Table Settings: Table Settings edits the
          table for everyone, this edits only what you are looking at. */}
      <div className="hidden shrink-0 items-center justify-end gap-1 md:flex">
        <ColumnViewMenu
          fields={fields.map((f) => ({
            field_name: f.field_name,
            display_name: f.display_name,
            field_order: f.field_order,
          }))}
          hidden={hiddenColumns}
          order={columnOrder}
          onHiddenChange={setHiddenColumns}
                onAddColumn={
                  isReadOnly
                    ? undefined
                    : () => {
                        setPendingColumnInsert(null);
                        setShowAddColumnModal(true);
                      }
                }
          onOrderChange={setColumnOrder}
        />
        <TableLayoutMenu
          layoutMode={layoutMode}
          autoResolvesTo={resolveTableLayout("auto", viewFields.length, FIXED_LAYOUT_MAX_COLUMNS)}
          onLayoutModeChange={setLayoutMode}
          rowDensity={rowDensity}
          onRowDensityChange={setRowDensity}
          freezeFirstColumn={freezeFirstColumn}
          onFreezeFirstColumnChange={setFreezeFirstColumn}
          customWidthCount={Object.keys(columnWidths).length}
          onResetColumnWidths={clearColumnWidths}
        />
        {isViewCustomized && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={() => {
              resetView();
              // The bar must stop claiming a view is active — otherwise it
              // highlights a chip whose settings are no longer on screen.
              savedViews.clearActive();
            }}
            title="Clear search, sort, filters and column choices"
          >
            Reset view
          </Button>
        )}
      </div>

      {/* Undo lives beside the grid, not only on Cmd-Z: a shortcut nobody can
          see is not a safety net for a non-technical user. */}
      {!isReadOnly && (cellUndo.canUndo || cellUndo.canRedo) && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={!cellUndo.canUndo || cellUndo.busy}
            onClick={() => void cellUndo.undo()}
            title="Undo last cell change (⌘Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
            {cellUndo.undoDepth > 1 && (
              <span className="tabular-nums text-muted-foreground">
                {cellUndo.undoDepth}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={!cellUndo.canRedo || cellUndo.busy}
            onClick={() => void cellUndo.redo()}
            title="Redo (⇧⌘Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
            Redo
          </Button>
        </div>
      )}

      <BulkRowActions
        selectedRowIds={selectedRowIds}
        displayRows={displayRows}
        fields={fields}
        readOnly={isReadOnly}
        allOnPageSelected={allRowsOnPageSelected}
        onSelectPage={togglePageSelection}
        onClearSelection={() => {
          setSelectedRowIds([]);
          lastSelectedRowIndex.current = null;
        }}
        onRunOps={runBulkOps}
        onSetColumn={handleBulkSetColumn}
        onFillDown={handleFillDown}
      />

      {/* Table colors — color-by a column + rules (table-style.ts). */}
      <ColorRulesDialog
        open={showColorsDialog}
        onOpenChange={setShowColorsDialog}
        fields={fields}
        style={tableStyle}
        choicesByField={Object.fromEntries(
          [...choiceMap.entries()].map(([fieldName, resolved]) => [
            fieldName,
            resolved.choices.map((c) => ({
              value: c.value,
              label: c.label,
              color: c.color,
            })),
          ]),
        )}
        onSetPath={(path, value) => writeStylePath(path, value)}
      />

      {/* Table. In fillHeight mode the grid is the ONLY flexible band and owns
          the scroll (`min-h-0` so flex lets it actually shrink); otherwise it
          keeps the legacy content-sized cap. */}
      <NonEditableContextMenu
        sourceFeature="udt"
        // Only the /data/[id] mount IS the data-tables surface; inside another
        // surface's window the menu resolves the host surface instead.
        surfaceName={emitSurfaceScope ? DATA_TABLES_SURFACE_NAME : undefined}
        menuVersion={1}
        getApplicationScope={getMenuApplicationScope}
        resolveContextOnOpen={resolveGridMenu}
        entity={
          datasetTableEntityRef({
            id: tableId,
            name: tableInfo.table_name ?? null,
          }) ?? undefined
        }
        contentSource={{ type: "raw" }}
        extraSections={gridMenuSections}
      >
      <div
        ref={grid.containerRef}
        data-surface-value={
          selectedRangeTsv ? "selected_range_cell_count" : undefined
        }
        // tabIndex makes the grid a focus target so arrow keys, Tab, Enter,
        // Delete and Cmd-Z actually arrive. `outline-none` because the SELECTED
        // CELL's ring is the real focus indicator — a second ring around the
        // whole grid would be noise, and the cell ring is never absent while
        // the grid has focus and a selection.
        tabIndex={0}
        role="grid"
        onKeyDown={grid.onKeyDown}
        // The Edit-menu / browser-native door for copy, cut and paste on the
        // selected cell (`useGridSelection` — THE CLIPBOARD HAS TWO DOORS).
        {...grid.clipboardHandlers}
        // While a drag is extending the range, the browser must not start a
        // text selection underneath it.
        className={cn(
          fillHeight
            ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm outline-none [&>div]:min-h-0 [&>div]:flex-1 [&>div]:overflow-auto"
            : "border rounded-xl border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm outline-none [&>div]:max-h-[70dvh] [&>div]:overflow-auto",
          grid.dragging && "select-none",
        )}
      >
        <Table
          data-surface-value="visible_data_csv"
          // A fixed layout divides the width evenly, which is right for a
          // handful of columns and unreadable past that — the 26-column
          // example table rendered every cell 40px wide with the text of
          // neighbouring cells overlapping. Past the cap the grid keeps its
          // content-driven widths (150px minimum per header) and scrolls
          // horizontally, exactly as it already does on a phone.
          className={cn(
            // Row height is a per-view choice (Layout menu).
            rowDensity === "compact" && "[&_td]:!py-1 [&_th]:!py-1",
            rowDensity === "tall" && "[&_td]:!py-5",
            // `w-max min-w-full`: natural column widths, but NEVER narrower
            // than the panel. Until 2026-09-20 this was `w-auto min-w-max`,
            // so a table that crossed FIXED_LAYOUT_MAX_COLUMNS (showing a
            // ninth column) snapped from full width to its content width and
            // left the right third of the screen blank — it read as "the page
            // only half loaded" (Arman, Coding Accounts, nine columns).
            "w-max min-w-full table-auto",
            // `effectiveLayout` = the user's Layout choice, else the platform
            // default over FIXED_LAYOUT_MAX_COLUMNS (table-view-url.ts).
            effectiveLayout === "fit" && "md:w-full md:min-w-full md:table-fixed",
          )}
        >
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 top-0 z-30 w-10 bg-gray-100 px-2 dark:bg-gray-800 md:px-3">
                <Checkbox
                  checked={
                    allRowsOnPageSelected
                      ? true
                      : someRowsOnPageSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={togglePageSelection}
                  disabled={displayRows.length === 0}
                  aria-label={
                    allRowsOnPageSelected
                      ? "Clear selection on this page"
                      : "Select all rows on this page"
                  }
                />
              </TableHead>
              {viewFields.map((field) => {
                const isSorted = sortField === field.field_name;
                const columnFilter = columnFilters[field.field_name];
                return (
                  <TableHead
                    key={field.id}
                    {...{ [GRID_FIELD_DOM_ATTR]: field.field_name }}
                    data-surface-value="table_schema"
                    // Clicking the header's own surface (not its sort label
                    // or its menu) selects the whole column — the Excel and
                    // Sheets gesture. Ctrl/Cmd+Space does the same from the
                    // keyboard.
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      grid.selectColumn(field.field_name);
                      grid.refocusGrid();
                    }}
                    title={`Click to select the ${field.display_name} column`}
                    style={columnWidthStyle(field.field_name)}
                    className={cn(
                      "sticky top-0 z-20 max-w-[70vw] border-b border-gray-200 bg-gray-100 py-1.5 font-semibold text-gray-700 transition-colors hover:bg-gray-200/70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700/70 md:max-w-none",
                      // The 150px floor is the platform's; a dragged width
                      // replaces it (that is what dragging narrower means).
                      !columnWidths[field.field_name] && "md:min-w-[150px]",
                      // Frozen first column: sits right of the 2.5rem
                      // checkbox column and above scrolling neighbours.
                      freezeFirstColumn &&
                        field.field_name === firstViewFieldName &&
                        "left-10 z-30 shadow-[inset_-1px_0_0_theme(colors.gray.200)] dark:shadow-[inset_-1px_0_0_theme(colors.gray.700)]",
                    )}
                  >
                    {/* Drag handle on the right edge; double-click resets. */}
                    {!isMobile && (
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize the ${field.display_name} column`}
                        title="Drag to resize · double-click to reset"
                        onMouseDown={(e) => beginColumnResize(e, field.field_name)}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setColumnWidth(field.field_name, null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize select-none hover:bg-primary/40 active:bg-primary/60"
                      />
                    )}
                    <div
                      data-surface-value="column_list"
                      className="flex items-center justify-between gap-1"
                    >
                      {renamingField === field.field_name ? (
                        <input
                          autoFocus
                          aria-label={`Rename the ${field.display_name} column`}
                          value={renameDraft}
                          disabled={renameSaving}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            // The grid owns arrow keys / typing; none of it
                            // may fire while a name is being typed.
                            e.stopPropagation();
                            if (e.key === "Enter") void commitColumnRename();
                            if (e.key === "Escape") cancelColumnRename();
                          }}
                          onBlur={(e) => {
                            // A closing menu / popover hands focus back to its
                            // trigger a moment AFTER this input mounts. That
                            // is not the user leaving the field — take focus
                            // back instead of ending the rename they just
                            // asked for (live-found 2026-09-17).
                            if (Date.now() - renameOpenedAtRef.current < 700) {
                              const input = e.currentTarget;
                              window.setTimeout(() => input.focus(), 0);
                              return;
                            }
                            void commitColumnRename();
                          }}
                          className="min-w-0 flex-1 rounded border border-primary bg-background px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none ring-2 ring-primary/30"
                        />
                      ) : (
                      <button
                        type="button"
                        data-surface-value={
                          surfaceOpenCell?.fieldName === field.field_name
                            ? "current_column_name"
                            : undefined
                        }
                        onClick={() => handleSort(field.field_name)}
                        className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5"
                        title={`Sort by ${field.display_name}`}
                      >
                        <span className="truncate">{field.display_name}</span>
                        {isSorted && (
                          <span className="flex-shrink-0">
                            {sortDirection === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </button>
                      )}
                      <ColumnHeaderMenu
                        // A formula column has no stored value, so the server
                        // facet RPC would return nothing for it. Omitting the
                        // table identity makes the menu work from the rows the
                        // browser holds (with computed values) and say when
                        // that is not every row — its own honest fallback.
                        tableId={isFormulaField(field.field_name) ? undefined : tableId}
                        fieldName={field.field_name}
                        displayName={field.display_name}
                        dataType={field.data_type}
                        isSorted={isSorted}
                        sortDirection={sortDirection}
                        filter={columnFilter}
                        searchTerm={searchTerm}
                        // Rows the browser already holds. The full cache when
                        // filtering has loaded it, otherwise the current page —
                        // which IS the whole table for the many tables that fit
                        // on one page. The menu asks the server only when these
                        // do not cover `totalCount`.
                        localRows={
                          isFormulaField(field.field_name)
                            ? withComputedColumns(fullDatasetCache ?? data, fields).rows
                            : (fullDatasetCache ?? data)
                        }
                        totalCount={totalCount}
                        onSortAsc={() => handleSort(field.field_name, "asc")}
                        onSortDesc={() => handleSort(field.field_name, "desc")}
                        onClearSort={clearSort}
                        onFilterChange={(value) =>
                          handleColumnFilterChange(field.field_name, value)
                        }
                        onRename={
                          isReadOnly
                            ? undefined
                            : () => startColumnRename(field.field_name)
                        }
                        // The same three doors the right-click Column section
                        // has — a column is managed from its own header too.
                        onInsert={
                          isReadOnly
                            ? undefined
                            : (side) => {
                                setPendingColumnInsert({
                                  order:
                                    side === "left"
                                      ? field.field_order
                                      : field.field_order + 1,
                                });
                                setShowAddColumnModal(true);
                              }
                        }
                        onHide={
                          viewFields.length <= 1
                            ? undefined
                            : () =>
                                setHiddenColumns(
                                  hiddenColumns.includes(field.field_name)
                                    ? hiddenColumns
                                    : [...hiddenColumns, field.field_name],
                                )
                        }
                        onConfigure={
                          isReadOnly
                            ? undefined
                            : () => setShowTableConfigModal(true)
                        }
                        onDelete={
                          isReadOnly || fields.length <= 1
                            ? undefined
                            : () => void handleDeleteColumn(field)
                        }
                      />
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="sticky top-0 z-20 bg-gray-100 dark:bg-gray-800 w-[140px] text-gray-700 dark:text-gray-300 text-center py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-center gap-1.5">
                  {/* Where every spreadsheet puts it: a "+" at the end of the
                      header row adds a column at the end. */}
                  {!isReadOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Add a column at the end"
                      aria-label="Add a column at the end"
                      onClick={() => {
                        setPendingColumnInsert(null);
                        setShowAddColumnModal(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <span>Actions</span>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showLoadingRow ? (
              // Table-shaped skeleton rows that match the real column layout —
              // header is already rendered above, so we fill the body with
              // pulsing placeholders instead of a single collapsed spinner line.
              Array.from({ length: 5 }).map((_, r) => (
                <TableRow
                  key={`skeleton-${r}`}
                  className={r % 2 === 1 ? "bg-muted/10" : ""}
                >
                  <TableCell className="py-3" />
                  {viewFields.map((field, c) => (
                    <TableCell
                      key={`skeleton-${r}-${field.id}`}
                      className="py-3"
                    >
                      <div
                        className="h-3.5 rounded bg-muted/40 animate-pulse"
                        style={{
                          width: `${[88, 62, 75, 50, 80][(r + c) % 5]}%`,
                        }}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="py-3">
                    <div className="flex justify-center gap-1.5">
                      <div className="h-5 w-5 rounded bg-muted/40 animate-pulse" />
                      <div className="h-5 w-5 rounded bg-muted/40 animate-pulse" />
                      <div className="h-5 w-5 rounded bg-muted/40 animate-pulse" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : displayRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={viewFields.length + 2}
                  className="text-center py-8"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span>
                      {hasColumnFilters
                        ? "No rows match the current filters"
                        : "This table has no rows yet"}
                    </span>
                    {!isReadOnly && !hasColumnFilters && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddRowModal(true)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add the first row
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              displayRows.map((row, index) => (
                <TableRow
                  key={row.id}
                  {...{ [GRID_ROW_DOM_ATTR]: row.id }}
                  data-surface-value={
                    surfaceOpenCell?.rowId === row.id ||
                    (showEditModal && selectedRowId === row.id)
                      ? "current_row_json"
                      : undefined
                  }
                  // Zebra → color tint (table-style.ts) → selection. `cn`
                  // (tailwind-merge) keeps the LAST background, so a tinted
                  // row shows its tint and a selected row still reads selected.
                  className={cn(
                    index % 2 === 0
                      ? "bg-white dark:bg-gray-950"
                      : "bg-gray-50 dark:bg-gray-900",
                    selectedRowIdSet.has(row.id) && "bg-primary/5",
                    // The tint is LAST so a colored row stays colored while
                    // selected — the checkbox already says it is selected.
                    rowTintClass(row),
                    !rowTintClass(row) &&
                      "hover:bg-gray-100 dark:hover:bg-gray-800",
                    "transition-colors",
                  )}
                >
                  <TableCell
                    data-surface-value={
                      surfaceOpenCell?.rowId === row.id ||
                      (showEditModal && selectedRowId === row.id)
                        ? "current_row_id"
                        : undefined
                    }
                    className="sticky left-0 z-10 w-10 bg-inherit px-2 md:px-3"
                    // The checkbox ticks the row for bulk actions; the cell
                    // AROUND it selects the row's cells as a range (Shift+
                    // Space from the keyboard) — the Sheets row-number gesture.
                    onClick={(event) => {
                      event.stopPropagation();
                      if ((event.target as HTMLElement).closest("button")) return;
                      grid.selectRow(row.id);
                      grid.refocusGrid();
                    }}
                    title="Click beside the checkbox to select this row's cells"
                  >
                    <Checkbox
                      checked={selectedRowIdSet.has(row.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        shiftSelectionRequested.current = event.shiftKey;
                      }}
                      onCheckedChange={(checked) =>
                        toggleRowSelection(index, checked === true)
                      }
                      aria-label={`Select row ${index + 1}`}
                    />
                  </TableCell>
                  {viewFields.map((field) => {
                    const rawValue = row.data[field.field_name];
                    const cellData =
                      rawValue !== null
                        ? formatCellValue(rawValue, field.data_type)
                        : null;
                    // A column with a declared display format renders through
                    // the shared format layer (currency, percent, link, chips,
                    // amber mismatch fallback). Columns with no format take the
                    // original path unchanged, so nothing that worked before
                    // can shift.
                    const declaredFormat = resolveFieldFormat(
                      field.data_type,
                      field.metadata,
                    );
                    // A choice column's options may live in a shared pick list
                    // (loaded once for the whole grid), and a DEPENDENT column's
                    // options narrow to the group this row's controlling cell
                    // names. Both fold back into the format so the pure
                    // registry renderer needs to know about neither.
                    const rowChoices = choicesForRow(
                      choiceMap.get(field.field_name),
                      row.data,
                    );
                    const fieldFormat = withResolvedChoices(
                      declaredFormat,
                      rowChoices.choices,
                    );
                    const hasCustomFormat =
                      fieldFormat.id !== defaultFormatForBase(field.data_type);
                    const formulaError = formulaErrors.get(
                      `${row.id}::${field.field_name}`,
                    );
                    const display = formulaError ? (
                      <span
                        className="text-amber-700 dark:text-amber-300"
                        title={formulaError}
                      >
                        #ERROR
                      </span>
                    ) : hasCustomFormat || validationByField.has(field.field_name) ? (
                      <FormattedFieldValue
                        value={rawValue}
                        format={fieldFormat}
                        dataType={field.data_type}
                        validationRules={validationByField.get(field.field_name) ?? null}
                        className="truncate text-left"
                      />
                    ) : cellData ? (
                      <div className="flex items-center justify-between group min-w-0">
                        <div className="flex-1 min-w-0">
                          <div
                            className="truncate text-left"
                            title={
                              cellData.isTruncated
                                ? cellData.fullText
                                : undefined
                            }
                          >
                            {renderCellMarkdown &&
                            typeof rawValue === "string" ? (
                              <InlineMarkdownWithLinks
                                text={String(cellData.display)}
                              />
                            ) : (
                              String(cellData.display)
                            )}
                          </div>
                          {cellData.multilineIndicator && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {cellData.multilineIndicator}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    );
                    return (
                      <TableCell
                        style={columnWidthStyle(field.field_name)}
                        key={`${row.id}-${field.id}`}
                        data-cell={cellDomKey({
                          rowId: row.id,
                          fieldName: field.field_name,
                        })}
                        data-surface-value={
                          grid.isSelected(row.id, field.field_name)
                            ? "current_cell_value"
                            : grid.isInRange(row.id, field.field_name)
                              ? "selected_range_tsv"
                              : undefined
                        }
                        // THE SELECTION RING OUTLINES THE WHOLE CELL. An inset
                        // ring on the <td> follows the cell's real edges; drawn
                        // on the inner content div it boxed the text and left
                        // the padding outside, which looked like a glitch
                        // rather than a selection. `ring-inset` matters — an
                        // outset ring is clipped by the neighbouring cells.
                        // 🚨 THE WHOLE CELL IS THE TARGET. Click and
                        // double-click live on the <td>, not on the content
                        // inside it, because the content is smaller than the
                        // cell — often much smaller, and for an EMPTY cell
                        // there is barely anything to hit at all. Handling
                        // clicks on the inner element meant only the middle of
                        // a cell responded, and an empty cell could not be
                        // edited whatsoever.
                        // THE CELL CARRIES THE STATE, so the editor inside it
                        // needs no chrome of its own. Selected is a soft ring;
                        // EDITING is a heavier solid ring plus a stronger tint.
                        //
                        // That distinction is load-bearing. Stripping the
                        // input's border (so it stops looking like a component
                        // nested inside a component) also removed the only
                        // signal that an editor was open at all — a cell with
                        // unsaved text became indistinguishable from a saved
                        // one, which is how you lose an edit without knowing.
                        // 🚨 THE SELECTION WASH IS AN OVERLAY, NOT A
                        // BACKGROUND. `cn` is tailwind-merge: a selection fill
                        // written as `bg-primary/10` and a manual highlight
                        // written as `bg-red-100` are the same utility group,
                        // so the LAST one wins and the other is deleted from
                        // the class list entirely. The tint is applied last —
                        // so every highlighted cell inside a selected block
                        // silently lost its selection shading, and a block
                        // drawn across coloured cells appeared to have holes in
                        // it while Cmd-C happily copied the cells that looked
                        // excluded (found on live review 2026-09-15). Painting
                        // the wash on the `after:` pseudo-element puts it in a
                        // different utility group, so the two genuinely survive
                        // together the way the comment below always claimed.
                        className={cn(
                          // `overflow-hidden`: past FIXED_LAYOUT_MAX_COLUMNS the
                          // table is `table-auto`, where `max-w-0` caps the
                          // column's width but NOT the content's paint — a long
                          // email was drawn straight across the phone number
                          // beside it (clientWidth 150, scrollWidth 192; found
                          // on independent review 2026-09-15). Clipping at the
                          // cell is what lets the inner `truncate` end in an
                          // ellipsis, the way Sheets and Airtable clip. The
                          // selection ring is inset and the wash is `inset-0`,
                          // so neither is cut.
                          "group relative max-w-[70vw] overflow-hidden py-2 md:max-w-0 md:py-3",
                          freezeFirstColumn &&
                            field.field_name === firstViewFieldName &&
                            "sticky left-10 z-10 bg-inherit shadow-[inset_-1px_0_0_theme(colors.gray.200)] dark:shadow-[inset_-1px_0_0_theme(colors.gray.700)]",
                          "after:pointer-events-none after:absolute after:inset-0 after:content-['']",
                          // A computed cell keeps the default cursor: the
                          // text-cursor is a promise that you can type here,
                          // and on a formula column that promise is false.
                          !isReadOnly &&
                            (isFormulaField(field.field_name)
                              ? "cursor-default"
                              : "cursor-cell"),
                          grid.isSelected(row.id, field.field_name) &&
                            !grid.isEditing(row.id, field.field_name) &&
                            "ring-2 ring-inset ring-primary/70 after:bg-primary/5",
                          grid.isEditing(row.id, field.field_name) &&
                            "ring-[3px] ring-inset ring-primary after:bg-primary/10",
                          // A cell inside the extended range — softer than the
                          // anchor's ring, so the anchor stays findable.
                          grid.isInRange(row.id, field.field_name) &&
                            !grid.isSelected(row.id, field.field_name) &&
                            "after:bg-primary/10",
                          // Tint LAST: the ring says "selected", the tint says
                          // "highlighted", and both must survive together.
                          cellTintClass(row, field.field_name),
                        )}
                        // Press starts a drag-select (or, with Shift, extends
                        // the range to here); sweeping over cells while the
                        // button is down grows it; release anywhere ends it.
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          const address = { rowId: row.id, fieldName: field.field_name };
                          if (e.shiftKey) grid.extendTo(address);
                          else if (!grid.isEditing(row.id, field.field_name))
                            grid.beginDrag(address);
                        }}
                        onPointerEnter={() =>
                          grid.dragOver({ rowId: row.id, fieldName: field.field_name })
                        }
                        onClick={(e) => {
                          // A shift-click already extended the range on press;
                          // a plain click after a drag must not collapse it.
                          if (e.shiftKey || grid.range) {
                            grid.refocusGrid();
                            return;
                          }
                          grid.select({
                            rowId: row.id,
                            fieldName: field.field_name,
                          });
                          // Hand focus back to the grid, or the very next arrow
                          // key goes nowhere and the grid reads as broken.
                          grid.refocusGrid();
                        }}
                        onDoubleClick={() => {
                          // Direct-click editors (checkbox, rating, choice)
                          // handle their own interaction and stop propagation;
                          // a double-click that reaches here is on a plain
                          // cell and means "edit me".
                          // 🚨 A COMPUTED CELL SAYS NO OUT LOUD. Refusing in
                          // silence is the same defect as a dead control: the
                          // cell carries the normal text-cursor, opens nothing,
                          // and leaves the person to conclude the grid is
                          // broken rather than that the column is calculated
                          // (found on live review 2026-09-15). The sentence is
                          // the one the row forms already use for these
                          // columns, so the explanation reads the same
                          // wherever you meet it.
                          if (isFormulaField(field.field_name)) {
                            toast({
                              title: `${field.display_name} is calculated`,
                              description:
                                "Calculated from the other columns in this row — it updates on its own. Change its formula in Table settings.",
                            });
                            return;
                          }
                          // A double-click that opens nothing and says nothing
                          // reads as a broken grid. Say why the editor did not
                          // open — for an example table the notice names it as
                          // one. (Found on independent review 2026-09-15: this
                          // was a silent return.)
                          if (isReadOnly) {
                            showReadOnlyToast();
                            return;
                          }
                          grid.beginEdit({
                            rowId: row.id,
                            fieldName: field.field_name,
                          });
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex-1 min-w-0">
                            <EditableCell
                              tableId={tableId}
                              rowId={row.id}
                              fieldName={field.field_name}
                              fieldDisplayName={field.display_name}
                              dataType={field.data_type as FieldDataType}
                              format={fieldFormat}
                              row={row.data}
                              value={rawValue}
                              display={display}
                              validationRules={validationByField.get(field.field_name) ?? null}
                              existingValues={existingValuesFor(field.field_name, row.id)}
                              editable={!isReadOnly && !isFormulaField(field.field_name)}
                              selected={grid.isSelected(
                                row.id,
                                field.field_name,
                              )}
                              editing={grid.isEditing(row.id, field.field_name)}
                              seed={grid.editSeed}
                              onSelect={() => {
                                grid.select({
                                  rowId: row.id,
                                  fieldName: field.field_name,
                                });
                                // Clicking a cell must hand focus back to the
                                // grid, or the very next arrow key goes
                                // nowhere and the grid reads as broken.
                                grid.refocusGrid();
                              }}
                              onBeginEdit={() =>
                                grid.beginEdit({
                                  rowId: row.id,
                                  fieldName: field.field_name,
                                })
                              }
                              onEndEdit={(move) => grid.endEdit(move)}
                              onRecordEdit={(priorValue, nextValue) =>
                                cellUndo.record({
                                  tableId,
                                  rowId: row.id,
                                  fieldName: field.field_name,
                                  fieldDisplayName: field.display_name,
                                  priorValue,
                                  nextValue,
                                })
                              }
                              // Patch, never refetch — a full reload remounts
                              // the body and throws away the user's place.
                              onSaved={(newValue, serverUpdatedAt) =>
                                patchLocalCell(
                                  row.id,
                                  field.field_name,
                                  newValue,
                                  serverUpdatedAt,
                                )
                              }
                            />
                          </div>
                          {cellData && (
                            <div className="matrx-touch-targets flex items-center space-x-1 ml-2 flex-shrink-0">
                              {cellData.hasCleanableHtml && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="opacity-100 transition-opacity h-6 w-6 p-0 sm:[@media(hover:hover)]:opacity-0 sm:[@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                                  onClick={(e) =>
                                    handleCleanupText(
                                      field.field_name,
                                      cellData.fullText,
                                      row.id,
                                      e,
                                    )
                                  }
                                  title={`Clean up HTML formatting in ${field.display_name}`}
                                >
                                  <Zap className="h-3 w-3 text-purple-500 dark:text-purple-400" />
                                </Button>
                              )}
                              {cellData.isTruncated && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="opacity-100 transition-opacity h-6 w-6 p-0 sm:[@media(hover:hover)]:opacity-0 sm:[@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                                  onClick={(e) =>
                                    handleExpandText(
                                      cellData.fullText,
                                      field.display_name,
                                      row.id,
                                      field.field_name,
                                      e,
                                    )
                                  }
                                  title={`Expand ${field.display_name}`}
                                >
                                  <Expand className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center">
                    <div className="flex justify-center space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShowReference(row.id, row.data, e);
                        }}
                        title="Get Reference"
                      >
                        <Link className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                      </Button>
                      {isReadOnly ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            showReadOnlyToast();
                          }}
                          title="View only - no edit access"
                          className="cursor-not-allowed"
                        >
                          <Eye className="h-4 w-4 text-purple-400 dark:text-purple-500" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditRow(row.id, row.data);
                          }}
                          title="Edit Row"
                        >
                          <Pencil className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </Button>
                      )}
                      {/* History is a READ — viewers of shared tables get it
                          too (RLS scopes what they see); restore actions
                          inside the panel stay gated by `editable`. */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryRowId(row.id);
                        }}
                        title="View row history"
                      >
                        <History className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      </Button>
                      {!isReadOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRow(row.id);
                          }}
                          title="Delete Row"
                        >
                          <Trash className="h-4 w-4 text-red-500 dark:text-red-400" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
            {/* Where every spreadsheet puts it: the line under the last row
                adds a row. Absent on read-only tables and while loading. */}
            {!isReadOnly && !loading && displayRows.length > 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={viewFields.length + 2} className="p-0">
                  <button
                    type="button"
                    onClick={() => setShowAddRowModal(true)}
                    className="flex h-9 w-full items-center gap-1.5 px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add row
                  </button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </NonEditableContextMenu>

      {/* Pagination — pinned band in fillHeight mode, normal flow otherwise. */}
      {!loading && displayRows.length > 0 && (
        <div
          className={
            fillHeight
              ? "flex shrink-0 items-center justify-between gap-1 md:gap-3"
              : "mt-4 flex items-center justify-between gap-1 md:gap-3"
          }
        >
          <div className="flex min-w-0 items-center gap-1 text-sm text-gray-600 dark:text-gray-400 md:gap-2">
            <Select value={String(limit)} onValueChange={handleLimitChange}>
              <SelectTrigger className="h-10 w-16 md:h-8 md:w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                <SelectItem
                  value="5"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  5
                </SelectItem>
                <SelectItem
                  value="10"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  10
                </SelectItem>
                <SelectItem
                  value="20"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  20
                </SelectItem>
                <SelectItem
                  value="50"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  50
                </SelectItem>
                <SelectItem
                  value="100"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  100
                </SelectItem>
              </SelectContent>
            </Select>
            <span
              data-surface-value="row_count"
              className="whitespace-nowrap md:ml-4"
            >
              of {effectiveTotalCount} rows
              {hasColumnFilters && " (filtered)"}
            </span>
          </div>

          {/* w-auto: the shared Pagination defaults to w-full, which would push
              the rows-per-page control onto its own line. */}
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                {isMobile ? (
                  <PaginationLink
                    aria-label="Go to previous page"
                    onClick={() =>
                      handlePageChange(Math.max(1, currentPage - 1))
                    }
                    className={`h-10 w-10 ${
                      currentPage === 1
                        ? "pointer-events-none opacity-50"
                        : ""
                    }`}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </PaginationLink>
                ) : (
                  <PaginationPrevious
                    onClick={() =>
                      handlePageChange(Math.max(1, currentPage - 1))
                    }
                    className={`h-8 ${
                      currentPage === 1
                        ? "pointer-events-none opacity-50"
                        : ""
                    }`}
                  />
                )}
              </PaginationItem>

              {(isMobile
                ? [currentPage]
                : [...Array(Math.min(5, effectiveTotalPages))].map((_, i) =>
                    currentPage <= 3 ? i + 1 : currentPage + i - 2,
                  )
              ).map((pageNum) =>
                pageNum <= effectiveTotalPages ? (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => handlePageChange(pageNum)}
                      isActive={currentPage === pageNum}
                      className="h-10 w-10 md:h-8 md:w-8"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                ) : null,
              )}

              <PaginationItem>
                {isMobile ? (
                  <PaginationLink
                    aria-label="Go to next page"
                    onClick={() =>
                      handlePageChange(
                        Math.min(effectiveTotalPages, currentPage + 1),
                      )
                    }
                    className={`h-10 w-10 ${
                      currentPage === effectiveTotalPages
                        ? "pointer-events-none opacity-50"
                        : ""
                    }`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </PaginationLink>
                ) : (
                  <PaginationNext
                    onClick={() =>
                      handlePageChange(
                        Math.min(effectiveTotalPages, currentPage + 1),
                      )
                    }
                    className={`h-8 ${
                      currentPage === effectiveTotalPages
                        ? "pointer-events-none opacity-50"
                        : ""
                    }`}
                  />
                )}
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Text Expansion Modal */}
      <Dialog
        open={showTextModal}
        onOpenChange={(open) => {
          if (!open && expandedTextModified) {
            // Could add a confirmation dialog here if needed
          }
          setShowTextModal(open);
        }}
      >
        <DialogContent className="sm:max-w-[60vw] max-h-[80dvh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {expandedFieldName
                  ? `${expandedFieldName} - Full Content`
                  : "Full Content"}
                {expandedTextModified && (
                  <span className="text-orange-500 ml-2">*</span>
                )}
              </DialogTitle>
              {expandedText && isCellValueDirty(expandedText) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCleanupExpandedText}
                  className="flex items-center gap-2"
                  title="Clean up HTML formatting"
                  disabled={savingExpandedText}
                >
                  <Zap className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                  <span className="text-sm">Clean HTML</span>
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="max-h-[50dvh] overflow-y-auto">
            <Textarea
              value={expandedText || ""}
              onChange={(e) => handleExpandedTextChange(e.target.value)}
              className="min-h-[300px] resize-none font-mono text-sm"
              placeholder="No content"
              disabled={savingExpandedText}
            />
          </div>
          <DialogFooter className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {expandedTextModified
                ? "You have unsaved changes"
                : "Click to edit the content above"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowTextModal(false)}
                disabled={savingExpandedText}
              >
                Cancel
              </Button>
              {expandedTextModified && (
                <Button
                  onClick={handleSaveExpandedText}
                  disabled={savingExpandedText}
                >
                  {savingExpandedText ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reference Modal */}
      <TableReferenceModal
        isOpen={showReferenceModal}
        onClose={() => setShowReferenceModal(false)}
        tableId={tableId}
        tableInfo={tableInfo}
        rowId={referenceRowId}
        rowData={referenceRowData}
        fields={fields}
      />

      {/* Row version history (P1 audit log surface) */}
      <MatrxDynamicPanelHost
        open={historyRowId !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryRowId(null);
        }}
        title="Row history"
        description="Every change to this row, newest first."
        position="right"
        defaultSize={32}
        contentClassName="overflow-y-auto"
      >
        <VersionHistoryViewer
          rowId={historyRowId}
          tableId={tableId}
          editable={!isReadOnly}
          fieldLabels={Object.fromEntries(
            fields.map((f) => [f.field_name, f.display_name]),
          )}
          onRowChanged={() => {
            setAllSortedData(null);
            loadTableData(
              currentPage,
              limit,
              sortField,
              sortDirection,
              searchTerm,
            );
          }}
          onRowReplaced={(newRowId) => setHistoryRowId(newRowId)}
        />
      </MatrxDynamicPanelHost>
    </div>
  );

  // Only the `/data/[id]` route opts in (see `emitSurfaceScope`). The loading
  // and "no table found" early returns above deliberately mount no provider:
  // there is genuinely nothing to emit yet, and a surface that promises values
  // it does not have is the read lie this wiring exists to remove.
  if (!emitSurfaceScope) return body;

  return (
    <SurfaceRuntimeProvider
      surfaceName={DATA_TABLES_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={!isReadOnly}
      getWriteHandlers={() => surfaceWriteHandlers}
    >
      {body}
    </SurfaceRuntimeProvider>
  );
};

export default UserTableViewer;
