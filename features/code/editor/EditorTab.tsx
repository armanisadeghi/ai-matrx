"use client";

import React from "react";
import { Database, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileIcon } from "../styles/file-icon";
import { getAdapterForTabId } from "../library-sources/registry";
import { hasRenderPreviewerForTabId } from "../preview/renderPreviewRegistry";

export interface EditorTabProps {
  id: string;
  name: string;
  path?: string;
  active: boolean;
  dirty?: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onMiddleClick?: (id: string) => void;
  onOpenPreview?: (id: string) => void;
}

export const EditorTab: React.FC<EditorTabProps> = ({
  id,
  name,
  path,
  active,
  dirty,
  onSelect,
  onClose,
  onMiddleClick,
  onOpenPreview,
}) => {
  const sourceAdapter = getAdapterForTabId(id);
  const sourceLabel = sourceAdapter
    ? `Single source of truth — saves write back to ${sourceAdapter.label}`
    : null;
  const canPreview = onOpenPreview ? hasRenderPreviewerForTabId(id) : false;
  return (
    <div
      role="tab"
      data-tab-id={id}
      title={path}
      aria-selected={active}
      tabIndex={0}
      onClick={() => onSelect(id)}
      onAuxClick={(e) => {
        if (e.button === 1) onMiddleClick?.(id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
      className={cn(
        "group flex h-9 shrink-0 cursor-pointer select-none items-center gap-2 border-r border-neutral-200 px-3 text-[13px] dark:border-neutral-800",
        active
          ? "bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/70",
      )}
    >
      <FileIcon name={name} kind="file" size={14} />
      <span className="max-w-[180px] truncate">{name}</span>
      {sourceLabel ? (
        <span
          title={sourceLabel}
          aria-label={sourceLabel}
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded text-emerald-600 dark:text-emerald-400",
            !active && "opacity-70",
          )}
        >
          <Database size={11} aria-hidden />
        </span>
      ) : null}
      {canPreview ? (
        <button
          type="button"
          aria-label="Open live preview"
          title="Open live preview"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPreview?.(id);
          }}
          className={cn(
            "ml-1 flex h-4 w-4 items-center justify-center rounded text-neutral-500 hover:bg-neutral-300 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-neutral-100",
            !active && "opacity-0 group-hover:opacity-100",
          )}
        >
          <Eye size={12} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={dirty ? "Close (unsaved changes)" : "Close"}
        onClick={(e) => {
          e.stopPropagation();
          onClose(id);
        }}
        className={cn(
          "ml-1 flex h-4 w-4 items-center justify-center rounded text-neutral-500 hover:bg-neutral-300 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-neutral-100",
          !active && !dirty && "opacity-0 group-hover:opacity-100",
        )}
      >
        {dirty ? (
          <span
            className="inline-block h-2 w-2 rounded-full bg-neutral-500 dark:bg-neutral-300"
            aria-hidden
          />
        ) : (
          <X size={12} />
        )}
      </button>
    </div>
  );
};
