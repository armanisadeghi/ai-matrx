"use client";

import React from "react";
import { Stars, Plus, Library } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  generateLabel?: string;
  onGenerate?: () => void;
  browseLabel?: string;
  onBrowse?: () => void;
  showAddButton?: boolean;
  onAdd?: () => void;
}

export function SectionToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Type to search...",
  generateLabel,
  onGenerate,
  browseLabel,
  onBrowse,
  showAddButton,
  onAdd,
}: SectionToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 shrink-0">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className={cn(
          "flex-1 h-8 px-3 text-sm rounded-md",
          "bg-background border border-border",
          "text-foreground placeholder:text-muted-foreground/70",
          "focus:outline-none focus:ring-1 focus:ring-ring",
        )}
      />
      {browseLabel && onBrowse && (
        <button
          type="button"
          onClick={onBrowse}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm",
            "bg-background border border-border text-foreground",
            "hover:bg-accent transition-colors",
          )}
        >
          <Library className="h-3.5 w-3.5" />
          {browseLabel}
        </button>
      )}
      {/* A button with no handler is a dead end — it renders only when wired. */}
      {generateLabel && onGenerate && (
        <button
          type="button"
          onClick={onGenerate}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium shadow-sm",
            "bg-sky-600 hover:bg-sky-500 text-white transition-colors",
          )}
        >
          <Stars className="h-3.5 w-3.5" />
          {generateLabel}
        </button>
      )}
      {showAddButton && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add new"
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-md",
            "bg-background border border-border text-foreground",
            "hover:bg-accent transition-colors",
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default SectionToolbar;
