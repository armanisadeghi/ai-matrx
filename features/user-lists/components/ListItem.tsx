"use client";

import React, { useState } from "react";
import { Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { GroupedItem } from "../types";
import type { ListItemBookmark } from "../types";
import { BookmarkCopyButton } from "./BookmarkCopyButton";

// Lazy dynamic icon rendering — avoids importing entire lucide bundle
let lucide: Record<string, React.ComponentType<{ className?: string }>> | null =
  null;
function getLucideIcon(
  name: string,
): React.ComponentType<{ className?: string }> | null {
  return null; // Placeholder — icon_name support is additive
}

interface ListItemProps {
  item: GroupedItem;
  listId: string;
  listName: string;
  isOwner: boolean;
  onEdit?: (item: GroupedItem) => void;
  onDelete?: (itemId: string) => void;
}

export function ListItem({
  item,
  listId,
  listName,
  isOwner,
  onEdit,
  onDelete,
}: ListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const bookmark: ListItemBookmark = {
    type: "list_item",
    list_id: listId,
    list_name: listName,
    item_id: item.id,
    label: item.label,
    description: `Reference to item "${item.label}" in list "${listName}"`,
  };

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 px-4 py-3 rounded-lg",
        "bg-card border border-border/50",
        "transition-colors duration-100 hover:border-border hover:bg-accent/10",
        "[@starting-style]:opacity-0 [@starting-style]:translate-y-1",
        "transition-all duration-200",
      )}
    >
      {/* Main content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug truncate">
          {item.label}
        </p>

        {(item.description || item.help_text) && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {item.description || item.help_text}
          </p>
        )}

        {item.description && item.help_text && (
          <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-1 italic">
            {item.help_text}
          </p>
        )}
      </div>

      {/* Actions — visible on hover (desktop) / always (mobile via sm:opacity-0 group-hover:opacity-100) */}
      <div
        className={cn(
          "flex items-center gap-0.5 flex-shrink-0",
          "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          "transition-opacity duration-150",
          menuOpen && "sm:opacity-100",
        )}
      >
        <BookmarkCopyButton
          bookmark={bookmark}
          label={`"${item.label}" in ${listName}`}
          size="sm"
        />

        {isOwner && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="sr-only">Item options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEdit?.(item)}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete?.(item.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
