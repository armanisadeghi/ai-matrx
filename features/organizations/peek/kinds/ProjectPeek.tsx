"use client";

/**
 * ProjectPeek — quick read-only preview for a ctx_projects row.
 *
 * Same pattern as FilePeek / NotePeek: fetch the row, fill <PeekDialog>.
 * href is omitted because a project's full route is org-scoped and cannot
 * be constructed from the project id alone — the footer hides automatically.
 */

import React from "react";
import { FolderKanban } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface ProjectRow {
  name: string | null;
  description: string | null;
  created_at: string | null;
}

export default function ProjectPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<ProjectRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("ctx_projects")
        .select("name, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as ProjectRow) ?? null);
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
      title={row?.name || "Project"}
      icon={<FolderKanban className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
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
        <p className="text-sm text-muted-foreground">Project not found.</p>
      )}
    </PeekDialog>
  );
}
