"use client";

import { ArrowDownUp, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TranscriptSortKey =
  | "updated"
  | "created"
  | "title"
  | "duration"
  | "words";

const SORT_OPTIONS: { value: TranscriptSortKey; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "title", label: "Title (A→Z)" },
  { value: "duration", label: "Longest first" },
  { value: "words", label: "Most words" },
];

interface TranscriptsSortMenuProps {
  sortKey: TranscriptSortKey;
  onSortChange: (key: TranscriptSortKey) => void;
}

export function TranscriptsSortMenu({
  sortKey,
  onSortChange,
}: TranscriptsSortMenuProps) {
  const activeLabel =
    SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? "Sort";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Sort: ${activeLabel}`}
          title={`Sort: ${activeLabel}`}
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground lg:h-8 lg:w-8"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {SORT_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onSortChange(opt.value)}
            className="flex items-center justify-between gap-2"
          >
            <span>{opt.label}</span>
            {sortKey === opt.value ? (
              <Check className="h-3.5 w-3.5 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
