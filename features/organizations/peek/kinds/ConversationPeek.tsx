"use client";

/**
 * ConversationPeek — quick read-only preview of a conversation resource.
 *
 * Same pattern as FilePeek: fetch the row, fill <PeekDialog>.
 */

import React from "react";
import { MessagesSquare } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface ConversationRow {
  title: string | null;
  description: string | null;
  created_at: string | null;
}

export default function ConversationPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<ConversationRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("cx_conversation")
        .select("title, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as ConversationRow) ?? null);
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
      title={row?.title || "Conversation"}
      icon={<MessagesSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
      href={`/chat/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Description">
            {row.description ? (
              row.description
            ) : (
              <span className="text-muted-foreground italic">No description</span>
            )}
          </PeekField>
          <PeekField label="Started">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Conversation not found.</p>
      )}
    </PeekDialog>
  );
}
