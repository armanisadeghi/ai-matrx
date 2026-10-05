// components/official/content-editor/ContentEditorList.tsx
"use client";

import React from "react";
import { FileText, Circle, Dot } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContentEditorListItemState = "active" | "open" | "closed";

export interface ContentEditorListItem {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface ContentEditorListProps {
  items: ContentEditorListItem[];

  /** Id of the currently active (focused) item. */
  activeId?: string;
  /** Ids of items that are "open" but not active. */
  openIds?: string[];

  /** Fires when a closed item should be opened (and usually activated). */
  onOpen?: (id: string) => void;
  /** Fires when an open item should become active. */
  onActivate?: (id: string) => void;
  /** Unified click handler — if provided, overrides onOpen/onActivate. */
  onItemClick?: (id: string, state: ContentEditorListItemState) => void;

  title?: string;
  emptyMessage?: string;
  className?: string;
}

const stateIcon: Record<ContentEditorListItemState, React.ReactNode> = {
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

export function ContentEditorList({
  items,
  activeId,
  openIds = [],
  onOpen,
  onActivate,
  onItemClick,
  title,
  emptyMessage = "No items",
  className,
}: ContentEditorListProps) {
  const getState = (id: string): ContentEditorListItemState => {
    if (id === activeId) return "active";
    if (openIds.includes(id)) return "open";
    return "closed";
  };

  const handleClick = (item: ContentEditorListItem) => {
    const state = getState(item.id);
    if (onItemClick) {
      onItemClick(item.id, state);
      return;
    }
    if (state === "closed") onOpen?.(item.id);
    else onActivate?.(item.id);
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
          <div className="type-secondary font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {title}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="px-3 py-4 type-secondary text-zinc-500 dark:text-zinc-400">
          {emptyMessage}
        </div>
      ) : (
        <ul role="list" className="flex flex-col py-1">
          {items.map((item) => {
            const state = getState(item.id);
            const Icon = item.icon ?? FileText;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={state === "active"}
                  onClick={() => handleClick(item)}
                  className={cn(
                    "group w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors border-l-2",
                    state === "active" &&
                      "bg-zinc-100 dark:bg-zinc-800 border-l-emerald-500 text-zinc-900 dark:text-zinc-100",
                    state === "open" &&
                      "bg-transparent border-l-blue-500/60 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                    state === "closed" &&
                      "bg-transparent border-l-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 hover:text-zinc-800 dark:hover:text-zinc-200",
                  )}
                  title={item.description ?? item.title}
                >
                  <span className="flex-none flex items-center justify-center w-4">
                    {stateIcon[state]}
                  </span>
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 flex-none",
                      state === "active"
                        ? "text-zinc-700 dark:text-zinc-200"
                        : state === "open"
                          ? "text-zinc-600 dark:text-zinc-400"
                          : "text-zinc-400 dark:text-zinc-500",
                    )}
                  />
                  <span
                    className={cn(
                      "flex-1 truncate",
                      state === "active" && "font-medium",
                    )}
                  >
                    {item.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
