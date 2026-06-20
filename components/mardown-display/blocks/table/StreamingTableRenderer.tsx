"use client";
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { InlineMarkdownWithLinks } from "@/components/mardown-display/blocks/links/InlineMarkdownWithLinks";
import { Button } from "@/components/ui/button";
import {
  Download,
  Copy,
  Eye,
  Edit,
  Save,
  X,
  FileJson,
  FileText,
  FileSpreadsheet,
  FileDown,
  ChevronDown,
  Database,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToastManager } from "@/hooks/useToastManager";
import { THEMES } from "../../themes";
import SaveTableModal from "../../tables/SaveTableModal";
import { SendToWorkbookButton } from "../../tables/SendToWorkbookButton";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { TableEditToolbar } from "../../tables/editing/TableEditToolbar";
import { RowActionsMenu } from "../../tables/editing/RowActionsMenu";
import { ColumnActionsMenu } from "../../tables/editing/ColumnActionsMenu";
import { useTableUndo } from "../../tables/editing/useTableUndo";
import { useDoubleClickEdit } from "../../tables/editing/useDoubleClickEdit";
import {
  appendRow,
  appendColumn,
  clearAllContents,
  insertRowAbove,
  insertRowBelow,
  removeRow,
  clearRow,
  duplicateRow,
  insertColumnBefore,
  insertColumnAfter,
  removeColumn,
  clearColumn,
  duplicateColumn,
  type TableShape,
} from "../../tables/editing/tableMutations";
import { parseMarkdownTable, type ParsedTable } from "./parseMarkdownTable";

// ============================================================================
// TYPES
// ============================================================================

interface SavedTableInfo {
  table_id: string;
  table_name: string;
  row_count: string;
  field_count: string;
}

interface StreamingTableRendererProps {
  content: string;
  metadata?: {
    isComplete?: boolean;
    completeRowCount?: number;
    totalRows?: number;
    hasPartialContent?: boolean;
  };
  isStreamActive?: boolean;
  className?: string;
  fontSize?: number;
  theme?: string;
  onSave?: (tableData: { headers: string[]; rows: string[][] }) => void;
  onContentChange?: (updatedMarkdown: string) => void;
}

// ============================================================================
// EXPORT DROPDOWN COMPONENT
// ============================================================================

interface ExportDropdownMenuProps {
  tableData: ParsedTable;
  content: string;
  copyTableToClipboard: () => void;
  copyMarkdownToClipboard: () => void;
  copyJsonToClipboard: () => void;
  downloadCSV: () => void;
  downloadMarkdown: () => void;
  isStreamActive?: boolean;
}

const ExportDropdownMenu: React.FC<ExportDropdownMenuProps> = ({
  tableData,
  content,
  copyTableToClipboard,
  copyMarkdownToClipboard,
  copyJsonToClipboard,
  downloadCSV,
  downloadMarkdown,
  isStreamActive = false,
}) => {
  const [isDataStable, setIsDataStable] = useState(false);
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize the tableData to prevent unnecessary re-renders
  const stableTableData = useMemo(
    () => ({
      headers: tableData.headers,
      rows: tableData.rows,
      normalizedData: tableData.normalizedData,
    }),
    [
      JSON.stringify(tableData.headers),
      JSON.stringify(tableData.rows),
      JSON.stringify(tableData.normalizedData),
    ],
  );

  useEffect(() => {
    // Don't process stability during streaming
    if (isStreamActive) {
      setIsDataStable(false);
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
        stabilityTimerRef.current = null;
      }
      return;
    }

    // Clear any existing timer
    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current);
    }

    // Hide menu immediately when data changes
    setIsDataStable(false);

    // Set a timeout to show menu after 1 second of stability
    stabilityTimerRef.current = setTimeout(() => {
      setIsDataStable(true);
    }, 1000);

    return () => {
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
      }
    };
  }, [stableTableData, content, isStreamActive]);

  // Don't render anything during streaming or if data is not stable
  if (isStreamActive || !isDataStable) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-800/30"
        >
          <Download className="h-4 w-4" />
          Export
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={copyTableToClipboard}
          className="flex items-center gap-2 cursor-pointer"
        >
          <FileText className="h-4 w-4 text-green-500" />
          <span>Copy as Text</span>
        </DropdownMenuItem>
        {content && (
          <DropdownMenuItem
            onClick={copyMarkdownToClipboard}
            className="flex items-center gap-2 cursor-pointer"
          >
            <FileDown className="h-4 w-4 text-purple-500" />
            <span>Copy as Markdown</span>
          </DropdownMenuItem>
        )}
        {tableData.normalizedData && (
          <DropdownMenuItem
            onClick={copyJsonToClipboard}
            className="flex items-center gap-2 cursor-pointer"
          >
            <FileJson className="h-4 w-4 text-blue-500" />
            <span>Copy as JSON</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={downloadCSV}
          className="flex items-center gap-2 cursor-pointer"
        >
          <FileSpreadsheet className="h-4 w-4 text-orange-500" />
          <span>Download as CSV</span>
        </DropdownMenuItem>
        {content && (
          <DropdownMenuItem
            onClick={downloadMarkdown}
            className="flex items-center gap-2 cursor-pointer"
          >
            <FileDown className="h-4 w-4 text-indigo-500" />
            <span>Download as Markdown</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const StreamingTableRenderer: React.FC<StreamingTableRendererProps> = ({
  content,
  metadata,
  isStreamActive = false,
  className,
  fontSize = 14,
  theme = "professional",
  onSave = () => {},
  onContentChange,
}) => {
  const toast = useToastManager();
  const isMobile = useIsMobile();
  const tableTheme = THEMES[theme]?.table || THEMES.professional.table;

  // State Management
  const dispatch = useAppDispatch();
  const [editMode, setEditMode] = useState<"none" | "header" | number>("none");
  const [showNormalized, setShowNormalized] = useState(false);
  const [savedTableInfo, setSavedTableInfo] = useState<SavedTableInfo | null>(
    null,
  );
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Parse the table content once — shared parser (also used by the artifact
  // "Convert to table" path) so the markdown→table reading never forks.
  const parsedTable = useMemo<ParsedTable | null>(
    () => parseMarkdownTable(content),
    [content],
  );

  // internalTableData holds user edits. null means "not yet in edit mode — use parsedTable".
  // We never sync parsedTable → state during streaming to avoid the useEffect update cascade.
  const [internalTableData, setInternalTableData] =
    useState<ParsedTable | null>(null);

  // If parsing failed, return null (parent handles fallback)
  if (!parsedTable) return null;

  // During streaming (or when no edits have been made), render from the live parsedTable.
  // Once the user enters edit mode, internalTableData diverges from parsedTable.
  const tableData = internalTableData ?? parsedTable;
  const { headers, rows } = tableData;

  // Show loading indicator during streaming if we have partial content
  const showStreamingIndicator = isStreamActive && metadata?.hasPartialContent;

  // ========================================================================
  // EXPORT FUNCTIONS
  // ========================================================================

  const generateMarkdownTable = () => {
    const maxLengths = Array(headers.length).fill(0);
    [headers, ...rows].forEach((row) => {
      row.forEach((cell, i) => {
        maxLengths[i] = Math.max(maxLengths[i], cell.length);
      });
    });
    const formatRow = (row: string[]) =>
      "| " +
      row.map((cell, i) => cell.padEnd(maxLengths[i])).join(" | ") +
      " |";
    const separator =
      "|-" + maxLengths.map((len) => "-".repeat(len)).join("-|-") + "-|";
    return [
      formatRow(headers),
      separator,
      ...rows.map((row) => formatRow(row)),
    ].join("\n");
  };

  const copyTableToClipboard = async () => {
    try {
      const formattedTable = generateMarkdownTable();
      await navigator.clipboard.writeText(formattedTable);
      toast.success("Table copied to clipboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to copy table");
    }
  };

  const copyJsonToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(tableData.normalizedData, null, 2),
      );
      toast.success("JSON copied to clipboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to copy JSON");
    }
  };

  const copyMarkdownToClipboard = async () => {
    try {
      if (content) {
        await navigator.clipboard.writeText(content);
        toast.success("Markdown copied to clipboard");
      } else {
        copyTableToClipboard();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to copy markdown");
    }
  };

  const downloadCSV = () => {
    try {
      const csvContent = [
        headers.map((h) => h.replace(/"/g, '""')).join(","),
        ...rows.map((row) =>
          row
            .map((cell) => {
              const escaped = cell.replace(/"/g, '""');
              return cell.includes(",") ? `"${escaped}"` : escaped;
            })
            .join(","),
        ),
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "table_data.csv";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Table exported to CSV", {
        action: {
          label: "Download Again",
          onClick: () => link.click(),
          className: "font-medium",
        },
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to download CSV");
    }
  };

  const downloadMarkdown = () => {
    try {
      const markdownContent = content || "";
      const fileName =
        headers && headers[0]
          ? `${headers[0].replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`
          : "table_data.md";
      const blob = new Blob([markdownContent], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Markdown file downloaded", {
        action: {
          label: "Download Again",
          onClick: () => {
            const newLink = document.createElement("a");
            newLink.href = url;
            newLink.download = fileName;
            document.body.appendChild(newLink);
            newLink.click();
            document.body.removeChild(newLink);
          },
          className: "font-medium",
        },
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to download Markdown");
    }
  };

  // ========================================================================
  // EDIT FUNCTIONS
  // ========================================================================

  const toggleGlobalEditMode = () => {
    if (editMode !== "none") {
      onSave(tableData);
      setEditMode("none");
      toast.info("Edit mode deactivated");
      notifyContentChange();
    } else {
      // Snapshot parsedTable into state so edits have a stable base
      setInternalTableData(parsedTable);
      setEditMode("header");
      toast.info("Edit mode activated");
    }
  };

  const handleHeaderChange = (index: number, value: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = value;
    setInternalTableData({ ...tableData, headers: newHeaders });
  };

  const handleCellChange = (
    rowIndex: number,
    colIndex: number,
    value: string,
  ) => {
    const newRows = [...rows];
    newRows[rowIndex][colIndex] = value;
    setInternalTableData({ ...tableData, rows: newRows });
  };

  const handleRowClick = (rowIndex: number) => {
    if (editMode === "none") return;
    onSave(tableData);
    setEditMode(rowIndex);
  };

  const handleHeaderClick = () => {
    if (editMode === "none") return;
    onSave(tableData);
    setEditMode("header");
  };

  const handleSave = () => {
    onSave(tableData);
    setEditMode("none");
    toast.success("Table data saved");
    notifyContentChange();
  };

  const handleCancel = () => {
    // Discard edits by resetting to null — tableData will fall back to parsedTable
    setInternalTableData(null);
    setEditMode("none");
    toast.info("Edits cancelled");
  };

  const notifyContentChange = () => {
    if (onContentChange && content) {
      const updatedMarkdown = generateMarkdownTable();
      onContentChange(updatedMarkdown);
    }
  };

  // ========================================================================
  // STRUCTURAL MUTATIONS (add/remove/clear rows & columns)
  // ========================================================================
  //
  // Contract:
  //  - Only callable when editMode !== "none". UI for these handlers is
  //    only mounted in that state.
  //  - Mutations operate on the live `tableData` (which is internalTableData
  //    in edit mode) and replace internalTableData with the new shape.
  //  - onSave is NOT called per-mutation. The user explicitly clicks "Save"
  //    to commit the entire edit session, matching the existing pattern.
  //  - Destructive ops (delete/clear) snapshot before mutating and offer
  //    a one-level undo via the toast action.
  //  - When deleting/clearing a row that is currently in cell-edit mode,
  //    editMode is reset to "header" to avoid a phantom selection on a
  //    row that no longer exists.

  const undo = useTableUndo<ParsedTable>();

  const applyMutation = (mutator: (t: TableShape) => TableShape) => {
    setInternalTableData(mutator(tableData) as ParsedTable);
  };

  const undoLast = () => {
    const prev = undo.consume();
    if (prev) {
      setInternalTableData(prev);
      toast.info("Undone");
    }
  };

  const undoToastAction = {
    label: "Undo",
    onClick: undoLast,
    className: "font-medium",
  };

  // Row actions

  const handleAppendRow = () => {
    applyMutation(appendRow);
    toast.success("Row added");
  };

  const handleInsertRowAbove = (rowIndex: number) => {
    applyMutation((t) => insertRowAbove(t, rowIndex));
    toast.success("Row inserted above");
  };

  const handleInsertRowBelow = (rowIndex: number) => {
    applyMutation((t) => insertRowBelow(t, rowIndex));
    toast.success("Row inserted below");
  };

  const handleDuplicateRow = (rowIndex: number) => {
    applyMutation((t) => duplicateRow(t, rowIndex));
    toast.success("Row duplicated");
  };

  const handleClearRow = (rowIndex: number) => {
    undo.snapshot(tableData);
    applyMutation((t) => clearRow(t, rowIndex));
    toast.success("Row cleared", { action: undoToastAction });
  };

  const handleDeleteRow = (rowIndex: number) => {
    undo.snapshot(tableData);
    applyMutation((t) => removeRow(t, rowIndex));
    if (editMode === rowIndex) {
      setEditMode("header");
    }
    toast.success("Row deleted", { action: undoToastAction });
  };

  const handleClearAllContents = () => {
    if (rows.length === 0 || headers.length <= 1) return;
    undo.snapshot(tableData);
    applyMutation(clearAllContents);
    // Rows are kept, so editMode (if it points at a row) stays valid.
    toast.success("Cleared all contents (kept first column)", {
      action: undoToastAction,
    });
  };

  // Column actions

  const handleAppendColumn = () => {
    applyMutation((t) => appendColumn(t));
    toast.success("Column added");
  };

  const handleInsertColumnBefore = (colIndex: number) => {
    applyMutation((t) => insertColumnBefore(t, colIndex));
    toast.success("Column inserted before");
  };

  const handleInsertColumnAfter = (colIndex: number) => {
    applyMutation((t) => insertColumnAfter(t, colIndex));
    toast.success("Column inserted after");
  };

  const handleDuplicateColumn = (colIndex: number) => {
    applyMutation((t) => duplicateColumn(t, colIndex));
    toast.success("Column duplicated");
  };

  const handleClearColumn = (colIndex: number) => {
    undo.snapshot(tableData);
    applyMutation((t) => clearColumn(t, colIndex));
    toast.success("Column cleared", { action: undoToastAction });
  };

  const handleDeleteColumn = (colIndex: number) => {
    undo.snapshot(tableData);
    applyMutation((t) => removeColumn(t, colIndex));
    toast.success("Column deleted", { action: undoToastAction });
  };

  // ========================================================================
  // DATABASE FUNCTIONS
  // ========================================================================

  const handleSaveComplete = (tableInfo: SavedTableInfo) => {
    // SaveTableModal already dispatches `openQuickDataWindow` on success and
    // closes itself. We just record the result so the action button can flip
    // from "Save" to "View Saved Table" — a re-open shortcut for the same
    // window with this table pre-selected.
    setSavedTableInfo(tableInfo);
    setShowSaveModal(false);
  };

  const handleViewSavedTable = () => {
    if (!savedTableInfo) return;
    dispatch(
      openOverlay({
        overlayId: "quickDataWindow",
        data: { selectedTable: savedTableInfo.table_id },
      }),
    );
  };

  const renderTableActionButton = () => {
    if (!tableData.normalizedData) return null;
    if (savedTableInfo) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={handleViewSavedTable}
          className="flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-800/30"
        >
          <ExternalLink className="h-4 w-4" />
          View Saved Table
        </Button>
      );
    } else {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSaveModal(true)}
          className="flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-800/30"
        >
          <Database className="h-4 w-4" />
          Save
        </Button>
      );
    }
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  const isEditingEnabled = editMode !== "none";
  const isEditingHeader = editMode === "header";
  const editingBorderStyle =
    "overflow-x-auto rounded-xl border-3 border-dashed border-red-500";
  const normalBorderStyle = `overflow-x-auto rounded-xl border-3 ${tableTheme.border}`;

  // Double-click anywhere on the table to enter edit mode (same gate as the
  // visible "Edit" button) and focus the exact cell that was clicked.
  const canEnterEditMode = !isStreamActive && Boolean(metadata?.isComplete);
  const { handleTableDoubleClick, bindCellTextareaRef } = useDoubleClickEdit({
    canEnterEditMode,
    editMode,
    setEditMode,
  });

  return (
    <div className={cn("relative w-full my-3", className)}>
      {showNormalized && tableData.normalizedData ? (
        <div className="relative p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <pre className="text-sm overflow-auto">
            {JSON.stringify(tableData.normalizedData, null, 2)}
          </pre>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNormalized(false)}
            className="absolute top-2 right-2 opacity-90 hover:opacity-100 flex items-center gap-1 shadow-md"
          >
            <Eye className="h-4 w-4" />
            View Table
          </Button>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "overflow-x-auto border border-border rounded-lg shadow-sm",
              isEditingEnabled && "border-dashed border-red-500 border-2",
              isMobile && "-mx-1",
            )}
          >
            <table
              className={cn(
                "divide-y divide-border",
                isMobile ? "min-w-max w-full" : "min-w-full",
              )}
              style={{ fontSize: `${fontSize}px` }}
              onDoubleClick={handleTableDoubleClick}
            >
              {/* Header */}
              <thead className={tableTheme.header} onClick={handleHeaderClick}>
                <tr>
                  {/* Row-actions gutter (edit mode only) */}
                  {isEditingEnabled && (
                    <th className="w-5 p-0" aria-hidden="true" />
                  )}
                  {headers.map((header, index) => (
                    <th
                      key={index}
                      data-cell="header"
                      data-cell-col={index}
                      className={cn(
                        "px-4 py-3 text-left font-semibold",
                        tableTheme.headerText,
                        isMobile && "whitespace-nowrap",
                        isEditingEnabled && "group/col",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-2",
                          isEditingEnabled && "justify-between",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          {isEditingHeader ? (
                            <input
                              type="text"
                              value={header}
                              onChange={(e) =>
                                handleHeaderChange(index, e.target.value)
                              }
                              className={cn(
                                "w-full bg-transparent outline-none border border-dashed border-blue-300 p-1",
                                tableTheme.headerText,
                              )}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <InlineMarkdownWithLinks text={header} />
                          )}
                        </div>
                        {isEditingEnabled && (
                          <ColumnActionsMenu
                            onInsertBefore={() =>
                              handleInsertColumnBefore(index)
                            }
                            onInsertAfter={() => handleInsertColumnAfter(index)}
                            onDuplicate={() => handleDuplicateColumn(index)}
                            onClear={() => handleClearColumn(index)}
                            onDelete={() => handleDeleteColumn(index)}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body */}
              <tbody className="bg-background divide-y divide-border">
                {rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={cn(
                      "transition-colors",
                      typeof tableTheme.row === "object"
                        ? tableTheme.row.hover
                        : "hover:bg-muted/30",
                      editMode === rowIndex && "bg-blue-50 dark:bg-blue-900/20",
                      isEditingEnabled && "group/row",
                    )}
                    onClick={() => handleRowClick(rowIndex)}
                  >
                    {isEditingEnabled && (
                      <td className="w-5 p-0 text-center align-middle">
                        <RowActionsMenu
                          onInsertAbove={() => handleInsertRowAbove(rowIndex)}
                          onInsertBelow={() => handleInsertRowBelow(rowIndex)}
                          onDuplicate={() => handleDuplicateRow(rowIndex)}
                          onClear={() => handleClearRow(rowIndex)}
                          onDelete={() => handleDeleteRow(rowIndex)}
                        />
                      </td>
                    )}
                    {headers.map((_, colIndex) => (
                      <td
                        key={colIndex}
                        data-cell="body"
                        data-cell-row={rowIndex}
                        data-cell-col={colIndex}
                        className={cn(
                          "px-4 py-3 text-sm text-foreground",
                          isMobile
                            ? "whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis"
                            : "whitespace-normal",
                        )}
                      >
                        {editMode === rowIndex ? (
                          <textarea
                            ref={bindCellTextareaRef(rowIndex, colIndex)}
                            value={row[colIndex] || ""}
                            onChange={(e) =>
                              handleCellChange(
                                rowIndex,
                                colIndex,
                                e.target.value,
                              )
                            }
                            className={cn(
                              "w-full bg-transparent outline-none border border-dashed border-blue-300 p-1",
                              "resize-y min-h-[8rem]",
                            )}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.target.select()}
                          />
                        ) : row[colIndex] ? (
                          <InlineMarkdownWithLinks text={row[colIndex]} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Streaming indicator - shows when we're buffering incomplete rows */}
            {showStreamingIndicator && (
              <div className="px-4 py-2 bg-muted/30 border-t border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:200ms]" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:400ms]" />
                  </div>
                  <span>
                    Streaming data... ({metadata?.completeRowCount} row
                    {metadata?.completeRowCount !== 1 ? "s" : ""} complete
                    {metadata?.hasPartialContent ? ", 1 buffering" : ""})
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Structural editing toolbar — only when in edit mode (and stream complete) */}
          {!isStreamActive && metadata?.isComplete && isEditingEnabled && (
            <div className="flex justify-start mt-2">
              <TableEditToolbar
                onAddRow={handleAppendRow}
                onAddColumn={handleAppendColumn}
                onClearAllContents={handleClearAllContents}
                rowCount={rows.length}
                colCount={headers.length}
              />
            </div>
          )}

          {/* Action Buttons - Only show when not streaming and table is complete */}
          {!isStreamActive && metadata?.isComplete && (
            <div
              className={cn(
                "flex gap-2 mt-2",
                isMobile ? "flex-wrap justify-start" : "justify-end",
              )}
            >
              {tableData.normalizedData && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNormalized(!showNormalized)}
                  className="flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-800/30"
                >
                  <Eye className="h-4 w-4" />
                  {showNormalized ? "Table" : "Data"}
                </Button>
              )}
              {renderTableActionButton()}
              {tableData.normalizedData && (
                <SendToWorkbookButton headers={headers} rows={rows} />
              )}
              <ExportDropdownMenu
                tableData={tableData}
                content={content}
                copyTableToClipboard={copyTableToClipboard}
                copyMarkdownToClipboard={copyMarkdownToClipboard}
                copyJsonToClipboard={copyJsonToClipboard}
                downloadCSV={downloadCSV}
                downloadMarkdown={downloadMarkdown}
                isStreamActive={isStreamActive}
              />
              {isEditingEnabled ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    className="flex items-center gap-2 border-1 border-dashed border-green-500 rounded-xl"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="flex items-center gap-2 border-1 border-dashed border-red-500 rounded-xl"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleGlobalEditMode}
                  className="flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-800/30"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showSaveModal && (
        <SaveTableModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          onSaveComplete={handleSaveComplete}
          tableData={tableData.normalizedData}
        />
      )}
    </div>
  );
};
