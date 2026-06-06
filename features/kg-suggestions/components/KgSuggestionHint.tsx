// features/kg-suggestions/components/KgSuggestionHint.tsx
//
// The reusable "you have suggestions here" attention cue, in three shapes:
//   - "dot"    → a tiny amber lightbulb pill (drop next to one item row).
//   - "badge"  → a count pill (drop on a table row / inline).
//   - "banner" → a full-width amber alert (drop atop a scope/section page).
//
// All three open the SAME popover of full decision cards (KgSuggestionRowItem),
// so a user gets the complete source → target → overwrite picture without
// leaving the page. Hidden entirely when there are no rows, so a clean surface
// stays clean. Rows + accept/reject/defer are passed in by the page-level
// useScopeSuggestions container — these hints never fetch on their own.

"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils/cn";
import { KgSuggestionRowItem } from "./KgSuggestionRowItem";
import type {
  KgAcceptResult,
  KgDecisionResponse,
  KgSuggestionRow,
} from "@/features/kg-suggestions/types";

export interface KgSuggestionHintProps {
  rows: KgSuggestionRow[];
  accept: (id: string) => Promise<KgAcceptResult>;
  reject: (id: string) => Promise<KgDecisionResponse>;
  defer: (id: string) => Promise<KgDecisionResponse>;
  variant?: "dot" | "badge" | "banner";
  /** Context noun for banner/aria text, e.g. the scope name. */
  label?: string;
  className?: string;
  align?: "start" | "center" | "end";
}

export function KgSuggestionHint({
  rows,
  accept,
  reject,
  defer,
  variant = "dot",
  label,
  className,
  align = "end",
}: KgSuggestionHintProps) {
  const [open, setOpen] = useState(false);
  const count = rows.length;
  if (count <= 0) return null;

  const noun = count === 1 ? "suggestion" : "suggestions";

  const trigger =
    variant === "banner" ? (
      <button
        type="button"
        aria-label={`${count} knowledge-graph ${noun}${label ? ` for ${label}` : ""}`}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left transition-colors hover:bg-amber-500/15",
          className,
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
          <Lightbulb className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-amber-800 dark:text-amber-200">
            {count} {noun} to review
            {label ? ` for ${label}` : ""}
          </span>
          <span className="block text-xs text-amber-700/80 dark:text-amber-300/70">
            The knowledge graph proposed filling some fields — review, accept,
            or snooze.
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300">
          Review
        </span>
      </button>
    ) : variant === "badge" ? (
      <button
        type="button"
        aria-label={`${count} knowledge-graph ${noun}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors",
          className,
        )}
      >
        <Lightbulb className="h-3 w-3" />
        <span className="tabular-nums">{count}</span>
        <span className="hidden sm:inline">{noun}</span>
      </button>
    ) : (
      <button
        type="button"
        aria-label={`${count} knowledge-graph ${noun}`}
        title={`${count} ${noun} to review`}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors",
          className,
        )}
      >
        <Lightbulb className="h-3 w-3" />
        <span className="tabular-nums">{count}</span>
      </button>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[26rem] max-w-[calc(100vw-2rem)] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-foreground">
            {count} {noun}
            {label ? ` for ${label}` : ""}
          </span>
        </div>
        <ScrollArea className="max-h-[28rem]">
          <div className="space-y-2 p-2">
            {rows.map((row) => (
              <KgSuggestionRowItem
                key={row.id}
                row={row}
                accept={accept}
                reject={reject}
                defer={defer}
              />
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default KgSuggestionHint;
