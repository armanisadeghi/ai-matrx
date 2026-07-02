// components/official/content-editor/ContentEditorTree.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  Circle,
  Dot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ContentEditorListItemState,
  ContentEditorListItem,
} from "./ContentEditorList";

export interface ContentEditorTreeNode extends ContentEditorListItem {
  /** If defined (even if empty), the node is a folder. */
  children?: ContentEditorTreeNode[];
  /** Optional: override the default folder/file icon for this node. */
  iconOpen?: React.ComponentType<{ className?: string }>;
}

export interface ContentEditorTreeProps {
  nodes: ContentEditorTreeNode[];

  activeId?: string;
  openIds?: string[];

  /** Controlled set of expanded folder ids. If omitted, state is internal. */
  expandedIds?: string[];
  defaultExpandedIds?: string[];
  onExpandedChange?: (ids: string[]) => void;

  onItemClick?: (id: string, state: ContentEditorListItemState) => void;
  onOpen?: (id: string) => void;
  onActivate?: (id: string) => void;

  title?: string;
  emptyMessage?: string;
  className?: string;
  /** Indentation per depth level in pixels. */
  indent?: number;
}

const leafStateIcon: Record<ContentEditorListItemState, React.ReactNode> = {
  active: (
    <Dot
      className="h-4 w-4 text-emerald-500 dark:text-emerald-400"
      strokeWidth={6}
    />
  ),
  open: (
    <Circle className="h-2 w-2 fill-blue-500 text-blue-500 dark:fill-blue-400 dark:text-blue-400" />
  ),
  closed: <Circle className="h-2 w-2 text-zinc-300 dark:text-zinc-600" />,
};

export function ContentEditorTree({
  nodes,
  activeId,
  openIds = [],
  expandedIds: controlledExpandedIds,
  defaultExpandedIds = [],
  onExpandedChange,
  onItemClick,
  onOpen,
  onActivate,
  title,
  emptyMessage = "No items",
  className,
  indent = 12,
}: ContentEditorTreeProps) {
  const [internalExpanded, setInternalExpanded] = useState<string[]>(
    () => defaultExpandedIds,
  );
  const expandedIds = controlledExpandedIds ?? internalExpanded;
  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);

  const toggleExpanded = useCallback(
    (id: string) => {
      const next = expandedSet.has(id)
        ? expandedIds.filter((x) => x !== id)
        : [...expandedIds, id];
      if (controlledExpandedIds === undefined) setInternalExpanded(next);
      onExpandedChange?.(next);
    },
    [expandedIds, expandedSet, controlledExpandedIds, onExpandedChange],
  );

  const getState = (id: string): ContentEditorListItemState => {
    if (id === activeId) return "active";
    if (openIds.includes(id)) return "open";
    return "closed";
  };

  const handleLeafClick = (node: ContentEditorTreeNode) => {
    const state = getState(node.id);
    if (onItemClick) {
      onItemClick(node.id, state);
      return;
    }
    if (state === "closed") onOpen?.(node.id);
    else onActivate?.(node.id);
  };

  const renderNode = (
    node: ContentEditorTreeNode,
    depth: number,
  ): React.ReactNode => {
    const children = node.children;
    const isFolder = children !== undefined;
    const isExpanded = expandedSet.has(node.id);
    const state = getState(node.id);
    const leafIcon = node.icon ?? FileText;
    const folderIcon = isExpanded
      ? (node.iconOpen ?? FolderOpen)
      : (node.icon ?? Folder);

    if (isFolder) {
      return (
        <React.Fragment key={node.id}>
          <li>
            <button
              type="button"
              onClick={() => toggleExpanded(node.id)}
              className="group w-full flex items-center gap-1 py-1 text-xs text-left transition-colors text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              style={{ paddingLeft: 8 + depth * indent }}
              title={node.description ?? node.title}
            >
              <span className="flex-none flex items-center justify-center w-4">
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-zinc-500" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-zinc-500" />
                )}
              </span>
              {React.createElement(folderIcon, {
                className:
                  "h-3.5 w-3.5 flex-none text-amber-500 dark:text-amber-400",
              })}
              <span className="flex-1 truncate pr-2 font-medium">
                {node.title}
              </span>
            </button>
          </li>
          {isExpanded &&
            children.map((child) => renderNode(child, depth + 1))}
        </React.Fragment>
      );
    }

    return (
      <li key={node.id}>
        <button
          type="button"
          role="option"
          aria-selected={state === "active"}
          onClick={() => handleLeafClick(node)}
          className={cn(
            "group w-full flex items-center gap-2 py-1 text-xs text-left transition-colors border-l-2",
            state === "active" &&
              "bg-zinc-100 dark:bg-zinc-800 border-l-emerald-500 text-zinc-900 dark:text-zinc-100",
            state === "open" &&
              "bg-transparent border-l-blue-500/60 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
            state === "closed" &&
              "bg-transparent border-l-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 hover:text-zinc-800 dark:hover:text-zinc-200",
          )}
          style={{ paddingLeft: 8 + depth * indent }}
          title={node.description ?? node.title}
        >
          <span className="flex-none flex items-center justify-center w-4">
            {leafStateIcon[state]}
          </span>
          {React.createElement(leafIcon, {
            className: cn(
              "h-3.5 w-3.5 flex-none",
              state === "active"
                ? "text-zinc-700 dark:text-zinc-200"
                : state === "open"
                  ? "text-zinc-600 dark:text-zinc-400"
                  : "text-zinc-400 dark:text-zinc-500",
            ),
          })}
          <span
            className={cn(
              "flex-1 truncate pr-2",
              state === "active" && "font-medium",
            )}
          >
            {node.title}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-white dark:bg-zinc-900 border border-border rounded-lg overflow-hidden",
        className,
      )}
    >
      {title && (
        <div className="flex-none px-3 py-2 border-b border-border bg-zinc-50 dark:bg-zinc-900/60">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {title}
          </div>
        </div>
      )}
      {nodes.length === 0 ? (
        <div className="px-3 py-4 text-xs text-zinc-500 dark:text-zinc-400">
          {emptyMessage}
        </div>
      ) : (
        <ul role="tree" className="flex flex-col py-1">
          {nodes.map((n) => renderNode(n, 0))}
        </ul>
      )}
    </div>
  );
}

/** Walks a tree and returns a flat array of leaf nodes. */
export function flattenTreeLeaves(
  nodes: ContentEditorTreeNode[],
): ContentEditorTreeNode[] {
  const out: ContentEditorTreeNode[] = [];
  const walk = (ns: ContentEditorTreeNode[]) => {
    for (const n of ns) {
      if (n.children === undefined) out.push(n);
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Returns the ids of all ancestor folders for a given leaf id. */
export function findAncestorIds(
  nodes: ContentEditorTreeNode[],
  targetId: string,
): string[] {
  const path: string[] = [];
  const visit = (ns: ContentEditorTreeNode[], trail: string[]): boolean => {
    for (const n of ns) {
      if (n.id === targetId) {
        path.push(...trail);
        return true;
      }
      if (n.children && visit(n.children, [...trail, n.id])) return true;
    }
    return false;
  };
  visit(nodes, []);
  return path;
}
