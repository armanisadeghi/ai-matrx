"use client";

/**
 * TranscriptPeek — read-only preview of a transcript resource.
 *
 * Same pattern as FilePeek / NotePeek: fetch the row, fill <PeekDialog>.
 * Shows the transcript's description as a scrollable block when present.
 */

import React from "react";
import { AudioLines } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface TranscriptRow {
  title: string | null;
  description: string | null;
  created_at: string | null;
}

export default function TranscriptPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<TranscriptRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .schema("transcripts")
        .from("transcripts")
        .select("title, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as TranscriptRow) ?? null);
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
      title={row?.title || "Transcript"}
      icon={<AudioLines className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
      href={`/transcripts/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Description">
            {row.description ? (
              <div className="text-sm whitespace-pre-wrap break-words text-muted-foreground rounded-md border border-border bg-muted/20 p-3 max-h-72 overflow-y-auto">
                {row.description}
              </div>
            ) : (
              <span className="text-muted-foreground italic">
                No description
              </span>
            )}
          </PeekField>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Transcript not found.</p>
      )}
    </PeekDialog>
  );
}
