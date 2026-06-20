"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/styles/themes/utils";
import {
  Copy,
  Check,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  X,
  Check as CheckIcon,
  Table2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createDatasetFromTable } from "@/features/data-tables/create-dataset-from-table";

function parseCsv(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          cells.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }

  return rows;
}

function rowsToDelimitedContent(rows: string[][], delimiter: string): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const needsQuote =
            cell.includes(delimiter) ||
            cell.includes('"') ||
            cell.includes("\n") ||
            cell.includes("\r");
          const escaped = cell.replace(/"/g, '""');
          return needsQuote ? `"${escaped}"` : escaped;
        })
        .join(delimiter),
    )
    .join("\n");
}

type SortDir = "asc" | "desc" | null;

interface CsvBlockProps {
  content: string;
  delimiter?: string;
  className?: string;
  /** Fires when the user commits an inline cell edit — inner markdown body only (no fence). */
  onInnerContentChange?: (inner: string) => void;
}

const CsvBlock: React.FC<CsvBlockProps> = ({
  content,
  delimiter = ",",
  className,
  onInnerContentChange,
}) => {
  const [copied, setCopied] = useState(false);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(
    null,
  );
  const [editValue, setEditValue] = useState("");
  const [data, setData] = useState(() => parseCsv(content, delimiter));
  const [saving, setSaving] = useState(false);
  const dispatch = useAppDispatch();

  useEffect(() => {
    setData(parseCsv(content, delimiter));
    setEditCell(null);
  }, [content, delimiter]);

  const headers = data[0] || [];
  const bodyRows = data.slice(1);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Save the CSV as a real, live `udt_datasets` table (CSV → UDT, the preferred
  // home for tabular data). Reuses the shared create primitive and opens it in
  // the Quick Data window — the same destination as the markdown-table Save.
  const handleSaveAsTable = async () => {
    if (headers.length === 0 || bodyRows.length === 0) {
      toast.error("No CSV rows to save.");
      return;
    }
    setSaving(true);
    try {
      const safeHeaders = headers.map((h, i) => h || `Column ${i + 1}`);
      const rows = bodyRows.map((row) => {
        const obj: Record<string, string> = {};
        safeHeaders.forEach((h, i) => {
          obj[h] = row[i] ?? "";
        });
        return obj;
      });
      const result = await createDatasetFromTable({
        name: "Table from CSV",
        description: "Created from a chat CSV block",
        headers: safeHeaders,
        rows,
      });
      if (result.ok) {
        toast.success(`Saved as a live table (${result.inserted} rows)`, {
          description: "Opening — edit it as a real data table.",
        });
        dispatch(
          openOverlay({
            overlayId: "quickDataWindow",
            data: { selectedTable: result.tableId },
          }),
        );
      } else {
        toast.error(`Save failed: ${result.error}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortCol(null);
        setSortDir(null);
      }
    } else {
      setSortCol(colIdx);
      setSortDir("asc");
    }
  };

  const sortedRows = [...bodyRows];
  if (sortCol !== null && sortDir) {
    sortedRows.sort((a, b) => {
      const aVal = a[sortCol] ?? "";
      const bVal = b[sortCol] ?? "";
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDir === "asc" ? aNum - bNum : bNum - aNum;
      }
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }

  const startEdit = (rowIdx: number, colIdx: number) => {
    setEditCell({ row: rowIdx, col: colIdx });
    setEditValue(bodyRows[rowIdx]?.[colIdx] ?? "");
  };

  const commitEdit = () => {
    if (!editCell) return;
    const newData = [...data];
    const actualRow = editCell.row + 1;
    if (!newData[actualRow]) return;
    newData[actualRow] = [...newData[actualRow]];
    newData[actualRow][editCell.col] = editValue;
    setData(newData);
    setEditCell(null);
    const inner = rowsToDelimitedContent(newData, delimiter);
    onInnerContentChange?.(inner);
  };

  const cancelEdit = () => {
    setEditCell(null);
  };

  const getSortIcon = (colIdx: number) => {
    if (sortCol !== colIdx)
      return (
        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50" />
      );
    if (sortDir === "asc") return <ArrowUp className="w-3 h-3 text-primary" />;
    return <ArrowDown className="w-3 h-3 text-primary" />;
  };

  return (
    <div
      className={cn(
        "my-3 rounded-lg border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-green-600 dark:text-green-400">
            CSV
          </span>
          <span className="text-xs text-muted-foreground">
            {bodyRows.length} rows x {headers.length} cols
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSaveAsTable}
            disabled={saving}
            title="Save as a live data table"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Table2 className="w-3.5 h-3.5" />
            )}
            <span>Save as table</span>
          </button>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-1 py-1 text-center text-xs text-muted-foreground font-mono border-r border-border/30 w-8">
                #
              </th>
              {headers.map((h, colIdx) => (
                <th
                  key={colIdx}
                  onClick={() => handleSort(colIdx)}
                  className="group/th px-3 py-1.5 text-left text-xs font-semibold text-foreground border-r border-border/30 last:border-r-0 cursor-pointer hover:bg-muted/70 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{h}</span>
                    {getSortIcon(colIdx)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-t border-border/20 hover:bg-muted/20 transition-colors"
              >
                <td className="px-1 py-1 text-center text-xs text-muted-foreground font-mono border-r border-border/30">
                  {rowIdx + 1}
                </td>
                {headers.map((_, colIdx) => {
                  const isEditing =
                    editCell?.row === rowIdx && editCell?.col === colIdx;
                  const cellValue = row[colIdx] ?? "";

                  return (
                    <td
                      key={colIdx}
                      className="group/cell px-3 py-1.5 text-foreground border-r border-border/30 last:border-r-0 relative"
                      onDoubleClick={() => startEdit(rowIdx, colIdx)}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="w-full px-1 py-0 text-sm bg-background border border-primary rounded focus:outline-none"
                            style={{ fontSize: "16px" }}
                            autoFocus
                          />
                          <button
                            onClick={commitEdit}
                            className="text-green-500 hover:text-green-400"
                          >
                            <CheckIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span
                            className={cn(
                              !isNaN(Number(cellValue)) &&
                                cellValue !== "" &&
                                "text-purple-600 dark:text-purple-400 font-mono tabular-nums",
                            )}
                          >
                            {cellValue}
                          </span>
                          <button
                            onClick={() => startEdit(rowIdx, colIdx)}
                            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-50 hover:!opacity-100 transition-opacity"
                          >
                            <Pencil className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CsvBlock;
