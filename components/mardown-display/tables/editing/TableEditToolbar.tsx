"use client";

import React from "react";
import { Plus, Eraser, Columns3, Rows3 } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

interface TableEditToolbarProps {
  onAddRow: () => void;
  onAddColumn: () => void;
  /**
   * Empties all data cells except the first column. Headers and first-column
   * values are preserved. Disabled when there are no rows or only one column.
   */
  onClearAllContents: () => void;
  rowCount: number;
  colCount: number;
  className?: string;
}

export const TableEditToolbar: React.FC<TableEditToolbarProps> = ({
  onAddRow,
  onAddColumn,
  onClearAllContents,
  rowCount,
  colCount,
  className,
}) => {
  const clearDisabled = rowCount === 0 || colCount <= 1;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={onAddRow}
        className="flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-800/30"
      >
        <Plus className="h-3.5 w-3.5" />
        <Rows3 className="h-3.5 w-3.5" />
        Add Row
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onAddColumn}
        className="flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-800/30"
      >
        <Plus className="h-3.5 w-3.5" />
        <Columns3 className="h-3.5 w-3.5" />
        Add Column
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onClearAllContents}
        disabled={clearDisabled}
        title="Clears all data cells. Preserves headers and the first column."
        className="flex items-center gap-1.5 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
      >
        <Eraser className="h-3.5 w-3.5" />
        Clear All Contents
      </Button>
    </div>
  );
};
