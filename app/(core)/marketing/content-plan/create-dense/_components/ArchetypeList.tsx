"use client";

/**
 * Level 0 of the console: pick the site shape. Four rows, each carrying its
 * own page estimate, family keys and core-page count — enough to choose
 * without opening anything.
 */
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Archetype } from "../_lib/archetypes";

export function ArchetypeList({
  archetypes,
  selectedKey,
  committedKey,
  onSelect,
}: {
  archetypes: Archetype[];
  selectedKey: string | null;
  committedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-col">
      {archetypes.map((archetype) => {
        const isSelected = archetype.key === selectedKey;
        const isCommitted = archetype.key === committedKey;
        const totalDeclared = archetype.families.reduce(
          (sum, family) => sum + family.count,
          0,
        );
        return (
          <button
            key={archetype.key}
            type="button"
            onClick={() => onSelect(archetype.key)}
            className={cn(
              "group flex w-full flex-col gap-1 border-b border-border px-2.5 py-2 text-left transition-colors",
              isSelected
                ? "bg-accent ring-1 ring-inset ring-primary/40"
                : "hover:bg-accent/50",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {archetype.label}
              </span>
              {isCommitted ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                  committed
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted-foreground">
              <span className="whitespace-nowrap font-mono">
                {archetype.pageEstimate || "—"} pages
              </span>
              <span className="whitespace-nowrap">
                {archetype.core.length} core
                {archetype.families.length > 0
                  ? ` · ${archetype.families.length} famil${
                      archetype.families.length === 1 ? "y" : "ies"
                    } (${totalDeclared})`
                  : ""}
              </span>
            </div>
            <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
              {archetype.description || "No description."}
            </p>
          </button>
        );
      })}
    </div>
  );
}
