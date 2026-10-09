"use client";

/**
 * CanvasPeek — quick read-only preview of a canvas item.
 *
 * Same pattern as FilePeek: fetch one row, fill <PeekDialog> + <PeekField>.
 */

import React from "react";
import { Frame } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { peekHref } from "../peekHref";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";
import { ReadFailure } from "@ai-matrx/design-system";

interface CanvasRow {
  title: string | null;
  description: string | null;
  created_at: string | null;
}

export default function CanvasPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<CanvasRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<unknown>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .schema("canvas").from("canvas_items")
        .select("title, description, created_at")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setLoadError(error ?? null);
        setRow((data as CanvasRow) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  return (
    <PeekDialog
      open={open}
      record={{ token: "canvas_item", id }}
      onClose={onClose}
      title={row?.title || "Canvas"}
      icon={<Frame className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
      href={peekHref("canvas_item", id)}
      loading={loading}
    >
      {loadError ? (
        <ReadFailure error={loadError} what="this canvas" onRetry={() => setAttempt((n) => n + 1)} />
      ) : row ? (
        <>
          <PeekField label="Description">
            {row.description ? (
              row.description
            ) : (
              <span className="text-muted-foreground italic">No description</span>
            )}
          </PeekField>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Canvas not found.</p>
      )}
    </PeekDialog>
  );
}
