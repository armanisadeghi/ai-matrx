// record-view: none — dataset is a Deprecated table, which takes no custom fields
"use client";

/**
 * DatasetPeek — quick read-only preview of a record-store Table.
 *
 * The table names its own organization (`locateTable`), then the data seam reads its details.
 * Same pattern as FilePeek: fetch the row, fill <PeekDialog>.
 */

import React from "react";
import { Table } from "lucide-react";
import { locateTable } from "@/features/data-tables/data-source/locate-table";
import { readTableDetails } from "@/features/data-tables/service";
import { peekHref } from "../peekHref";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface DatasetRow {
  title: string | null;
}

export default function DatasetPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<DatasetRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const where = await locateTable(id);
      const details = where.ok ? await readTableDetails(id) : null;
      if (!cancelled) {
        setRow(
          details?.success && details.table
            ? { title: details.table.name || details.table.description || null }
            : null,
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title = row?.title?.trim() || "Table";

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={title}
      icon={<Table className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
      href={peekHref("dataset", id)}
      loading={loading}
    >
      {row ? null : <p className="text-sm text-muted-foreground">Table not found.</p>}
    </PeekDialog>
  );
}
