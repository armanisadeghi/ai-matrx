"use client";

/**
 * SendToGoogleSheetButton — push a parsed markdown table into the user's own
 * Google Drive as a new Sheet, as a sibling to `SendToWorkbookButton`.
 *
 * It owns no Google code: everything goes through the ONE canonical path,
 * `features/google-workspace/export/sendToGoogle.ts` (the same rule the
 * message-options menu follows). Not-connected is a normal state — it becomes
 * a one-click Connect offer, never an error.
 */

import { useState } from "react";
import { Loader2, Sheet } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";

interface SendToGoogleSheetButtonProps {
  headers: string[];
  rows: string[][];
  /** Display name for the sheet. Falls back to the first header / "Table". */
  name?: string;
  className?: string;
}

export function SendToGoogleSheetButton({
  headers,
  rows,
  name,
  className,
}: SendToGoogleSheetButtonProps) {
  const [pushing, setPushing] = useState(false);

  if (!headers.length) return null;

  const sheetName =
    name?.trim() ||
    (headers[0] ? `Table: ${headers[0]}`.slice(0, 60) : "Table");

  const handleClick = async () => {
    if (pushing) return;
    setPushing(true);
    try {
      const { sendRowsToGoogleSheet } = await import(
        "@/features/google-workspace/export/sendToGoogle"
      );
      const records = rows.map((row) =>
        Object.fromEntries(
          headers.map((header, i) => [header || `Column ${i + 1}`, row[i] ?? ""]),
        ),
      );
      const result = await sendRowsToGoogleSheet(records, sheetName);
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
    } finally {
      setPushing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pushing}
      className={
        className ??
        "flex items-center gap-2 hover:bg-green-100 dark:hover:bg-green-800/30"
      }
    >
      {pushing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sheet className="h-4 w-4" />
      )}
      Google Sheet
    </Button>
  );
}
