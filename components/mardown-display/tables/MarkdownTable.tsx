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
import { THEMES } from "../themes";
import SaveTableModal from "./SaveTableModal";
import { SendToWorkbookButton } from "./SendToWorkbookButton";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { TableEditToolbar } from "./editing/TableEditToolbar";
import { RowActionsMenu } from "./editing/RowActionsMenu";
import { ColumnActionsMenu } from "./editing/ColumnActionsMenu";
import { useTableUndo } from "./editing/useTableUndo";
import { useDoubleClickEdit } from "./editing/useDoubleClickEdit";
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
} from "./editing/tableMutations";

interface ExportDropdownMenuProps {
  tableData: {
    headers: string[];
    rows: string[][];
    normalizedData?: Array<{ [key: string]: string }>;
  };
  content?: string;
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

  // Memoize the tableData to prevent unnecessary re-renders when references change but content is same
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
      return undefined;
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

interface SavedTableInfo {
  table_id: string;
  table_name: string;
  row_count: string;
  field_count: string;
}

interface MarkdownTableProps {
  data: {
    headers: string[];
    rows: string[][];
    normalizedData?: Array<{ [key: string]: string }>;
  };
  className?: string;
  fontSize?: number;
  theme?: string;
  onSave?: (tableData: { headers: string[]; rows: string[][] }) => void;
  content?: string;
  onContentChange?: (updatedMarkdown: string) => void;
  isStreamActive?: boolean;
}
const MarkdownTable: React.FC<MarkdownTableProps> = ({
  data,
  className = "",
  fontSize = 14,
  theme = "professional",
  onSave = () => {},
  content = "",
  onContentChange,
  isStreamActive = false,
}) => {
  const isMobile = useIsMobile();
  const dispatch = useAppDispatch();
  const [savedTableInfo, setSavedTableInfo] = useState<SavedTableInfo | null>(
    null,
  );

  // Use useMemo to create stable table data based on content, not object references
  const tableData = useMemo(() => {
    if (!data) {
      return {
        headers: [],
        rows: [],
        normalizedData: undefined,
      };
    }

    return {
      headers: data.headers || [],
      rows: data.rows || [],
      normalizedData: data.normalizedData,
    };
  }, [
    JSON.stringify(data?.headers || []),
    JSON.stringify(data?.rows || []),
    JSON.stringify(data?.normalizedData || []),
  ]);

  const [internalTableData, setInternalTableData] = useState(tableData);
  const [showNormalized, setShowNormalized] = useState(false);
  const [editMode, setEditMode] = useState<"none" | "header" | number>("none");
  const tableFontsize = fontSize;
  const toast = useToastManager();
  const tableTheme = THEMES[theme].table || THEMES.professional.table;
  const [showSaveModal, setShowSaveModal] = useState(false);
  const previousDataRef = useRef<string>("");

  // Update internal state when tableData changes
  useEffect(() => {
    setInternalTableData(tableData);
  }, [tableData]);

  useEffect(() => {
    if (data) {
      // Create a stable hash of the data to detect actual changes
      const dataHash = JSON.stringify({
        headers: data.headers || [],
        rows: data.rows || [],
        normalizedData: data.normalizedData,
      });

      // Only update if the data has actually changed
      if (dataHash !== previousDataRef.current) {
        previousDataRef.current = dataHash;
        setInternalTableData({
          headers: data.headers || [],
          rows: data.rows || [],
          normalizedData: data.normalizedData,
        });
      }
    }
  }, [data]);

  const generateMarkdownTable = () => {
    const maxLengths = Array(internalTableData.headers.length).fill(0);
    [internalTableData.headers, ...internalTableData.rows].forEach((row) => {
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
      formatRow(internalTableData.headers),
      separator,
      ...internalTableData.rows.map((row) => formatRow(row)),
    ].join("\n");
  };

  const notifyContentChange = () => {
    if (onContentChange && content) {
      const updatedMarkdown = generateMarkdownTable();
      onContentChange(updatedMarkdown);
    }
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
        JSON.stringify(internalTableData.normalizedData, null, 2),
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
        internalTableData.headers.map((h) => h.replace(/"/g, '""')).join(","),
        ...internalTableData.rows.map((row) =>
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
        internalTableData.headers && internalTableData.headers[0]
          ? `${internalTableData.headers[0].replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`
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

  const toggleGlobalEditMode = () => {
    if (editMode !== "none") {
      onSave(internalTableData);
      setEditMode("none");
      toast.info("Edit mode deactivated");
      notifyContentChange();
    } else {
      setEditMode("header");
      toast.info("Edit mode activated");
    }
  };

  const handleHeaderChange = (index: number, value: string) => {
    const newHeaders = [...internalTableData.headers];
    newHeaders[index] = value;
    setInternalTableData({ ...internalTableData, headers: newHeaders });
  };

  const handleCellChange = (
    rowIndex: number,
    colIndex: number,
    value: string,
  ) => {
    const newRows = internalTableData.rows.map((row, i) =>
      i === rowIndex
        ? row.map((cell, j) => (j === colIndex ? value : cell))
        : row,
    );
    setInternalTableData({ ...internalTableData, rows: newRows });
  };

  const handleRowClick = (rowIndex: number) => {
    if (editMode === "none") return;
    onSave(internalTableData);
    setEditMode(rowIndex);
  };

  const handleHeaderClick = () => {
    if (editMode === "none") return;
    onSave(internalTableData);
    setEditMode("header");
  };

  const handleSave = () => {
    onSave(internalTableData);
    setEditMode("none");
    toast.success("Table data saved");
    notifyContentChange();
  };

  const handleCancel = () => {
    if (data) {
      setInternalTableData({
        headers: data.headers || [],
        rows: data.rows || [],
        normalizedData: data.normalizedData,
      });
    }
    setEditMode("none");
    toast.info("Edits cancelled");
  };

  // ========================================================================
  // STRUCTURAL MUTATIONS (add/remove/clear rows & columns)
  // ========================================================================
  //
  // Edit-mode-only by construction (the toolbar and per-row/col handles are
  // only mounted when editMode !== "none"). Mutations replace internalTableData
  // with a new shape via pure functions; onSave is only called when the user
  // explicitly clicks "Save", matching the existing pattern.

  const undo = useTableUndo<typeof internalTableData>();

  const applyMutation = (mutator: (t: TableShape) => TableShape) => {
    const next = mutator(internalTableData);
    setInternalTableData({
      headers: next.headers,
      rows: next.rows,
      normalizedData: next.normalizedData,
    });
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
    undo.snapshot(internalTableData);
    applyMutation((t) => clearRow(t, rowIndex));
    toast.success("Row cleared", { action: undoToastAction });
  };

  const handleDeleteRow = (rowIndex: number) => {
    undo.snapshot(internalTableData);
    applyMutation((t) => removeRow(t, rowIndex));
    if (editMode === rowIndex) {
      setEditMode("header");
    }
    toast.success("Row deleted", { action: undoToastAction });
  };

  const handleClearAllContents = () => {
    if (
      internalTableData.rows.length === 0 ||
      internalTableData.headers.length <= 1
    ) {
      return;
    }
    undo.snapshot(internalTableData);
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
    undo.snapshot(internalTableData);
    applyMutation((t) => clearColumn(t, colIndex));
    toast.success("Column cleared", { action: undoToastAction });
  };

  const handleDeleteColumn = (colIndex: number) => {
    undo.snapshot(internalTableData);
    applyMutation((t) => removeColumn(t, colIndex));
    toast.success("Column deleted", { action: undoToastAction });
  };

  const isEditingEnabled = editMode !== "none";
  const isEditingHeader = editMode === "header";
  const editingBorderStyle =
    "overflow-x-auto rounded-xl border-3 border-dashed border-red-500 rounded-xl";
  const normalBorderStyle = `overflow-x-auto rounded-xl border-3 ${tableTheme.border}`;

  // Double-click anywhere on the table to enter edit mode (same gate as the
  // visible "Edit" button) and focus the exact cell that was clicked.
  const canEnterEditMode = !isStreamActive;
  const { handleTableDoubleClick, bindCellTextareaRef } = useDoubleClickEdit({
    canEnterEditMode,
    editMode,
    setEditMode,
  });

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
    if (!internalTableData.normalizedData) return null;
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

  return (
    <div className={cn("relative", className)}>
      {showNormalized && internalTableData.normalizedData ? (
        <div className="relative p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <pre className="text-sm overflow-auto">
            {JSON.stringify(internalTableData.normalizedData, null, 2)}
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
        <div
          className={cn(
            isEditingEnabled ? editingBorderStyle : normalBorderStyle,
            "overflow-x-auto",
            isMobile && "-mx-1",
          )}
        >
          <table
            className={cn(
              "border-collapse",
              isMobile ? "min-w-max w-full" : "w-full",
            )}
            style={{ fontSize: `${tableFontsize}px` }}
            onDoubleClick={handleTableDoubleClick}
          >
            <thead className={tableTheme.header}>
              <tr onClick={handleHeaderClick}>
                {/* Row-actions gutter (edit mode only) */}
                {isEditingEnabled && (
                  <th className="w-5 p-0" aria-hidden="true" />
                )}
                {internalTableData.headers.map((header, i) => (
                  <th
                    key={i}
                    data-cell="header"
                    data-cell-col={i}
                    className={cn(
                      "p-2 text-left",
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
                            value={internalTableData.headers[i] || header}
                            onChange={(e) =>
                              handleHeaderChange(i, e.target.value)
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
                          onInsertBefore={() => handleInsertColumnBefore(i)}
                          onInsertAfter={() => handleInsertColumnAfter(i)}
                          onDuplicate={() => handleDuplicateColumn(i)}
                          onClear={() => handleClearColumn(i)}
                          onDelete={() => handleDeleteColumn(i)}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {internalTableData.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={cn(
                    "border-t",
                    tableTheme.row,
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
                  {row.map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      data-cell="body"
                      data-cell-row={rowIndex}
                      data-cell-col={colIndex}
                      className={cn(
                        "p-2",
                        colIndex === 0 && "font-semibold",
                        isMobile &&
                          "whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis",
                      )}
                    >
                      {editMode === rowIndex ? (
                        <textarea
                          ref={bindCellTextareaRef(rowIndex, colIndex)}
                          value={
                            internalTableData.rows[rowIndex]?.[colIndex] || cell
                          }
                          onChange={(e) =>
                            handleCellChange(rowIndex, colIndex, e.target.value)
                          }
                          className={cn(
                            "w-full bg-transparent outline-none border border-dashed border-blue-300 p-1",
                            "resize-y min-h-[8rem]",
                            colIndex === 0 && "font-semibold",
                          )}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={(e) => e.target.select()}
                        />
                      ) : (
                        <InlineMarkdownWithLinks text={cell} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Structural editing toolbar — only when in edit mode (and not streaming) */}
      {!isStreamActive && isEditingEnabled && (
        <div className="flex justify-start mt-2">
          <TableEditToolbar
            onAddRow={handleAppendRow}
            onAddColumn={handleAppendColumn}
            onClearAllContents={handleClearAllContents}
            rowCount={internalTableData.rows.length}
            colCount={internalTableData.headers.length}
          />
        </div>
      )}
      {!isStreamActive && (
        <div
          className={cn(
            "flex gap-2 mt-2",
            isMobile ? "flex-wrap justify-start" : "justify-end",
          )}
        >
          {internalTableData.normalizedData && (
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
          {internalTableData.normalizedData && (
            <SendToWorkbookButton
              headers={internalTableData.headers}
              rows={internalTableData.rows}
            />
          )}
          <ExportDropdownMenu
            tableData={internalTableData}
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
      {showSaveModal && (
        <SaveTableModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          onSaveComplete={handleSaveComplete}
          tableData={internalTableData.normalizedData}
        />
      )}
    </div>
  );
};

export default MarkdownTable;
