"use client";

/**
 * AgentAppPeek — read-only quick preview for an agent app resource.
 *
 * Pattern (copy this for new kinds):
 *   1. fetch the one row by id from the kind's table
 *   2. drop fields into <PeekDialog> + <PeekField>
 *   3. set href to the kind's detail route
 */

import React from "react";
import { AppWindow } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface AgentAppRow {
  name: string | null;
  description: string | null;
  created_at: string | null;
}

export default function AgentAppPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<AgentAppRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("aga_apps")
        .select("name, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as AgentAppRow) ?? null);
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
      title={row?.name || "Agent App"}
      icon={<AppWindow className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
      href={`/agent-apps/${id}`}
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
          <PeekField label="Added">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Agent app not found.</p>
      )}
    </PeekDialog>
  );
}
