"use client";

/**
 * WorkflowPeek — quick read-only preview of a workflow resource.
 *
 * Same pattern as FilePeek: fetch the row, fill <PeekDialog> + <PeekField>.
 */

import React from "react";
import { Workflow } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface WorkflowRow {
  name: string | null;
  description: string | null;
  created_at: string | null;
}

const workflowIcon = (
  <Workflow className="h-4 w-4 text-violet-600 dark:text-violet-400" />
);

export default function WorkflowPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<WorkflowRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("workflow")
        .select("name, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as WorkflowRow) ?? null);
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
      title={row?.name || "Workflow"}
      icon={workflowIcon}
      href={`/workflows/${id}`}
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
        <p className="text-sm text-muted-foreground">Workflow not found.</p>
      )}
    </PeekDialog>
  );
}
