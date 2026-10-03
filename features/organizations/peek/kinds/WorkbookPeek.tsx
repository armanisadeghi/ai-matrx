"use client";

/**
 * WorkbookPeek — read-only preview of a single workbook resource.
 *
 * Same pattern as FilePeek: fetch the row by id, fill <PeekDialog> + <PeekField>.
 * Titled by `workbook_name` — the registry's title column. Until 2026-10-02 it
 * read `description`, so a workbook without one peeked as just "Workbook"
 * (G10A review). Guard: `__tests__/every-peek-shows-the-record-name.test.tsx`.
 */

import React from "react";
import { Sheet } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { peekHref } from "../peekHref";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface WorkbookRow {
  workbook_name: string | null;
  description: string | null;
  created_at: string | null;
}

export default function WorkbookPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<WorkbookRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .schema("workbench")
        .from("udt_workbooks")
        .select("workbook_name, description, created_at")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as WorkbookRow) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={row?.workbook_name || row?.description || "Workbook"}
      icon={<Sheet className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
      href={peekHref("workbook", id)}
      loading={loading}
    >
      {row ? (
        <>
          {row.description && row.description !== row.workbook_name ? (
            <PeekField label="Description">{row.description}</PeekField>
          ) : null}
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Workbook not found.</p>
      )}
    </PeekDialog>
  );
}
