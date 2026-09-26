"use client";

import { effectiveRowLabel, rowLabelText } from "@/features/data-tables/row-label";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import AddColumnModal from "./AddColumnModal";
import AddRowModal from "./AddRowModal";
import EditRowModal from "./EditRowModal";
import DeleteRowModal from "./DeleteRowModal";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { isRecordStoreTable } from "@/features/data-tables/service";
import TableConfigModal from "./TableConfigModal";
import TableReferenceOverlay from "./TableReferenceOverlay";
import RowOrderingModal from "./RowOrderingModal";
import PasteRowsDialog from "./PasteRowsDialog";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetBody,
} from "@ai-matrx/design-system";
import {
  Link,
  Search,
  X,
  Pencil,
  Trash,
  Settings,
  Plus,
  ArrowUpDown,
  GripVertical,
  Eye,
  Clipboard,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import type { FieldChoice } from "@ai-matrx/design-system/field-formats";

/** A single full-width, 44px-tall row inside the mobile actions drawer. */
function MobileActionRow({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "default" | "purple" | "green" | "destructive";
}) {
  const toneClass =
    tone === "purple"
      ? "text-purple-600 dark:text-purple-400"
      : tone === "green"
        ? "text-green-600 dark:text-green-400"
        : tone === "destructive"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-2 min-h-[44px] text-sm active:bg-muted/50 transition-colors"
    >
      <Icon className={`h-4 w-4 flex-shrink-0 ${toneClass}`} />
      <span className={toneClass}>{label}</span>
    </button>
  );
}

interface TableToolbarProps {
  tableId: string;
  tableInfo: any;
  fields: any[];
  loadTableData: (forceReload?: boolean) => void;
  selectedRowId: string | null;
  selectedRowData: Record<string, any> | null;
  isReadOnly?: boolean;

  // Search props
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  clearSearch: () => void;

  // Modal visibility state
  showEditModal: boolean;
  showDeleteModal: boolean;
  showAddColumnModal: boolean;
  showAddRowModal: boolean;
  showTableConfigModal: boolean;
  /** Which tab Table settings opens on. */
  configTab?: "fields" | "table" | "actions";
  showReferenceOverlay: boolean;
  showRowOrderingModal: boolean;
  showPasteRowsDialog: boolean;

  // Modal visibility state setters
  setShowEditModal: (show: boolean) => void;
  setShowDeleteModal: (show: boolean) => void;
  setShowAddColumnModal: (show: boolean) => void;
  setShowAddRowModal: (show: boolean) => void;
  /**
   * THE WORDS EVERY `relation` CELL READS, keyed by machine field name.
   * Resolved ONCE for the whole table by `UserTableViewer` through the ONE
   * resolver and handed straight to both row modals, so the row form and the
   * grid cell offer the same names and resolve the same ids.
   */
  relationChoices?: ReadonlyMap<string, FieldChoice[]>;
  /** One loaded row for the row-label example in Table settings. */
  sampleRow?: { data: Record<string, unknown> } | null;
  /** The rows on screen, for the Actions tab of Table settings. */
  rows?: readonly { id: string; data: Record<string, unknown> }[];
  setShowTableConfigModal: (show: boolean) => void;
  setShowReferenceOverlay: (show: boolean) => void;
  setShowRowOrderingModal: (show: boolean) => void;
  setShowPasteRowsDialog: (show: boolean) => void;

  // Success callbacks
  onEditSuccess?: () => void;
  onDeleteSuccess?: () => void;

  // Cell cleanup. `cleanCellValue` / `isCellValueDirty` are the single-value
  // helpers the row editor uses; `cleanupControl` is the bulk control itself,
  // rendered here but owned by the caller (see CellCleanupButton).
  cleanCellValue?: (text: string) => string;
  isCellValueDirty?: (text: string) => boolean;
  cleanupControl?: React.ReactNode;
  /** The table-colors control (color-by / rules). Rendered beside cleanup. */
  colorsControl?: React.ReactNode;
  /** Right-click "Insert column left/right": the `field_order` the new column takes. */
  addColumnInsertAtOrder?: number;
  /** Runs after a column is created and BEFORE the table reloads (renumbering). */
  onColumnAdded?: () => Promise<void> | void;

  // Sort state for export
  sortField?: string | null;
  sortDirection?: "asc" | "desc";

  // Row ordering functions
  rowOrderingEnabled?: boolean;
  disableRowOrdering?: () => Promise<void>;
  onRowOrderingSuccess?: () => void;

  /** Optional trailing controls in the toolbar row (e.g. chat artifact revert). */
  toolbarTrailing?: React.ReactNode;
  /**
   * THIS VIEW's controls — saved views, undo/redo, columns, layout, reset —
   * rendered in the toolbar row between the search and the table actions
   * (Arman, 2026-09-22: they had their own full-width row above the grid).
   * Desktop only; the mobile drawer carries `mobileViewControls`.
   */
  viewControls?: React.ReactNode;
  /** Shared direct Copy / Copy for AI controls for the current table view. */
  copyControls?: (onChooseReference: () => void) => React.ReactNode;
  /** Mobile-only view controls (sort, saved views, columns) hosted in the same drawer. */
  mobileViewControls?: React.ReactNode;
  /**
   * The page around the grid owns Share and export (the /data-v2 table page's chrome, for
   * every layout — ruling 2026-09-23). The grid's own Share button and Copy / transform /
   * export control are then absent: the same actions, in one place.
   */
  pageOwnsShareAndExport?: boolean;
  /**
   * Drawn in the table page's one toolbar row (lane TABLE-PAGE-CHROME): no bottom margin, the
   * row's width, never a line of its own.
   */
  inPageRow?: boolean;
  /** The sort's state as one compact control, first in the row (records-ui SortStateControl). */
  sortState?: ReactNode;
}

export default function TableToolbar({
  tableId,
  tableInfo,
  fields,
  loadTableData,
  selectedRowId,
  selectedRowData,
  isReadOnly = false,

  // Search props
  searchTerm,
  setSearchTerm,
  handleSearch,
  clearSearch,

  // Modal visibility state
  showEditModal,
  showDeleteModal,
  showAddColumnModal,
  showAddRowModal,
  showTableConfigModal,
  configTab,
  showReferenceOverlay,
  showRowOrderingModal,
  showPasteRowsDialog,

  // Modal visibility state setters
  setShowEditModal,
  setShowDeleteModal,
  setShowAddColumnModal,
  setShowAddRowModal,
  relationChoices,
  sampleRow,
  rows,
  setShowTableConfigModal,
  setShowReferenceOverlay,
  setShowRowOrderingModal,
  setShowPasteRowsDialog,

  // Success callbacks
  onEditSuccess = () => loadTableData(),
  onDeleteSuccess = () => loadTableData(),

  // Cell cleanup
  cleanCellValue,
  isCellValueDirty,
  cleanupControl,
  colorsControl,
  addColumnInsertAtOrder,
  onColumnAdded,

  // Sort state for export
  sortField,
  sortDirection = "asc",

  // Row ordering functions
  rowOrderingEnabled,
  disableRowOrdering,
  onRowOrderingSuccess,
  toolbarTrailing,
  viewControls,
  copyControls,
  mobileViewControls,
  pageOwnsShareAndExport = false,
  inPageRow = false,
  sortState,
}: TableToolbarProps) {
  const isMobile = useIsMobile();
  /** An older table always keeps a hand order; a record-store one only once G13's doors answer. */
  const handOrderAvailable =
    !isRecordStoreTable(tableId) || tableInfo?.metadata?.record_store?.hand_order === "served";
  // Show toast when trying to use edit features in read-only mode
  const showReadOnlyToast = () => {
    toast({
      title: "View Only",
      description:
        "You don't have edit access to this shared table. You would need to duplicate it first to make changes.",
      variant: "default",
    });
  };

  const [showMobileActions, setShowMobileActions] = useState(false);
  const chooseReference = () => {
    setShowMobileActions(false);
    setShowReferenceOverlay(true);
  };

  // ORDER-FIX: pressing Reorder writes NOTHING. It used to "enable" ordering first — which, on a
  // record-store table, declared a saved view and wrote an order before the person had moved a
  // row (VERIFIER-19 finding 2). The order is written once, when the person presses Save Order.
  const handleReorderClick = () => {
    setShowRowOrderingModal(true);
  };

  return (
    <>
      {/* Toolbar UI — dense, single-row on desktop. Below md, the Column/Row/
          Paste + reorder/clean/reference/export/settings clusters collapse
          into one drawer trigger so the row never overflows the viewport. */}
      <div
        data-surface-value="is_read_only"
        // ONE ROW, ALWAYS. Below md the clusters collapse into the drawer; from
        // md up the row is nowrap and scrolls sideways when a laptop or tablet
        // runs out of width, so nothing ever wraps into a second line or
        // pushes the grid down (Arman, 2026-09-22).
        className={cn(
          "mb-0 flex flex-col justify-between gap-0 md:flex-row md:flex-nowrap md:items-center md:gap-2 md:overflow-x-auto md:overflow-y-hidden md:[scrollbar-width:thin]",
          inPageRow ? "min-w-0 flex-1" : "md:mb-2",
        )}
        data-sheet-toolbar={inPageRow ? "in-page-row" : "own-row"}
      >
        <div className="hidden md:flex shrink-0 items-center w-full md:w-auto gap-1">
          {sortState}
          {isReadOnly ? (
            // Read-only mode: show disabled-style buttons with view icon
            <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-purple-600 dark:text-purple-400">
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden md:inline">View Only</span>
            </div>
          ) : (
            // Edit mode: show normal action buttons
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddColumnModal(true)}
                className="whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Column</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setShowAddRowModal(true)}
                className="whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Row</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPasteRowsDialog(true)}
                className="whitespace-nowrap"
              >
                <Clipboard className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Paste</span>
              </Button>
            </>
          )}
        </div>

        <div className="flex w-full items-center gap-1.5 md:min-w-[14rem] md:flex-1 md:max-w-sm md:gap-2">
          <form onSubmit={handleSearch} className="flex flex-1 gap-1">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search table..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-surface-value="search_term"
                className="h-11 w-full pl-8 pr-10 text-base md:h-7 md:pl-7 md:pr-7 md:text-sm"
                style={{ fontSize: "16px" }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground md:right-1 md:h-7 md:w-7"
                  aria-label="Clear table search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              type="submit"
              className="hidden h-7 w-7 flex-shrink-0 p-0 md:inline-flex"
              title="Search"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          </form>

          {/* Mobile-only: one tap target opens the full action drawer,
              replacing the Column/Row/Paste + icon clusters below md. */}
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 flex-shrink-0 md:hidden"
            onClick={() => setShowMobileActions(true)}
            aria-label="Table actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {viewControls && (
          <div className="hidden md:flex shrink-0 items-center gap-1 border-l border-border/60 pl-2">
            {viewControls}
          </div>
        )}

        <div className="hidden md:flex shrink-0 items-center w-full md:w-auto justify-end gap-1 md:ml-auto">
          {/* Row Ordering Controls - only show if not read-only. On a record-store
              table they are drawn only when the store keeps a hand-set order (G13,
              `metadata.record_store.hand_order === "served"`); before its doors are
              on the database a button that could not save its order would be dead. */}
          {!isReadOnly && handOrderAvailable && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReorderClick}
              className="whitespace-nowrap text-green-600 dark:text-green-400 border-green-300 dark:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
              title={
                !rowOrderingEnabled
                  ? "Put the rows in an order by hand. Nothing changes until you save."
                  : "Change the order set by hand"
              }
            >
              <GripVertical className="h-3.5 w-3.5 md:mr-1.5" />
              <span className="hidden md:inline">Reorder</span>
            </Button>
          )}

          {/* Bulk cell cleanup — the caller's <CellCleanupButton>. */}
          {cleanupControl}
          {colorsControl}

          {!isMobile && !pageOwnsShareAndExport ? copyControls?.(chooseReference) : null}
          {!isMobile ? <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Get reference" title="Get reference" onClick={chooseReference}><Link className="h-4 w-4" /></Button> : null}

          {!pageOwnsShareAndExport && (
          <ShareButton
            // A record-store table is shared as the record it is (data seam).
            resourceType={isRecordStoreTable(tableId) ? "record" : "dataset"}
            {...(isRecordStoreTable(tableId) && tableInfo?.organization_id
              ? { organizationId: tableInfo.organization_id as string }
              : {})}
            resourceId={tableId}
            resourceName={tableInfo.table_name}
            showStatus={false}
            size="sm"
            className="h-7"
          />
          )}

          {/* Settings - only show if not read-only */}
          {!isReadOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTableConfigModal(true)}
              className="h-7 w-7 p-0"
              title="Table settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}

          {toolbarTrailing}
        </div>
      </div>

      {/* Mobile actions drawer — every control from the desktop clusters
          above, as full-width 44px rows in one bottom sheet. */}
      <BottomSheet
        open={showMobileActions}
        onOpenChange={setShowMobileActions}
        title="Table controls"
        contentClassName="bg-card"
      >
        <BottomSheetHeader title="Table controls" />
        <BottomSheetBody className="px-3 pb-4 space-y-0.5">
          {mobileViewControls ? (
            <div className="mb-2 border-b border-border pb-2">
              {mobileViewControls}
            </div>
          ) : null}
          {!pageOwnsShareAndExport && (
          <ShareButton
            // A record-store table is shared as the record it is (data seam).
            resourceType={isRecordStoreTable(tableId) ? "record" : "dataset"}
            {...(isRecordStoreTable(tableId) && tableInfo?.organization_id
              ? { organizationId: tableInfo.organization_id as string }
              : {})}
            resourceId={tableId}
            resourceName={tableInfo.table_name}
            showStatus={false}
            size="sm"
            className="h-11 w-full justify-start"
          />
          )}

          {isReadOnly && (
            <div className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-purple-600 dark:text-purple-400">
              <Eye className="h-4 w-4" />
              View Only
            </div>
          )}
          {!isReadOnly && (
            <>
              <MobileActionRow
                icon={Plus}
                label="Add Column"
                onClick={() => {
                  setShowMobileActions(false);
                  setShowAddColumnModal(true);
                }}
              />
              <MobileActionRow
                icon={Plus}
                label="Add Row"
                onClick={() => {
                  setShowMobileActions(false);
                  setShowAddRowModal(true);
                }}
              />
              <MobileActionRow
                icon={Clipboard}
                label="Paste Rows"
                onClick={() => {
                  setShowMobileActions(false);
                  setShowPasteRowsDialog(true);
                }}
              />
              {handOrderAvailable && (
              <MobileActionRow
                icon={GripVertical}
                label="Reorder Rows"
                tone="green"
                onClick={() => {
                  setShowMobileActions(false);
                  handleReorderClick();
                }}
              />
              )}
              {cleanupControl && (
                <div className="px-2 py-1">{cleanupControl}</div>
              )}
              {colorsControl && (
                <div className="px-2 py-1">{colorsControl}</div>
              )}
            </>
          )}
          {isMobile ? <MobileActionRow icon={Link} label="Get reference" onClick={chooseReference} /> : null}
          {isMobile && copyControls && !pageOwnsShareAndExport ? (
            <div className="border-t border-border px-2 py-2 [&_button]:min-h-11">
              {copyControls(chooseReference)}
            </div>
          ) : null}
          {!isReadOnly && (
            <MobileActionRow
              icon={Settings}
              label="Table Settings"
              onClick={() => {
                setShowMobileActions(false);
                setShowTableConfigModal(true);
              }}
            />
          )}
          {toolbarTrailing && (
            <div className="pt-2 border-t border-border mt-1">
              {toolbarTrailing}
            </div>
          )}
        </BottomSheetBody>
      </BottomSheet>

      {/* Modals - Edit modals only rendered when not read-only */}
      {!isReadOnly && (
        <>
          <AddColumnModal
            tableId={tableId}
            organizationId={(tableInfo as { organization_id?: string | null } | null)?.organization_id ?? null}
            isOpen={showAddColumnModal}
            onClose={() => setShowAddColumnModal(false)}
            insertAtOrder={addColumnInsertAtOrder}
            siblingFields={(fields as { field_name: string; display_name: string }[]).map(
              (f) => ({ field_name: f.field_name, display_name: f.display_name }),
            )}
            onSuccess={() => {
              void Promise.resolve(onColumnAdded?.()).finally(() =>
                loadTableData(true),
              );
            }}
          />
          <AddRowModal
            tableId={tableId}
            relationChoices={relationChoices}
            isOpen={showAddRowModal}
            onClose={() => setShowAddRowModal(false)}
            onSuccess={() => loadTableData()}
          />
          <PasteRowsDialog
            tableId={tableId}
            fields={fields}
            isOpen={showPasteRowsDialog}
            onClose={() => setShowPasteRowsDialog(false)}
            onSuccess={() => loadTableData()}
          />
          <EditRowModal
            tableId={tableId}
            rowId={selectedRowId}
            rowData={selectedRowData}
            fields={fields}
            relationChoices={relationChoices}
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            onSuccess={onEditSuccess}
            cleanCellValue={cleanCellValue}
            isCellValueDirty={isCellValueDirty}
          />
          <DeleteRowModal
            tableId={tableId}
            rowId={selectedRowId}
            rowLabel={
              selectedRowData
                ? rowLabelText(
                    { data: selectedRowData },
                    fields,
                    effectiveRowLabel((tableInfo as { metadata?: unknown } | null)?.metadata, fields),
                  ).text || undefined
                : undefined
            }
            isOpen={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onSuccess={onDeleteSuccess}
          />
          <TableConfigModal
            tableId={tableId}
            tableInfo={tableInfo}
            fields={fields}
            isOpen={showTableConfigModal}
            onClose={() => setShowTableConfigModal(false)}
            onSuccess={() => loadTableData(true)}
            onAddColumn={() => setShowAddColumnModal(true)}
            sampleRow={sampleRow ?? null}
            rows={rows}
            defaultTab={configTab}
          />
          <RowOrderingModal
            isOpen={showRowOrderingModal}
            onClose={() => setShowRowOrderingModal(false)}
            tableId={tableId}
            tableInfo={tableInfo}
            fields={fields}
            onSuccess={onRowOrderingSuccess || (() => loadTableData(true))}
            startSort={sortField ? { field: sortField, direction: sortDirection ?? "asc" } : null}
          />
        </>
      )}

      {/* Read-only modals - Export and Reference are always available */}
      <TableReferenceOverlay
        isOpen={showReferenceOverlay}
        onClose={() => setShowReferenceOverlay(false)}
        tableId={tableId}
        tableInfo={tableInfo}
        fields={fields}
      />
    </>
  );
}
