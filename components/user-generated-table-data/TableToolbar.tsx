"use client";

import AddColumnModal from "./AddColumnModal";
import AddRowModal from "./AddRowModal";
import EditRowModal from "./EditRowModal";
import DeleteRowModal from "./DeleteRowModal";
import TableConfigModal from "./TableConfigModal";
import ExportTableModal from "./ExportTableModal";
import TableReferenceOverlay from "./TableReferenceOverlay";
import RowOrderingModal from "./RowOrderingModal";
import PasteRowsDialog from "./PasteRowsDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  X,
  Download,
  Pencil,
  Trash,
  Settings,
  Plus,
  Link,
  Zap,
  ArrowUpDown,
  GripVertical,
  Eye,
  Clipboard,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

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
  showTableSettingsModal: boolean;
  showReferenceOverlay: boolean;
  showRowOrderingModal: boolean;
  showPasteRowsDialog: boolean;

  // Modal visibility state setters
  setShowEditModal: (show: boolean) => void;
  setShowDeleteModal: (show: boolean) => void;
  setShowAddColumnModal: (show: boolean) => void;
  setShowAddRowModal: (show: boolean) => void;
  setShowExportModal: (show: boolean) => void;
  setShowTableSettingsModal: (show: boolean) => void;
  setShowReferenceOverlay: (show: boolean) => void;
  setShowRowOrderingModal: (show: boolean) => void;
  setShowPasteRowsDialog: (show: boolean) => void;

  // Success callbacks
  onEditSuccess?: () => void;
  onDeleteSuccess?: () => void;

  // HTML cleanup functions
  cleanupHtmlText?: (text: string) => string;
  containsCleanableHtml?: (text: string) => boolean;
  hasCleanableHtmlInTable?: boolean;
  handleBulkHtmlCleanup?: () => Promise<void>;

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
  showTableSettingsModal,
  showReferenceOverlay,
  showRowOrderingModal,
  showPasteRowsDialog,

  // Modal visibility state setters
  setShowEditModal,
  setShowDeleteModal,
  setShowAddColumnModal,
  setShowAddRowModal,
  setShowExportModal,
  setShowTableSettingsModal,
  setShowReferenceOverlay,
  setShowRowOrderingModal,
  setShowPasteRowsDialog,

  // Success callbacks
  onEditSuccess = () => loadTableData(),
  onDeleteSuccess = () => loadTableData(),

  // HTML cleanup functions
  cleanupHtmlText,
  containsCleanableHtml,
  hasCleanableHtmlInTable,
  handleBulkHtmlCleanup,

  // Sort state for export
  sortField,
  sortDirection = "asc",

  // Row ordering functions
  rowOrderingEnabled,
  enableRowOrdering,
  disableRowOrdering,
  onRowOrderingSuccess,
  toolbarTrailing,
}: TableToolbarProps) {
  // Show toast when trying to use edit features in read-only mode
  const showReadOnlyToast = () => {
    toast({
      title: "View Only",
      description:
        "You don't have edit access to this shared table. You would need to duplicate it first to make changes.",
      variant: "default",
    });
  };
  return (
    <>
      {/* Toolbar UI — dense, single-row on desktop */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
        <div className="flex items-center w-full md:w-auto gap-1">
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

        <div className="flex-1 w-full md:max-w-sm">
          <form onSubmit={handleSearch} className="flex gap-1">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search table..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-7 pl-7 pr-7 text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              type="submit"
              className="h-7 w-7 p-0"
              title="Search"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>

        <div className="flex items-center w-full md:w-auto justify-end gap-1">
          {/* Row Ordering Controls - only show if not read-only */}
          {!isReadOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!rowOrderingEnabled && enableRowOrdering) {
                  // Auto-enable ordering and open modal
                  enableRowOrdering().then(() => {
                    setShowRowOrderingModal(true);
                  });
                } else {
                  // Just open modal if already enabled
                  setShowRowOrderingModal(true);
                }
              }}
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

          {/* Clean HTML - only show if not read-only */}
          {!isReadOnly && hasCleanableHtmlInTable && handleBulkHtmlCleanup && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkHtmlCleanup}
              className="whitespace-nowrap text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
              title="Clean HTML formatting in all string fields"
            >
              <Zap className="h-3.5 w-3.5 md:mr-1.5" />
              <span className="hidden md:inline">Clean HTML</span>
            </Button>
          )}

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
              onClick={() => setShowTableSettingsModal(true)}
              className="h-7 w-7 p-0"
              title="Table settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}

          {toolbarTrailing}
        </div>
      </div>

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
            cleanupHtmlText={cleanupHtmlText}
            containsCleanableHtml={containsCleanableHtml}
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
            isOpen={showTableSettingsModal}
            onClose={() => setShowTableSettingsModal(false)}
            onSuccess={() => loadTableData(true)}
          />
          <RowOrderingModal
            isOpen={showRowOrderingModal}
            onClose={() => setShowRowOrderingModal(false)}
            tableId={tableId}
            tableInfo={tableInfo}
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
