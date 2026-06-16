"use client";

/**
 * SendToWorkbookButton — push a parsed markdown table into the Workbook
 * (spreadsheet) system as a sibling to the existing "Save" (→ data table)
 * action on our fancy markdown tables.
 *
 * Data tables (udt_datasets) are typed + queryable; workbooks (udt_workbooks)
 * are lossless Excel-style sheets. A user copying a table out of an AI response
 * often wants the spreadsheet, not a schema — this gives them that path.
 *
 * On success it raises `OpenDestinationDialog` (Here / new tab) rather than
 * silently navigating. Cells are cleaned of inline markdown + typed by
 * `pushTableToWorkbook`.
 */

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { OpenDestinationDialog } from "@/features/page-extraction/data-review/OpenDestinationDialog";

interface SendToWorkbookButtonProps {
  headers: string[];
  rows: string[][];
  /** Display name for the workbook. Falls back to the first header / "Table". */
  name?: string;
  className?: string;
}

export function SendToWorkbookButton({
  headers,
  rows,
  name,
  className,
}: SendToWorkbookButtonProps) {
  const [pushing, setPushing] = useState(false);
  const [created, setCreated] = useState<{
    route: string;
    title: string;
  } | null>(null);

  if (!headers.length) return null;

  const workbookName =
    name?.trim() ||
    (headers[0] ? `Table: ${headers[0]}`.slice(0, 60) : "Table");

  const handleClick = async () => {
    if (pushing) return;
    setPushing(true);
    try {
      // Lazy-import so Univer (heavy) stays out of the markdown/chat bundle
      // until the user actually pushes a table to a workbook.
      const { pushTableToWorkbook } =
        await import("@/features/data-tables/export-targets");
      const res = await pushTableToWorkbook({
        name: workbookName,
        headers,
        rows,
      });
      if (!res.ok || !res.href) {
        toast.error("Could not create workbook", { description: res.error });
        return;
      }
      setCreated({ route: res.href, title: "Workbook created" });
    } finally {
      setPushing(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={pushing}
        className={
          className ??
          "flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-800/30"
        }
      >
        {pushing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-4 w-4" />
        )}
        Workbook
      </Button>

      <OpenDestinationDialog
        open={created !== null}
        onOpenChange={(o) => {
          if (!o) setCreated(null);
        }}
        title={created?.title ?? ""}
        resourceName={workbookName}
        route={created?.route ?? "/"}
      />
    </>
  );
}
