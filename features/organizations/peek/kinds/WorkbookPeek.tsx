"use client";

/**
 * WorkbookPeek — read-only preview of a single workbook resource.
 *
 * Same pattern as FilePeek: fetch the row by id, fill <PeekDialog> + <PeekField>.
 * The workbook table uses `description` as its label column.
 */

import React from "react";
import { Sheet } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface WorkbookRow {
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
        .from("udt_workbooks")
        .select("description, created_at")
        .eq("id", id)
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
      title={row?.description || "Workbook"}
      icon={<Sheet className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
      href={`/workbooks/${id}`}
      loading={loading}
    >
      {row ? (
        <>
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
