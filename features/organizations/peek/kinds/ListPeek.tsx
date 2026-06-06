"use client";

/**
 * ListPeek — peek preview for a udt_picklists row.
 *
 * Note: udt_picklists has no name/title column — the user-facing label is
 * stored in the `description` column, which doubles as the dialog title.
 */

import React from "react";
import { List } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface ListRow {
  description: string | null;
  created_at: string | null;
}

export default function ListPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<ListRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("udt_picklists")
        .select("description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as ListRow) ?? null);
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
      title={row?.description || "List"}
      icon={<List className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
      href={`/lists/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">List not found.</p>
      )}
    </PeekDialog>
  );
}
