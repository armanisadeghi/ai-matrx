"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import AddColumnModal from "./AddColumnModal";
import AddRowModal from "./AddRowModal";
import EditRowModal from "./EditRowModal";
import DeleteRowModal from "./DeleteRowModal";
import TableConfigModal from "./TableConfigModal";
import ExportTableModal from "./ExportTableModal";
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
  Search,
  X,
  Download,
  Pencil,
  Trash,
  Settings,
  Plus,
  Link,
  ArrowUpDown,
  GripVertical,
  Eye,
  Clipboard,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

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
  showExportModal: boolean;
  showTableConfigModal: boolean;
  showReferenceOverlay: boolean;
  showRowOrderingModal: boolean;
  showPasteRowsDialog: boolean;

  // Modal visibility state setters
  setShowEditModal: (show: boolean) => void;
  setShowDeleteModal: (show: boolean) => void;
  setShowAddColumnModal: (show: boolean) => void;
  setShowAddRowModal: (show: boolean) => void;
  setShowExportModal: (show: boolean) => void;
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

  // Sort state for export
  sortField?: string | null;
  sortDirection?: "asc" | "desc";

  // Row ordering functions
  rowOrderingEnabled?: boolean;
  enableRowOrdering?: () => Promise<void>;
  disableRowOrdering?: () => Promise<void>;
  onRowOrderingSuccess?: () => void;

  /** Optional trailing controls in the toolbar row (e.g. chat artifact revert). */
  toolbarTrailing?: React.ReactNode;
  /** Shared direct Copy / Copy for AI controls for the current table view. */
  copyControls?: React.ReactNode;
  /** Mobile-only view controls (sort, saved views, columns) hosted in the same drawer. */
  mobileViewControls?: React.ReactNode;
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
  showExportModal,
  showTableConfigModal,
  showReferenceOverlay,
  showRowOrderingModal,
  showPasteRowsDialog,

  // Modal visibility state setters
  setShowEditModal,
  setShowDeleteModal,
  setShowAddColumnModal,
  setShowAddRowModal,
  setShowExportModal,
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

  // Sort state for export
  sortField,
  sortDirection = "asc",

  // Row ordering functions
  rowOrderingEnabled,
  enableRowOrdering,
  disableRowOrdering,
  onRowOrderingSuccess,
  toolbarTrailing,
  copyControls,
  mobileViewControls,
}: TableToolbarProps) {
  const isMobile = useIsMobile();
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

  const handleReorderClick = () => {
    if (!rowOrderingEnabled && enableRowOrdering) {
      // Auto-enable ordering and open modal
      enableRowOrdering().then(() => {
        setShowRowOrderingModal(true);
      });
    } else {
      // Just open modal if already enabled
      setShowRowOrderingModal(true);
    }
  };

  return (
    <>
      {/* Toolbar UI — dense, single-row on desktop. Below md, the Column/Row/
          Paste + reorder/clean/reference/export/settings clusters collapse
          into one drawer trigger so the row never overflows the viewport. */}
      <div className="mb-0 flex flex-col justify-between gap-0 md:mb-2 md:flex-row md:items-center md:gap-2">
        <div className="hidden md:flex items-center w-full md:w-auto gap-1">
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

        <div className="flex w-full items-center gap-1.5 md:flex-1 md:max-w-sm md:gap-2">
          <form onSubmit={handleSearch} className="flex flex-1 gap-1">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search table..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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

        <div className="hidden md:flex items-center w-full md:w-auto justify-end gap-1">
          {/* Row Ordering Controls - only show if not read-only */}
          {!isReadOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReorderClick}
              className="whitespace-nowrap text-green-600 dark:text-green-400 border-green-300 dark:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
              title={
                !rowOrderingEnabled
                  ? "Enable row ordering and open reorder modal"
                  : "Open row reordering modal"
              }
            >
              <GripVertical className="h-3.5 w-3.5 md:mr-1.5" />
              <span className="hidden md:inline">Reorder</span>
            </Button>
          )}

          {/* Bulk cell cleanup — the caller's <CellCleanupButton>. */}
          {cleanupControl}

          {!isMobile ? copyControls : null}

          {/* Reference - always available (read-only action) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReferenceOverlay(true)}
            className="h-7 w-7 p-0"
            title="Create Table Reference"
          >
            <Link className="h-3.5 w-3.5" />
          </Button>

          {/* Export - always available (read-only action) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExportModal(true)}
            className="h-7 w-7 p-0"
            title="Export table"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>

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
              <MobileActionRow
                icon={GripVertical}
                label={
                  rowOrderingEnabled ? "Reorder Rows" : "Enable & Reorder Rows"
                }
                tone="green"
                onClick={() => {
                  setShowMobileActions(false);
                  handleReorderClick();
                }}
              />
              {cleanupControl && (
                <div className="px-2 py-1">{cleanupControl}</div>
              )}
            </>
          )}
          <MobileActionRow
            icon={Link}
            label="Create Table Reference"
            onClick={() => {
              setShowMobileActions(false);
              setShowReferenceOverlay(true);
            }}
          />
          {isMobile && copyControls ? (
            <div className="border-t border-border px-2 py-2 [&_button]:min-h-11">
              {copyControls}
            </div>
          ) : null}
          <MobileActionRow
            icon={Download}
            label="Export Table"
            onClick={() => {
              setShowMobileActions(false);
              setShowExportModal(true);
            }}
          />
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
            isOpen={showAddColumnModal}
            onClose={() => setShowAddColumnModal(false)}
            onSuccess={() => loadTableData(true)}
          />
          <AddRowModal
            tableId={tableId}
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
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            onSuccess={onEditSuccess}
            cleanCellValue={cleanCellValue}
            isCellValueDirty={isCellValueDirty}
          />
          <DeleteRowModal
            rowId={selectedRowId}
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
          />
          <RowOrderingModal
            isOpen={showRowOrderingModal}
            onClose={() => setShowRowOrderingModal(false)}
            tableId={tableId}
            tableInfo={tableInfo}
            fields={fields}
            onSuccess={onRowOrderingSuccess || (() => loadTableData(true))}
          />
        </>
      )}

      {/* Read-only modals - Export and Reference are always available */}
      <ExportTableModal
        tableId={tableId}
        tableName={tableInfo?.table_name || "table"}
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        sortField={sortField}
        sortDirection={sortDirection}
        searchTerm={searchTerm}
      />
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
