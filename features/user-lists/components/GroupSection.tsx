"use client";

import React, { useRef, useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { GroupedItem } from "../types";
import type { ListGroupBookmark } from "../types";
import { BookmarkCopyButton } from "./BookmarkCopyButton";
import { ListItem } from "./ListItem";
import { LIST_GROUP_DOM_ATTR } from "../dom-anchors";
import { openContextMenuForElement } from "@/features/context-menu-v3/utils/open-context-menu";

interface GroupSectionProps {
  groupName: string;
  items: GroupedItem[];
  listId: string;
  listName: string;
  isOwner: boolean;
  defaultOpen?: boolean;
  onAddItem?: (groupName: string) => void;
  onEditItem?: (item: GroupedItem, groupName: string) => void;
  onDeleteItem?: (itemId: string) => void;
}

export function GroupSection({
  groupName,
  items,
  listId,
  listName,
  isOwner,
  defaultOpen = true,
  onAddItem,
  onEditItem,
  onDeleteItem,
}: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const groupRef = useRef<HTMLDivElement | null>(null);
  const displayName = groupName === "Ungrouped" ? "Ungrouped" : groupName;

  const bookmark: ListGroupBookmark = {
    type: "list_group",
    list_id: listId,
    list_name: listName,
    group_name: groupName === "Ungrouped" ? "" : groupName,
    description: `Reference to group "${displayName}" in list "${listName}"`,
  };

  return (
    <Collapsible
      ref={groupRef}
      open={open}
      onOpenChange={setOpen}
      className="space-y-1"
      // Read by the pane's ONE context menu to work out which group heading
      // (and therefore which "Add item to …") the right-click landed in.
      {...{ [LIST_GROUP_DOM_ATTR]: groupName }}
    >
      {/* Group header */}
      <div
        className={cn(
          "flex items-center gap-2 px-1 py-1.5 rounded-md",
          "group/group hover:bg-accent/20 transition-colors",
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 flex-1 min-w-0 text-left">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {displayName}
            </span>
            <span className="text-xs text-muted-foreground/60 font-mono tabular-nums flex-shrink-0">
              {items.length}
            </span>
          </button>
        </CollapsibleTrigger>

        {/* Group-level actions */}
        <div
          className={cn(
            "flex items-center gap-0.5 flex-shrink-0",
            "opacity-100 sm:opacity-0 sm:group-hover/group:opacity-100",
            "transition-opacity duration-150",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-11 shrink-0 p-0 text-muted-foreground lg:hidden"
            aria-label={`Actions for ${displayName}`}
            aria-haspopup="menu"
            onClick={() => openContextMenuForElement(groupRef.current)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <BookmarkCopyButton
            bookmark={bookmark}
            label={`"${displayName}" group in ${listName}`}
            size="sm"
          />
          {isOwner && onAddItem && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
              onClick={() =>
                onAddItem(groupName === "Ungrouped" ? "" : groupName)
              }
              title={`Add item to ${displayName}`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="sr-only">Add item to {displayName}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Items */}
      <CollapsibleContent>
        <div className="space-y-1.5 pl-2">
          {items.map((item) => (
            <ListItem
              key={item.id}
              item={item}
              listId={listId}
              listName={listName}
              isOwner={isOwner}
              // The group lives in the KEY of items_grouped, not on the item,
              // so this is where it gets attached for the Edit dialog.
              onEdit={onEditItem ? (i) => onEditItem(i, groupName) : undefined}
              onDelete={onDeleteItem}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
