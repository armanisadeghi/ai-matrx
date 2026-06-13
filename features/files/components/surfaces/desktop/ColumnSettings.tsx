/**
 * features/files/components/surfaces/desktop/ColumnSettings.tsx
 *
 * "Choose columns" gear-icon dropdown rendered at the right edge of the
 * file-table header. Toggles individual columns on/off through Redux
 * (`cloudFiles.ui.visibleColumns`); a "Reset to defaults" pill restores
 * the Box.com / Drive-style default column set.
 *
 * Inspired by the column-management UI on Box.com and Google Drive's
 * advanced search results — a single discoverable affordance that doesn't
 * clutter the table header until the user opens it.
 */

"use client";

import { useMemo } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectVisibleColumns } from "@/features/files/redux/selectors";
import {
  resetColumnVisibility,
  setColumnVisibility,
} from "@/features/files/redux/slice";
import {
  DEFAULT_VISIBLE_COLUMNS,
  type ColumnId,
  type VisibleColumns,
} from "@/features/files/types";

interface ColumnSpec {
  id: ColumnId;
  label: string;
  /** When true, the toggle is rendered as locked (always shown). */
  locked?: boolean;
}

const COLUMN_SPECS: ReadonlyArray<ColumnSpec> = [
  { id: "name", label: "Name", locked: true },
  { id: "type", label: "Type" },
  { id: "extension", label: "Extension" },
  { id: "mime", label: "MIME" },
  { id: "path", label: "Location" },
  { id: "owner", label: "Owner" },
  { id: "size", label: "Size" },
  { id: "version", label: "Version" },
  { id: "updated_at", label: "Last modified" },
  { id: "created_at", label: "Created" },
  { id: "access", label: "Access" },
  { id: "context", label: "Context" },
  { id: "rag_status", label: "RAG status" },
];

export interface ColumnSettingsProps {
  className?: string;
}

export function ColumnSettings({ className }: ColumnSettingsProps) {
  const dispatch = useAppDispatch();
  const visible = useAppSelector(selectVisibleColumns);

  const isDefault = useMemo(
    () => sameColumns(visible, DEFAULT_VISIBLE_COLUMNS),
    [visible],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Column settings"
          title="Column settings"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
            !isDefault && "text-primary",
            className,
          )}
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Columns</span>
          {!isDefault ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dispatch(resetColumnVisibility());
              }}
              className="text-[10px] font-medium text-primary normal-case tracking-normal hover:underline"
            >
              Reset
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto px-1 py-1">
          {COLUMN_SPECS.map((spec) => {
            const checked = visible[spec.id] ?? false;
            const disabled = spec.locked;
            return (
              <button
                key={spec.id}
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (disabled) return;
                  dispatch(
                    setColumnVisibility({
                      column: spec.id,
                      visible: !checked,
                    }),
                  );
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent",
                  checked && "bg-accent/60",
                  disabled && "opacity-60 cursor-not-allowed",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  aria-label={spec.label}
                  className="pointer-events-none"
                  tabIndex={-1}
                />
                <span className="flex-1 truncate font-medium text-foreground">
                  {spec.label}
                </span>
                {disabled ? (
                  <span className="text-[10px] text-muted-foreground">
                    Always
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function sameColumns(a: VisibleColumns, b: VisibleColumns): boolean {
  const keys = Object.keys(a) as ColumnId[];
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
