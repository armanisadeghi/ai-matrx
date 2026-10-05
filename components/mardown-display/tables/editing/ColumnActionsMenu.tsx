"use client";

import React from "react";
import {
  MoreVertical,
  ArrowLeft,
  ArrowRight,
  Copy,
  Eraser,
  Trash2,
} from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ColumnActionsMenuProps {
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onDuplicate: () => void;
  onClear: () => void;
  onDelete: () => void;
}

/**
 * Tiny per-column action menu. Stays invisible until the parent header cell
 * is hovered (relies on a `group/col` class on the <th>). The trigger and
 * items all stop event propagation so they don't trigger the header row's
 * onClick handler (which would otherwise switch to header-edit mode).
 */
export const ColumnActionsMenu: React.FC<ColumnActionsMenuProps> = ({
  onInsertBefore,
  onInsertAfter,
  onDuplicate,
  onClear,
  onDelete,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => e.stopPropagation()}
          className="h-5 w-5 p-0 [&_svg]:size-3 opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          aria-label="Column actions"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-44"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onClick={onInsertBefore} className="cursor-pointer">
          <ArrowLeft className="h-4 w-4 mr-2 text-blue-500" />
          Insert before
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onInsertAfter} className="cursor-pointer">
          <ArrowRight className="h-4 w-4 mr-2 text-blue-500" />
          Insert after
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate} className="cursor-pointer">
          <Copy className="h-4 w-4 mr-2 text-purple-500" />
          Duplicate column
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onClear} className="cursor-pointer">
          <Eraser className="h-4 w-4 mr-2 text-amber-500" />
          Clear Column
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete column
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
