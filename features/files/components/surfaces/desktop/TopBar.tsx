/**
 * features/files/components/surfaces/dropbox/TopBar.tsx
 *
 * Top app bar for the Dropbox shell. Holds the "+ New" button and a wide
 * search input. Intentionally minimal — the app's global header still
 * renders outside this surface, so we don't duplicate brand or user menu
 * here.
 *
 * The search box is a `ProInput` (the canonical full-feature single-line
 * input): voice dictation, copy, and a clear (×) control come for free.
 */

"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProInput } from "@/components/official/ProInput";
import { NewMenu } from "./NewMenu";

export interface TopBarProps {
  parentFolderId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  className?: string;
}

export function TopBar({
  parentFolderId,
  searchQuery,
  onSearchChange,
  className,
}: TopBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 bg-background px-4 py-2 pr-16 shrink-0",
        className,
      )}
    >
      <NewMenu parentFolderId={parentFolderId} />
      <ProInput
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onClear={() => onSearchChange("")}
        placeholder="Search files and folders"
        aria-label="Search files and folders"
        clearable
        startIcon={<Search className="h-4 w-4" aria-hidden="true" />}
        wrapperClassName="flex-1"
        className="rounded-full border bg-muted/40"
      />
    </div>
  );
}
