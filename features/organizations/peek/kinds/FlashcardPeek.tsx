"use client";

/**
 * FlashcardPeek — quick read-only preview of an education.fc_set row.
 *
 * Same pattern as FilePeek: fetch the row by id, fill <PeekDialog> + <PeekField>.
 */

import React from "react";
import { Layers } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { peekHref } from "../peekHref";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface FlashcardRow {
  name: string | null;
  topic: string | null;
  created_at: string | null;
}

export default function FlashcardPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<FlashcardRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .schema("education")
        .from("fc_set")
        .select("name, topic, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as FlashcardRow) ?? null);
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
      title={row?.name || row?.topic || "Flashcard set"}
      icon={<Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
      href={peekHref("fc_set", id)}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Name">
            {row.name ?? <span className="text-muted-foreground">—</span>}
          </PeekField>
          <PeekField label="Topic">
            {row.topic ?? <span className="text-muted-foreground">—</span>}
          </PeekField>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Flashcard not found.</p>
      )}
    </PeekDialog>
  );
}
