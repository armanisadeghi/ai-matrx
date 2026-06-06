"use client";

/**
 * ShortcutPeek — quick read-only preview of an agent shortcut.
 *
 * Same pattern as FilePeek / NotePeek: fetch the row by id, fill <PeekDialog>.
 * Agent shortcuts have no standalone route, so href is omitted and the footer
 * is hidden by PeekDialog.
 */

import React from "react";
import { Zap } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface Row {
  label: string | null;
  description: string | null;
  created_at: string | null;
}

export default function ShortcutPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<Row | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("agx_shortcut")
        .select("label, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as Row) ?? null);
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
      title={row?.label || "Shortcut"}
      icon={<Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
      href={undefined}
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
              <span className="text-muted-foreground italic">—</span>
            )}
          </PeekField>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Shortcut not found.</p>
      )}
    </PeekDialog>
  );
}
