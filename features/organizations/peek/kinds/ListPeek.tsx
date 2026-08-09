"use client";

/**
 * ListPeek — peek preview for a `workbench.udt_structured_lists` row.
 *
 * 🚨 This file used to claim the table "has no name/title column" and titled the
 * dialog from `description`. That was FALSE: the column is `list_name`, it is
 * what `platform.entity_types.title_column` declares for the `structured_list`
 * token, and it is what every consumer reads. The result was a peek whose whole
 * job is answering "which one is that?" rendering the title **"List"** for any
 * list without a description — the exact dead end peek exists to remove.
 *
 * The lesson generalises: **read the entity's `title_column`, never guess from
 * the columns a previous selection happened to fetch.** A `select()` narrowed
 * to the wrong field looks deliberate forever after.
 */

import React from "react";
import { List } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface ListRow {
  list_name: string | null;
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
        .schema("workbench")
        .from("udt_structured_lists")
        .select("list_name, description, created_at")
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
      title={row?.list_name?.trim() || "Untitled list"}
      icon={<List className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
      token="structured_list"
      id={id}
      loading={loading}
    >
      {row ? (
        <>
          {/* `description` is no longer the title, so it becomes the field it
              always was — and a peek showing only a timestamp answers nothing. */}
          {row.description?.trim() ? (
            <PeekField label="Description">{row.description}</PeekField>
          ) : null}
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
