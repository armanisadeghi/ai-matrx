"use client";

import React from "react";
import {
  MoreVertical,
  ArrowUp,
  ArrowDown,
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

interface RowActionsMenuProps {
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onClear: () => void;
  onDelete: () => void;
}

/**
 * Tiny per-row action menu. Stays invisible until the parent row is hovered
 * (relies on a `group/row` class on the <tr>). The trigger and items all
 * stop event propagation so they don't trigger the row's onClick handler
 * (which would otherwise enter cell-edit mode for that row).
 */
export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({
  onInsertAbove,
  onInsertBelow,
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
          className="h-5 w-5 p-0 [&_svg]:size-3 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          aria-label="Row actions"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-44"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onClick={onInsertAbove} className="cursor-pointer">
          <ArrowUp className="h-4 w-4 mr-2 text-blue-500" />
          Insert above
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onInsertBelow} className="cursor-pointer">
          <ArrowDown className="h-4 w-4 mr-2 text-blue-500" />
          Insert below
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate} className="cursor-pointer">
          <Copy className="h-4 w-4 mr-2 text-purple-500" />
          Duplicate row
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onClear} className="cursor-pointer">
          <Eraser className="h-4 w-4 mr-2 text-amber-500" />
          Clear Row
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete row
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
