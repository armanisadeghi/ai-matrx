"use client";

/**
 * QuizPeek — peek preview for quiz_sessions.
 *
 * Same pattern as FilePeek: fetch the row, fill <PeekDialog> + <PeekField>.
 */

import React from "react";
import { ListChecks } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface QuizRow {
  title: string | null;
  created_at: string | null;
}

export default function QuizPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<QuizRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("quiz_sessions")
        .select("title, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as QuizRow) ?? null);
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
      title={row?.title || "Quiz"}
      icon={<ListChecks className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
      href={`/quizzes/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Quiz not found.</p>
      )}
    </PeekDialog>
  );
}
