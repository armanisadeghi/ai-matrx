// record-view: none — a pick list is a Deprecated table, which takes no custom fields
"use client";

/**
 * ListPeek — peek preview of a list, read through the list door (`get_user_list_with_items`).
 */

import React from "react";
import { List } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { peekHref } from "../peekHref";
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
      const read = await supabase.rpc("get_user_list_with_items", { p_list_id: id });
      const doc = (read.data ?? null) as { description?: string | null; list_name?: string | null; created_at?: string } | null;
      const found: ListRow | null =
        !read.error && doc ? { description: doc.list_name ?? doc.description ?? null, created_at: doc.created_at ?? null } : null;
      if (!cancelled) {
        setRow(found);
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
      href={peekHref("pick_list", id)}
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
