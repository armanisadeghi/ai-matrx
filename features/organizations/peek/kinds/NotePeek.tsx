"use client";

/**
 * NotePeek — canonical "data-driven" peek example (content-heavy variant).
 *
 * Same pattern as FilePeek: fetch the row, fill <PeekDialog>. Shows the note's
 * content as a scrollable excerpt + tags.
 */

import React from "react";
import { NotebookText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface NoteRow {
  label: string | null;
  content: string | null;
  tags: string[] | null;
  updated_at: string | null;
}

const MAX_PREVIEW = 2000;

export default function NotePeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<NoteRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("notes")
        .select("label, content, tags, updated_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as NoteRow) ?? null);
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
      title={row?.label || "Note"}
      icon={<NotebookText className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
      href={`/notes/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          {row.tags && row.tags.length > 0 && (
            <PeekField label="Tags">
              <div className="flex flex-wrap gap-1">
                {row.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            </PeekField>
          )}
          <PeekField label="Content">
            {content ? (
              <div className="text-sm whitespace-pre-wrap break-words text-muted-foreground rounded-md border border-border bg-muted/20 p-3 max-h-72 overflow-y-auto">
                {preview}
                {content.length > MAX_PREVIEW && "…"}
              </div>
            ) : (
              <span className="text-muted-foreground italic">Empty note</span>
            )}
          </PeekField>
          <PeekField label="Updated">
            {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Note not found.</p>
      )}
    </PeekDialog>
  );
}
