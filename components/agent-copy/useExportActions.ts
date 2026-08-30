"use client";

import { useState } from "react";

import {
  downloadFile,
  exportFilename,
  type ExportItem,
} from "@/components/agent-copy/export";
import { toast } from "@/lib/toast";

/**
 * Shared execution layer for export menu items. Both the unified CopyButtons
 * menu and the intentionally standalone ExportMenu use this hook, so file
 * downloads and Google Sheets keep one behavior and one error path.
 */
export function useExportActions({
  label,
  sheetRows,
}: {
  label: string;
  sheetRows?: () => Array<Record<string, unknown>>;
}) {
  const [sendingToSheet, setSendingToSheet] = useState(false);

  const runExportItem = async (item: ExportItem) => {
    try {
      if (item.onSelect) {
        await item.onSelect();
        return;
      }
      if (!item.build) return;
      const { content, extension, mime } = item.build();
      downloadFile(exportFilename(label, extension), content, mime);
      toast.success(`${label} exported (${extension.toUpperCase()})`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : `Could not export ${label}.`,
      );
    }
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
      if (!result.ok && result.reason === "failed") {
        toast.error("Could not create the Google Sheet", {
          description: result.message,
        });
        return;
      }
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

  return { runExportItem, sendToSheet, sendingToSheet };
}
