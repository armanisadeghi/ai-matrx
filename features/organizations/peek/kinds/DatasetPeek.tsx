"use client";

/**
 * DatasetPeek — quick read-only preview for a udt_datasets row.
 *
 * The table has no "name" column; the human label is "description".
 * Same pattern as FilePeek: fetch the row, fill <PeekDialog>.
 */

import React from "react";
import { Table } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface DatasetRow {
  description: string | null;
  created_at: string | null;
}

export default function DatasetPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<DatasetRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .schema("workbench")
        .from("udt_datasets")
        .select("description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as DatasetRow) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title =
    row?.description && row.description.trim() ? row.description.trim() : "Dataset";

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={title}
      icon={<Table className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
      href={`/data/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Dataset not found.</p>
      )}
    </PeekDialog>
  );
}
