"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  List,
  Tag,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  Bookmark,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type TreeNodeType = "list" | "group" | "item";

export interface TreeNodeData {
  id: string;
  type: TreeNodeType;
  label: string;
  description?: string | null;
  /** For list nodes: number of children (items or groups) */
  childCount?: number;
  /** For list nodes: group names if loaded */
  groups?: string[];
  listId?: string;
  listName?: string;
  groupName?: string;
}

interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  isExpanded: boolean;
  isActive: boolean;
  isNavigating: boolean;
  isAnyNavigating: boolean;
  onToggleExpand: (id: string) => void;
  onNavigate: (id: string) => void;
  onEdit?: (node: TreeNodeData) => void;
  onDelete?: (node: TreeNodeData) => void;
  onAddItem?: (node: TreeNodeData) => void;
  onInfo?: (node: TreeNodeData) => void;
}

const NODE_ICONS: Record<TreeNodeType, LucideIcon> = {
  list: List,
  group: Tag,
  item: FileText,
};

const INDENT_PER_DEPTH = 14;

export function TreeNode({
  node,
  depth,
  isExpanded,
  isActive,
  isNavigating,
  isAnyNavigating,
  onToggleExpand,
  onNavigate,
  onEdit,
  onDelete,
  onAddItem,
  onInfo,
}: TreeNodeProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const Icon = NODE_ICONS[node.type];
  const hasChildren = node.type !== "item" && (node.childCount ?? 0) > 0;
  const isDisabled = isAnyNavigating;
  const href =
    node.type === "list" ? `/lists/${node.id}` : `/lists/${node.listId}`;

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (isDisabled) return;

    if (hasChildren) {
      onToggleExpand(node.id);
    }

    if (node.type === "list") {
      onNavigate(node.id);
      startTransition(() => router.push(`/lists/${node.id}`));
    } else if (node.type === "group" && node.listId) {
      startTransition(() => router.push(`/lists/${node.listId}`));
    }
  };

  const paddingLeft = 6 + depth * INDENT_PER_DEPTH;

  const menuItems: ContextMenuExtraItem[] = [];
  if (onInfo) {
    menuItems.push({
      kind: "item",
      id: "list-node-info",
      label: "View details",
      icon: Info,
      onSelect: () => onInfo(node),
    });
  }
  if ((node.type === "list" || node.type === "group") && onAddItem) {
    menuItems.push({
      kind: "item",
      id: "list-node-add-item",
      label: "Add item",
      icon: Plus,
      onSelect: () => onAddItem(node),
    });
  }
  if (onEdit) {
    menuItems.push({
      kind: "item",
      id: "list-node-edit",
      label: "Edit",
      icon: Pencil,
      onSelect: () => onEdit(node),
    });
  }
  if (onDelete) {
    if (onEdit || onAddItem) {
      menuItems.push({ kind: "separator", id: "list-node-sep-delete" });
    }
    menuItems.push({
      kind: "item",
      id: "list-node-delete",
      label: "Delete",
      icon: Trash2,
      destructive: true,
      onSelect: () => onDelete(node),
    });
  }
  const extraSections: ContextMenuExtraSection[] =
    menuItems.length > 0
      ? [{ id: "list-node-actions", anchor: "after-clipboard", items: menuItems }]
      : [];

  return (
    <NonEditableContextMenu
      sourceFeature="user-lists"
      contextData={{ content: node.label }}
      extraSections={extraSections}
      enableFloatingIcon={false}
    >
        <div
          className={cn(
            "group relative flex items-center gap-1 rounded-md transition-colors cursor-pointer select-none",
            "border border-transparent",
            isActive && node.type === "list"
              ? "bg-accent border-l-2 border-l-primary border-r-0 border-t-0 border-b-0 rounded-l-none"
              : "hover:bg-accent/40",
            isDisabled && !isNavigating && "opacity-60",
          )}
          style={{ paddingLeft }}
        >
          {/* Expand toggle */}
          <div
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) onToggleExpand(node.id);
            }}
          >
            {hasChildren && (
              <ChevronRight
                className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            )}
          </div>

          <Link
            href={href}
            onClick={handleClick}
            className="flex-1 flex items-center gap-1.5 py-1.5 pr-1 min-w-0"
          >
            {isNavigating && node.type === "list" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
            ) : (
              <Icon
                className={cn(
                  "h-3.5 w-3.5 flex-shrink-0",
                  isActive && node.type === "list"
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              />
            )}

            <span
              className={cn(
                "text-sm truncate flex-1 min-w-0",
                isActive && node.type === "list"
                  ? "font-medium text-foreground"
                  : node.type === "group"
                    ? "text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    : "text-foreground/80",
              )}
            >
              {node.label}
            </span>

            {node.childCount !== undefined && node.type !== "item" && (
              <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground/50 font-mono">
                {node.childCount}
              </span>
            )}
          </Link>

          {/* Overflow menu (hover) */}
          {(onEdit || onDelete || onAddItem) && (
            <div
              className={cn(
                "flex-shrink-0 pr-1 transition-opacity",
                isActive && node.type === "list"
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 rounded-sm"
                    tabIndex={-1}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  {onInfo && (
                    <DropdownMenuItem onClick={() => onInfo(node)}>
                      <Info className="h-3.5 w-3.5 mr-2" />
                      View details
                    </DropdownMenuItem>
                  )}
                  {(node.type === "list" || node.type === "group") &&
                    onAddItem && (
                      <DropdownMenuItem onClick={() => onAddItem(node)}>
                        <Plus className="h-3.5 w-3.5 mr-2" />
                        Add item
                      </DropdownMenuItem>
                    )}
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(node)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {(onEdit || onAddItem) && onDelete && (
                    <DropdownMenuSeparator />
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(node)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
    </NonEditableContextMenu>
  );
}
