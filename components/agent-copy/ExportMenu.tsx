"use client";

/**
 * ExportMenu — the "Export" dropdown for any data surface. Prefer passing
 * its items through `CopyButtons export={{ items }}` so it sits in the
 * even-width group. Standalone use is for surfaces that export without copy.
 * Each item downloads a file built at click time (JSON, CSV, payload text…).
 *
 * Pass `sheetRows` and the menu also offers "Send to Google Sheet" — the same
 * rows, landing in the user's own Drive instead of their downloads folder,
 * through the ONE canonical `features/google-workspace` path. A download and a
 * Sheet are the same intent with a different destination, so they belong in the
 * same menu; every surface that already exports rows gains the destination by
 * passing the data it already has.
 */

import { useState } from "react";
import { Download, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import {
  copyActionCellClass,
  copyActionSegmentClass,
  type CopyActionSize,
} from "@/components/agent-copy/CopyActionGroup";
import {
  downloadFile,
  exportFilename,
  type ExportItem,
} from "@/components/agent-copy/export";

export interface ExportMenuProps {
  /** Filename base + toast label, e.g. "backlinks-aimatrx" / "Stored backlinks". */
  label: string;
  items: ExportItem[];
  /** "icon" = icon-only trigger (toolbars); "sm" = icon + "Export" text. */
  size?: CopyActionSize | "sm";
  /**
   * Fill one even-width slot inside {@link CopyActionGroup}. Icon-only —
   * the visible "Export" label is not used in a group.
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
  grouped = false,
  disabled = false,
  className,
  sheetRows,
}: ExportMenuProps) {
  const [sendingToSheet, setSendingToSheet] = useState(false);
  if (!items.length && !sheetRows) return null;
  const groupSize = size === "sm" && !grouped ? "sm" : size;
  const isIcon = grouped || size !== "sm";

  const handle = (item: ExportItem) => {
    if (item.onSelect) {
      item.onSelect();
      return;
    }
    if (!item.build) return;
    const { content, extension, mime } = item.build();
    downloadFile(exportFilename(label, extension), content, mime);
    toast.success(`${label} exported (${extension.toUpperCase()})`);
  };

  const sendToSheet = async () => {
    if (!sheetRows || sendingToSheet) return;
    const rows = sheetRows();
    if (!rows.length) {
      toast.info("Nothing to send — this view is empty.");
      return;
    }
    setSendingToSheet(true);
    try {
      const { sendRowsToGoogleSheet } =
        await import("@/features/google-workspace/export/sendToGoogle");
      const result = await sendRowsToGoogleSheet(rows, label);
      if (!result.ok) {
        toast.info("Connect Google to send this to a Sheet", {
          description:
            "Takes about ten seconds, and only for files you choose or that we create.",
          action: {
            label: "Connect",
            onClick: () =>
              window.open(result.settingsHref, "_blank", "noopener"),
          },
        });
        return;
      }
      toast.success(`Created "${result.name}" in your Google Drive`, {
        action: result.openUrl
          ? {
              label: "Open",
              onClick: () =>
                window.open(result.openUrl as string, "_blank", "noopener"),
            }
          : undefined,
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not create the Google Sheet.",
      );
    } finally {
      setSendingToSheet(false);
    }
  };

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={isIcon ? "icon" : "sm"}
          className={
            grouped
              ? copyActionSegmentClass(groupSize === "sm" ? "sm" : groupSize)
              : isIcon
                ? `h-7 w-7 ${className ?? ""}`
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
          <DropdownMenuItem key={item.id} onSelect={() => handle(item)}>
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
