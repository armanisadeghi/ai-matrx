"use client";

/**
 * CanvasPeek — quick read-only preview of a canvas item.
 *
 * Same pattern as FilePeek: fetch one row, fill <PeekDialog> + <PeekField>.
 */

import React from "react";
import { Frame } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface CanvasRow {
  title: string | null;
  description: string | null;
  created_at: string | null;
}

export default function CanvasPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<CanvasRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .schema("canvas").from("canvas_items")
        .select("title, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as CanvasRow) ?? null);
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
      title={row?.title || "Canvas"}
      icon={<Frame className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
      href={`/canvas/${id}`}
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
