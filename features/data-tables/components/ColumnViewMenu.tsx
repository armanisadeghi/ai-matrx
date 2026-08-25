/**
 * ColumnViewMenu — which columns this VIEW shows, and in what order.
 *
 * 🚨 PER-VIEW, NOT PER-TABLE. Hiding or reordering here changes only what YOU
 * are looking at; it never touches `udt_dataset_fields.field_order`, which is
 * the table's shared default and belongs to everyone who opens it. Table
 * Settings still owns that. Two people can hold two different views of the same
 * table at the same time, and neither disturbs the other.
 *
 * That distinction is the whole reason this control exists separately from the
 * one in Table Settings, so do not "simplify" them together.
 *
 * The state lives in the URL (`hide` / `ord`), so a view with three columns
 * hidden and the rest reordered survives a refresh and travels in a link.
 */
"use client";

import { useState } from "react";
import {
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { resolveViewColumns } from "../table-view-url";

type Field = { field_name: string; display_name: string; field_order: number };

type Props = {
  fields: Field[];
  hidden: string[];
  order: string[];
  onHiddenChange: (next: string[]) => void;
  onOrderChange: (next: string[]) => void;
};

export function ColumnViewMenu({
  fields,
  hidden,
  order,
  onHiddenChange,
  onOrderChange,
}: Props) {
  const [dragging, setDragging] = useState<string | null>(null);

  // Every column in view order — INCLUDING hidden ones, because this is the
  // control where you turn them back on. `resolveViewColumns` is reused with an
  // empty mask so ordering logic lives in exactly one place.
  const ordered = resolveViewColumns(fields, { hidden: [], order });
  const hiddenSet = new Set(hidden);
  const visibleCount = ordered.length - hidden.length;
  const customized = hidden.length > 0 || order.length > 0;

  const move = (from: string, to: string) => {
    if (from === to) return;
    const names = ordered.map((f) => f.field_name);
    const fromIndex = names.indexOf(from);
    const toIndex = names.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return;
    names.splice(toIndex, 0, ...names.splice(fromIndex, 1));
    onOrderChange(names);
  };

  const toggle = (name: string) => {
    // The last visible column may not be hidden — an empty grid looks broken
    // and gives the user nothing to click to recover.
    if (!hiddenSet.has(name) && visibleCount <= 1) return;
    onHiddenChange(
      hiddenSet.has(name) ? hidden.filter((h) => h !== name) : [...hidden, name],
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 gap-1.5 px-2 text-xs", customized && "text-primary")}
          title="Choose and reorder columns for this view"
        >
          <Columns3 className="h-3.5 w-3.5" />
          Columns
          {hidden.length > 0 && (
            <span className="tabular-nums text-muted-foreground">
              {visibleCount}/{ordered.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-xs font-medium text-foreground">
            Columns in this view
          </p>
          {customized && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
              onClick={() => {
                onHiddenChange([]);
                onOrderChange([]);
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>

        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {ordered.map((field) => {
            const isHidden = hiddenSet.has(field.field_name);
            const isLastVisible = !isHidden && visibleCount <= 1;
            return (
              <div
                key={field.field_name}
                draggable
                onDragStart={() => setDragging(field.field_name)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging) move(dragging, field.field_name);
                  setDragging(null);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm",
                  "hover:bg-muted/60",
                  dragging === field.field_name && "opacity-40",
                )}
              >
                <GripVertical
                  className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/60"
                  aria-hidden
                />
                <Checkbox
                  checked={!isHidden}
                  disabled={isLastVisible}
                  onCheckedChange={() => toggle(field.field_name)}
                  aria-label={`Show ${field.display_name}`}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    isHidden && "text-muted-foreground line-through",
                  )}
                  title={
                    isLastVisible
                      ? "A view needs at least one column"
                      : field.display_name
                  }
                >
                  {field.display_name}
                </span>
                {isHidden ? (
                  <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                ) : (
                  <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                )}
              </div>
            );
          })}
        </div>

        <p className="px-1.5 pt-2 text-[11px] leading-snug text-muted-foreground">
          Drag to reorder. This affects only your view — it does not change the
          table for anyone else.
        </p>
      </PopoverContent>
    </Popover>
  );
}
