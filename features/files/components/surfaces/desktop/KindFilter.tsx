/**
 * features/files/components/surfaces/desktop/KindFilter.tsx
 *
 * Segmented control: Files / Folders / Both. Sits next to the FilterChips
 * row above the file table and lets users hide one kind without leaving
 * the current folder. Pure presentational — state lives with the host.
 */

"use client";

import { File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";

export type KindFilter = "all" | "files" | "folders";

export interface KindFilterProps {
  value: KindFilter;
  onChange: (next: KindFilter) => void;
  className?: string;
}

const OPTIONS: ReadonlyArray<{
  value: KindFilter;
  label: string;
  icon: typeof File;
  tip: string;
}> = [
  { value: "all", label: "Both", icon: FolderOpen, tip: "Show files and folders" },
  { value: "folders", label: "Folders", icon: Folder, tip: "Show folders only" },
  { value: "files", label: "Files", icon: File, tip: "Show files only" },
];

/**
 * The kind-filter values actually RENDERED in the segmented control — derived
 * from `OPTIONS` so it can never drift from what the user can click. Exported
 * because the `matrx-user/files` write target `kind_filter` validates against
 * this exact list.
 */
export const KIND_FILTER_VALUES: ReadonlyArray<KindFilter> = OPTIONS.map(
  (o) => o.value,
);

export function KindFilter({ value, onChange, className }: KindFilterProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Show"
      className={cn(
        "inline-flex items-center rounded-md border bg-background p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value: v, label, icon: Icon, tip }) => {
        const active = value === v;
        return (
          <TooltipIcon key={v} label={tip}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              onClick={() => onChange(v)}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          </TooltipIcon>
        );
      })}
    </div>
  );
}
