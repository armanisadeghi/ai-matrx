"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
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
import ViewTableModal from "./ViewTableModal";

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// TableControls component
interface TableControlsProps {
  tableData: {
    headers: string[];
    rows: string[][];
    normalizedData?: Array<{ [key: string]: string }>;
  };
  content: string;
  showNormalized: boolean;
  setShowNormalized: (value: boolean) => void;
  editMode: "none" | "header" | number;
  savedTableInfo: SavedTableInfo | null;
  setShowSaveModal: (value: boolean) => void;
  setShowViewModal: (value: boolean) => void;
  onSave: (tableData: { headers: string[]; rows: string[][] }) => void;
  onContentChange?: (updatedMarkdown: string) => void;
  toggleGlobalEditMode: (notifyContentChange: () => void) => void;
  handleSave: (notifyContentChange: () => void) => void;
  handleCancel: () => void;
}
const TableControls: React.FC<TableControlsProps> = ({
  tableData,
  content,
  showNormalized,
  setShowNormalized,
  editMode,
  savedTableInfo,
  setShowSaveModal,
  setShowViewModal,
  onSave,
  onContentChange,
  toggleGlobalEditMode,
  handleSave,
  handleCancel,
}) => {
  const toast = useToastManager();
  const debouncedTableData = useDebounce(tableData, 500);
  const isUpdating = tableData !== debouncedTableData;

  const generateMarkdownTable = useCallback(() => {
    const maxLengths = Array(tableData.headers.length).fill(0);
    [tableData.headers, ...tableData.rows].forEach((row) => {
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
      formatRow(tableData.headers),
      separator,
      ...tableData.rows.map((row) => formatRow(row)),
    ].join("\n");
  }, [tableData.headers, tableData.rows]);

  const notifyContentChange = useCallback(() => {
    if (onContentChange && content) {
      const updatedMarkdown = generateMarkdownTable();
      onContentChange(updatedMarkdown);
    }
  }, [onContentChange, content, generateMarkdownTable]);

  const copyTableToClipboard = useCallback(async () => {
    try {
      const formattedTable = generateMarkdownTable();
      await navigator.clipboard.writeText(formattedTable);
      toast.success("Table copied to clipboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to copy table");
    }
  }, [generateMarkdownTable, toast]);

  const copyJsonToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(debouncedTableData.normalizedData, null, 2),
      );
      toast.success("JSON copied to clipboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to copy JSON");
    }
  }, [debouncedTableData.normalizedData, toast]);

  const copyMarkdownToClipboard = useCallback(async () => {
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
  }, [content, copyTableToClipboard, toast]);

  const downloadCSV = useCallback(() => {
    try {
      const csvContent = [
        tableData.headers.map((h) => h.replace(/"/g, '""')).join(","),
        ...tableData.rows.map((row) =>
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
  }, [tableData.headers, tableData.rows, toast]);

  const downloadMarkdown = useCallback(() => {
    try {
      const markdownContent = content || "";
      const fileName =
        tableData.headers && tableData.headers[0]
          ? `${tableData.headers[0].replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`
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
  }, [content, tableData.headers, toast]);

  const renderTableActionButton = useCallback(() => {
    if (!debouncedTableData.normalizedData) return null;
    if (savedTableInfo) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowViewModal(true)}
          className="flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-800/30"
          disabled={isUpdating}
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
          disabled={isUpdating}
        >
          <Database className="h-4 w-4" />
          Save
        </Button>
      );
    }
  }, [
    debouncedTableData.normalizedData,
    savedTableInfo,
    setShowViewModal,
    setShowSaveModal,
    isUpdating,
  ]);

  if (isUpdating) {
    // Placeholder mimicking the controls' layout
    return (
      <div className="flex justify-end gap-2 mt-2 opacity-50">
        {debouncedTableData.normalizedData && (
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            disabled
          >
            <Eye className="h-4 w-4" />
            {showNormalized ? "Table" : "Data"}
          </Button>
        )}
        {debouncedTableData.normalizedData && (
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            disabled
          >
            {savedTableInfo ? (
              <>
                <ExternalLink className="h-4 w-4" />
                View Saved Table
              </>
            ) : (
              <>
                <Database className="h-4 w-4" />
                Save
              </>
            )}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
          disabled
        >
          <Download className="h-4 w-4" />
          Export
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
        {editMode !== "none" ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 border-1 border-dashed border-green-500 rounded-xl"
              disabled
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 border-1 border-dashed border-red-500 rounded-xl"
              disabled
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            disabled
          >
            <Edit className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-2 mt-2">
      {debouncedTableData.normalizedData && (
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
          {debouncedTableData.normalizedData && (
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
      {editMode !== "none" ? (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave(notifyContentChange)}
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
          onClick={() => toggleGlobalEditMode(notifyContentChange)}
          className="flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-800/30"
        >
          <Edit className="h-4 w-4" />
          Edit
        </Button>
      )}
    </div>
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
}
const MarkdownTable: React.FC<MarkdownTableProps> = ({
  data,
  className = "",
  fontSize = 16,
  theme = "professional",
  onSave = () => {},
  content = "",
  onContentChange,
}) => {
  const [tableData, setTableData] = useState<{
    headers: string[];
    rows: string[][];
    normalizedData?: Array<{ [key: string]: string }>;
  }>({
    headers: [],
    rows: [],
    normalizedData: data?.normalizedData,
  });
  const [showNormalized, setShowNormalized] = useState(false);
  const [editMode, setEditMode] = useState<"none" | "header" | number>("none");
  const tableFontsize = fontSize;
  const toast = useToastManager();
  const tableTheme = THEMES[theme].table || THEMES.professional.table;
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [savedTableInfo, setSavedTableInfo] = useState<SavedTableInfo | null>(
    null,
  );

  useEffect(() => {
    if (data) {
      setTableData({
        headers: data.headers || [],
        rows: data.rows || [],
        normalizedData: data.normalizedData,
      });
    }
  }, [data]);

  const renderMarkdown = useCallback((text: string) => {
    let html = text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, "$1");
    html = html.replace(/([^<]+)<\/strong><\/em>/g, "$1");
    return html;
  }, []);

  const toggleGlobalEditMode = useCallback(
    (notifyContentChange: () => void) => {
      if (editMode !== "none") {
        onSave(tableData);
        setEditMode("none");
        toast.info("Edit mode deactivated");
        notifyContentChange();
      } else {
        setEditMode("header");
        toast.info("Edit mode activated");
      }
    },
    [editMode, onSave, tableData, toast],
  );

  const handleHeaderChange = useCallback(
    (index: number, value: string) => {
      const newHeaders = [...tableData.headers];
      newHeaders[index] = value;
      setTableData({ ...tableData, headers: newHeaders });
    },
    [tableData],
  );

  const handleCellChange = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      const newRows = [...tableData.rows];
      newRows[rowIndex][colIndex] = value;
      setTableData({ ...tableData, rows: newRows });
    },
    [tableData],
  );

  const handleRowClick = useCallback(
    (rowIndex: number) => {
      if (editMode === "none") return;
      onSave(tableData);
      setEditMode(rowIndex);
    },
    [editMode, onSave, tableData],
  );

  const handleHeaderClick = useCallback(() => {
    if (editMode === "none") return;
    onSave(tableData);
    setEditMode("header");
  }, [editMode, onSave, tableData]);

  const handleSave = useCallback(
    (notifyContentChange: () => void) => {
      onSave(tableData);
      setEditMode("none");
      toast.success("Table data saved");
      notifyContentChange();
    },
    [onSave, tableData, toast],
  );

  const handleCancel = useCallback(() => {
    if (data) {
      setTableData({
        headers: data.headers || [],
        rows: data.rows || [],
        normalizedData: data.normalizedData,
      });
    }
    setEditMode("none");
    toast.info("Edits cancelled");
  }, [data, toast]);

  const handleSaveComplete = useCallback((tableInfo: SavedTableInfo) => {
    setSavedTableInfo(tableInfo);
    setShowSaveModal(false);
    setShowViewModal(true);
  }, []);

  const isEditingEnabled = editMode !== "none";
  const isEditingHeader = editMode === "header";
  const editingBorderStyle =
    "overflow-x-auto rounded-xl border-3 border-dashed border-red-500 rounded-xl";
  const normalBorderStyle = `overflow-x-auto rounded-xl border-3 ${tableTheme.border}`;

  return (
    <div className={cn("relative", className)}>
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
        <div
          className={isEditingEnabled ? editingBorderStyle : normalBorderStyle}
        >
          <table
            className="w-full border-collapse"
            style={{ fontSize: `${tableFontsize}px` }}
          >
            <thead className={tableTheme.header}>
              <tr onClick={handleHeaderClick}>
                {tableData.headers.map((header, i) => (
                  <th
                    key={i}
                    className={cn("p-2 text-left", tableTheme.headerText)}
                  >
                    {isEditingHeader ? (
                      <input
                        type="text"
                        value={header}
                        onChange={(e) => handleHeaderChange(i, e.target.value)}
                        className={cn(
                          "w-full bg-transparent outline-none border border-dashed border-blue-300 p-1",
                          tableTheme.headerText,
                        )}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      renderMarkdown(header)
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={cn(
                    "border-t",
                    tableTheme.row,
                    editMode === rowIndex && "bg-blue-50 dark:bg-blue-900/20",
                  )}
                  onClick={() => handleRowClick(rowIndex)}
                >
                  {row.map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      className={cn("p-2", colIndex === 0 && "font-semibold")}
                    >
                      {editMode === rowIndex ? (
                        <textarea
                          value={cell}
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
                        renderMarkdown(cell)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TableControls
        tableData={tableData}
        content={content}
        showNormalized={showNormalized}
        setShowNormalized={setShowNormalized}
        editMode={editMode}
        savedTableInfo={savedTableInfo}
        setShowSaveModal={setShowSaveModal}
        setShowViewModal={setShowViewModal}
        onSave={onSave}
        onContentChange={onContentChange}
        toggleGlobalEditMode={toggleGlobalEditMode}
        handleSave={handleSave}
        handleCancel={handleCancel}
      />
      {showSaveModal && (
        <SaveTableModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          onSaveComplete={handleSaveComplete}
          tableData={tableData.normalizedData ?? []}
        />
      )}
      {showViewModal && savedTableInfo && (
        <ViewTableModal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          tableInfo={savedTableInfo}
        />
      )}
    </div>
  );
};

export default MarkdownTable;
