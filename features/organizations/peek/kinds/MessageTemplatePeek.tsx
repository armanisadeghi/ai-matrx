"use client";

/**
 * MessageTemplatePeek — quick read-only preview for a message_template row.
 *
 * Same pattern as FilePeek: fetch the row by id, fill <PeekDialog>.
 * The message_template table uses "label" as its title column.
 */

import React from "react";
import { LayoutTemplate } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface MessageTemplateRow {
  label: string | null;
  created_at: string | null;
}

export default function MessageTemplatePeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<MessageTemplateRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("message_template")
        .select("label, created_at")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as MessageTemplateRow) ?? null);
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
      title={row?.label || "Message Template"}
      icon={<LayoutTemplate className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
      token="message_template"
      id={id}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Content template not found.</p>
      )}
    </PeekDialog>
  );
}
