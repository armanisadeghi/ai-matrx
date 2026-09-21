"use client";

/**
 * TableLayoutMenu — how THIS view uses the screen: fit-to-width or natural
 * widths, row height, and a frozen first column. Every choice is part of the
 * view (URL + saved view), never a table property, for the same reason hidden
 * columns are: your layout must not change a colleague's.
 *
 * The platform decides a default (`auto`: share the width up to eight columns,
 * natural widths + sideways scroll past that) and the user overrides it here.
 * Champion: Airtable's row-height + field-width controls, Sheets' freeze.
 */

import { LayoutPanelTop, Rows3, Snowflake, Undo2, WrapText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import type { TableLayoutMode, TableRowDensity } from "../table-view-url";

type Props = {
  layoutMode: TableLayoutMode;
  /** What `auto` currently resolves to, so the menu can say it. */
  autoResolvesTo: "fit" | "scroll";
  onLayoutModeChange: (next: TableLayoutMode) => void;
  rowDensity: TableRowDensity;
  onRowDensityChange: (next: TableRowDensity) => void;
  freezeFirstColumn: boolean;
  onFreezeFirstColumnChange: (next: boolean) => void;
  wrapText: boolean;
  onWrapTextChange: (next: boolean) => void;
  /** How many columns carry a dragged width; 0 hides the reset. */
  customWidthCount: number;
  onResetColumnWidths: () => void;
  className?: string;
};

const LAYOUTS: { id: TableLayoutMode; label: string; hint: string }[] = [
  { id: "auto", label: "Automatic", hint: "Fit up to eight columns, then scroll" },
  { id: "fit", label: "Fit to width", hint: "Share the width; nothing scrolls sideways" },
  { id: "scroll", label: "Natural widths", hint: "Each column its own width; scroll sideways" },
];

const DENSITIES: { id: TableRowDensity; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "normal", label: "Normal" },
  { id: "tall", label: "Tall" },
];

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-1 rounded-md bg-muted/50 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          title={o.hint}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded px-2 py-1 text-xs transition-colors",
            value === o.id
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TableLayoutMenu({
  layoutMode,
  autoResolvesTo,
  onLayoutModeChange,
  rowDensity,
  onRowDensityChange,
  freezeFirstColumn,
  onFreezeFirstColumnChange,
  wrapText,
  onWrapTextChange,
  customWidthCount,
  onResetColumnWidths,
  className,
}: Props) {
  const customized =
    layoutMode !== "auto" ||
    rowDensity !== "normal" ||
    freezeFirstColumn ||
    wrapText ||
    customWidthCount > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-7 gap-1.5 px-2 text-xs", className)}
          title="Layout: column widths, row height, frozen column"
        >
          <LayoutPanelTop className="h-3.5 w-3.5" />
          Layout
          {customized && (
            <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary" aria-label="Layout customized" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Column widths</Label>
          <Segmented
            ariaLabel="Column widths"
            value={layoutMode}
            options={LAYOUTS}
            onChange={onLayoutModeChange}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            {layoutMode === "auto"
              ? `Right now: ${autoResolvesTo === "fit" ? "fitting the width" : "natural widths, scrolling sideways"}.`
              : LAYOUTS.find((l) => l.id === layoutMode)?.hint}{" "}
            Drag a column's right edge to set its width; double-click the edge to reset it.
          </p>
          {customWidthCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-2 px-1.5 text-xs font-normal"
              onClick={onResetColumnWidths}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Reset {customWidthCount === 1 ? "the dragged column width" : `${customWidthCount} dragged column widths`}
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Rows3 className="h-3.5 w-3.5" />
            Row height
          </Label>
          <Segmented
            ariaLabel="Row height"
            value={rowDensity}
            options={DENSITIES}
            onChange={onRowDensityChange}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="freeze-first-column" className="flex items-center gap-1.5 text-xs">
            <Snowflake className="h-3.5 w-3.5" />
            Freeze first column
          </Label>
          <Switch
            id="freeze-first-column"
            checked={freezeFirstColumn}
            onCheckedChange={onFreezeFirstColumnChange}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="wrap-cell-text" className="flex items-center gap-1.5 text-xs">
            <WrapText className="h-3.5 w-3.5" />
            Wrap text
          </Label>
          <Switch
            id="wrap-cell-text"
            checked={wrapText}
            onCheckedChange={onWrapTextChange}
          />
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          These affect only your view — save the view to keep them, or share
          the link.
        </p>
      </PopoverContent>
    </Popover>
  );
}

export default TableLayoutMenu;
