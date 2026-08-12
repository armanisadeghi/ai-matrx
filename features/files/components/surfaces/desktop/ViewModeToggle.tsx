/**
 * features/files/components/surfaces/dropbox/ViewModeToggle.tsx
 *
 * Grid / List / Columns view switcher — reads from and writes to the shared
 * `cloudFiles.ui.viewMode` redux state.
 */

"use client";

import { Grid3x3, List } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectViewMode } from "@/features/files/redux/selectors";
import { setViewMode } from "@/features/files/redux/slice";
import type { ViewMode } from "@/features/files/types";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";

// `columns` is intentionally omitted — there's no Columns view renderer in
// PageShell, so showing the icon previously did nothing on click. Re-enable
// once a Miller-columns view ships.
const OPTIONS: { mode: ViewMode; icon: LucideIcon; label: string }[] = [
  { mode: "list", icon: List, label: "List view" },
  { mode: "grid", icon: Grid3x3, label: "Grid view" },
];

/**
 * The view modes actually RENDERED in the toggle — derived from `OPTIONS` so it
 * can never drift from what the user can click. Deliberately NARROWER than the
 * `ViewMode` type (which still carries "columns", a mode with no renderer and
 * no button). Exported because the `matrx-user/files` write target `view_mode`
 * validates against this list: an agent may only pick a mode the user can put
 * back with one click.
 */
export const VIEW_MODE_VALUES: ReadonlyArray<ViewMode> = OPTIONS.map(
  (o) => o.mode,
);

export interface ViewModeToggleProps {
  className?: string;
}

export function ViewModeToggle({ className }: ViewModeToggleProps) {
  const dispatch = useAppDispatch();
  const viewMode = useAppSelector(selectViewMode);
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className={cn(
        "inline-flex items-center rounded-md border bg-background p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ mode, icon: Icon, label }) => {
        const active = viewMode === mode;
        return (
          <TooltipIcon key={mode} label={label}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              onClick={() => dispatch(setViewMode(mode))}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipIcon>
        );
      })}
    </div>
  );
}
