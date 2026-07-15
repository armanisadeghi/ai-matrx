"use client";

import React, { useState, useTransition } from "react";
import { Plus, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserListWithItems, GroupedItem } from "../types";
import { ListMetaHeader } from "./ListMetaHeader";
import { GroupSection } from "./GroupSection";

interface ListDetailProps {
  list: UserListWithItems;
  userId: string | null;
  onEditList?: () => void;
  onDeleteList?: () => void;
  onEditItem?: (item: GroupedItem) => void;
  onDeleteItem?: (itemId: string) => void;
  onAddItem?: (groupName?: string) => void;
  /**
   * Render the in-panel `ListMetaHeader` (title/description/actions bar).
   * Defaults to true for embedded contexts (floating workspace, overlay,
   * dev demos). The `/lists/[id]` page route sets this to false because it
   * renders the same identity + actions via the shell's `EntityModeHeader`
   * instead — never both.
   */
  showMetaHeader?: boolean;
}

export function ListDetail({
  list,
  userId,
  onEditList,
  onDeleteList,
  onEditItem,
  onDeleteItem,
  onAddItem,
  showMetaHeader = true,
}: ListDetailProps) {
  const isOwner = !!userId && userId === list.user_id;

  const groups = Object.entries(list.items_grouped ?? {});
  const itemCount = groups.reduce((acc, [, items]) => acc + items.length, 0);
  const groupCount = groups.length;

  // First group starts open; rest start closed
  const openByDefault = (index: number) => index === 0;

  if (groups.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {showMetaHeader && (
          <ListMetaHeader
            list={list}
            isOwner={isOwner}
            itemCount={0}
            groupCount={0}
            onEdit={onEditList}
            onDelete={onDeleteList}
          />
        )}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <PackageOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No items yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add items to start building this list
            </p>
          </div>
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => onAddItem?.("")}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add first item
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full @container">
      {showMetaHeader && (
        <ListMetaHeader
          list={list}
          isOwner={isOwner}
          itemCount={itemCount}
          groupCount={groupCount}
          onEdit={onEditList}
          onDelete={onDeleteList}
        />
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-3 space-y-3">
          {groups.map(([groupName, items], index) => (
            <GroupSection
              key={groupName}
              groupName={groupName}
              items={items}
              listId={list.list_id}
              listName={list.list_name}
              isOwner={isOwner}
              defaultOpen={openByDefault(index)}
              onAddItem={isOwner ? onAddItem : undefined}
              onEditItem={onEditItem}
              onDeleteItem={onDeleteItem}
            />
          ))}
        </div>
      </div>

      {/* Sticky add-item bar */}
      {isOwner && (
        <div className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm px-3 py-2 pb-safe">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8"
            onClick={() => onAddItem?.("")}
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </Button>
        </div>
      )}
    </div>
  );
}
