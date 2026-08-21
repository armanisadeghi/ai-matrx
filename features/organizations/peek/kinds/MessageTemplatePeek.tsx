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
import { peekHref } from "../peekHref";
import { PeekDialog, PeekField } from "../PeekDialog";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import type { PeekProps } from "../types";

interface MessageTemplateRow {
  label: string | null;
  content: string | null;
  tags: string[] | null;
  created_at: string | null;
}

const MAX_PREVIEW = 4000;

export default function MessageTemplatePeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<MessageTemplateRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .schema("agent")
        .from("message_template")
        .select("label, content, tags, created_at")
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

  const content = (row?.content ?? "").trim();
  const preview = content.slice(0, MAX_PREVIEW);

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={row?.label || "Message Template"}
      icon={
        <LayoutTemplate className="h-4 w-4 text-violet-600 dark:text-violet-400" />
      }
      href={peekHref("message_template", id)}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Content">
            {content ? (
              <div className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                {preview}
                {content.length > MAX_PREVIEW && "…"}
              </div>
            ) : (
              <span className="italic text-muted-foreground">
                Empty template
              </span>
            )}
          </PeekField>
          {row.tags && row.tags.length > 0 && (
            <PeekField label="Tags">{row.tags.join(", ")}</PeekField>
          )}
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <AccessGate token="message_template" id={id} />
      )}
    </PeekDialog>
  );
}
