"use client";

/**
 * TaskPeek — read-only preview for a ctx_tasks row.
 *
 * Same pattern as FilePeek / NotePeek: fetch the row, fill <PeekDialog>.
 * Shows the task's description as a scrollable excerpt + created date.
 */

import React from "react";
import { ListTodo } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface TaskRow {
  title: string | null;
  description: string | null;
  created_at: string | null;
}

export default function TaskPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<TaskRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await workspaceDb(supabase)
        .from("tasks")
        .select("title, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as TaskRow) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const description = (row?.description ?? "").trim();

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={row?.title || "Task"}
      icon={<ListTodo className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
      href={`/tasks/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Description">
            {description ? (
              <div className="text-sm whitespace-pre-wrap break-words text-muted-foreground rounded-md border border-border bg-muted/20 p-3 max-h-72 overflow-y-auto">
                {description}
              </div>
            ) : (
              <span className="text-muted-foreground italic">No description</span>
            )}
          </PeekField>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Task not found.</p>
      )}
    </PeekDialog>
  );
}
