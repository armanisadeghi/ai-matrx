"use client";

/**
 * ExportMenu — the "Export" dropdown for any data surface. Prefer passing
 * its items through `CopyButtons export={{ items }}` so it joins the unified
 * menu. Standalone use is for surfaces that export without any copy action.
 * Each item downloads a file built at click time (JSON, CSV, payload text…).
 *
 * Pass `sheetRows` and the menu also offers "Send to Google Sheet" — the same
 * rows, landing in the user's own Drive instead of their downloads folder,
 * through the ONE canonical `features/google-workspace` path. A download and a
 * Sheet are the same intent with a different destination, so they belong in the
 * same menu; every surface that already exports rows gains the destination by
 * passing the data it already has.
 */

import { Download, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  copyActionCellClass,
  copyActionSegmentClass,
  type CopyActionAppearance,
  type CopyActionSize,
} from "@/components/agent-copy/CopyActionGroup";
import type { ExportItem } from "@/components/agent-copy/export";
import { useExportActions } from "@/components/agent-copy/useExportActions";
import { cn } from "@/lib/utils";

export interface ExportMenuProps {
  /** Filename base + toast label, e.g. "backlinks-aimatrx" / "Stored backlinks". */
  label: string;
  items: ExportItem[];
  /** "icon" = icon-only trigger (toolbars); "sm" = icon + "Export" text. */
  size?: CopyActionSize | "sm";
  appearance?: CopyActionAppearance;
  /**
   * Fill one legacy grouped slot. Icon-only — the visible "Export" label is
   * not used in a group.
   */
  grouped?: boolean;
  disabled?: boolean;
  className?: string;
  /**
   * Tabular rows for the "Send to Google Sheet" destination. Same shape
   * `csvExportItem` takes. Omit it and the destination is not offered.
   */
  sheetRows?: () => Array<Record<string, unknown>>;
}

export function ExportMenu({
  label,
  items,
  size = "icon",
  appearance = "segmented",
  grouped = false,
  disabled = false,
  className,
  sheetRows,
}: ExportMenuProps) {
  const { runExportItem, sendToSheet, sendingToSheet } = useExportActions({
    label,
    sheetRows,
  });
  if (!items.length && !sheetRows) return null;
  const groupSize = size === "sm" && !grouped ? "sm" : size;
  const isIcon = grouped || size !== "sm";

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={isIcon ? "icon" : "sm"}
          className={
            grouped
              ? copyActionSegmentClass(
                  groupSize === "sm" ? "sm" : groupSize,
                  appearance,
                )
              : isIcon
                ? cn(
                    "h-11 w-11 shrink-0 lg:h-7 lg:w-7",
                    appearance === "bare" &&
                      "bg-transparent hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent focus-visible:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 active:bg-transparent data-[state=open]:bg-transparent",
                    className,
                  )
                : className
          }
          disabled={disabled}
          aria-label={`Export ${label}`}
          title={`Export ${label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Download className={isIcon ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {!isIcon && <span className="ml-1">Export</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => void runExportItem(item)}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
        {sheetRows && (
          <DropdownMenuItem
            key="google-sheet"
            disabled={sendingToSheet}
            onSelect={(event) => {
              event.preventDefault();
              void sendToSheet();
            }}
          >
            <Table2 className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {sendingToSheet ? "Creating Google Sheet…" : "Send to Google Sheet"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!grouped) return menu;

  return (
    <span
      className={copyActionCellClass(groupSize === "sm" ? "sm" : groupSize)}
    >
      {menu}
    </span>
  );
}
