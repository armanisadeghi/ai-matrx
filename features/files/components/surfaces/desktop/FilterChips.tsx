/**
 * features/files/components/surfaces/dropbox/FilterChips.tsx
 *
 * "Recents" and "Starred" pill chips shown above the file table. Toggling a
 * chip rewrites the URL or calls the supplied handler — the shell owns
 * the state.
 */

"use client";

import { Clock, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChipFilter } from "@/features/files/types";

/**
 * Re-export of the canonical `ChipFilter` type from features/files/types
 * so existing import sites that read `FilterChipKey` from this module
 * keep compiling. New code should prefer `ChipFilter` directly.
 *
 * @deprecated Use `ChipFilter` from `@/features/files/types`.
 */
export type FilterChipKey = ChipFilter;

export interface FilterChipsProps {
  active: FilterChipKey | null;
  onToggle: (key: FilterChipKey) => void;
  className?: string;
}

const CHIPS: { key: FilterChipKey; label: string; icon: LucideIcon }[] = [
  { key: "recents", label: "Recents", icon: Clock },
  { key: "starred", label: "Starred", icon: Star },
];

/**
 * The chip keys actually RENDERED above the file table — derived from `CHIPS`
 * so it can never drift from what the user can click. Exported because the
 * `matrx-user/files` write target `chip_filter` validates against this exact
 * list: an agent may only set a chip the user can un-set with the matching
 * on-screen pill.
 */
export const CHIP_FILTER_KEYS: ReadonlyArray<FilterChipKey> = CHIPS.map(
  (c) => c.key,
);

export function FilterChips({ active, onToggle, className }: FilterChipsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {CHIPS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              isActive
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-background text-foreground hover:bg-accent",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
