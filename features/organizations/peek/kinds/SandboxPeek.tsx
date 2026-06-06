"use client";

/**
 * SandboxPeek — read-only preview of a sandbox_instances row.
 *
 * Columns used: sandbox_id (title), status, tier, created_at.
 * No name/title/label column exists in sandbox_instances; sandbox_id is the
 * nearest human-readable identifier.
 *
 * Follow FilePeek's pattern exactly:
 *   1. fetch the one row by id
 *   2. drop fields into <PeekDialog> + <PeekField>
 *   3. cancelled-flag cleanup in useEffect
 */

import React from "react";
import { Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface SandboxRow {
  sandbox_id: string | null;
  status: string | null;
  tier: string | null;
  created_at: string | null;
}

export default function SandboxPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<SandboxRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sandbox_instances")
        .select("sandbox_id, status, tier, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as SandboxRow) ?? null);
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
      title={row?.sandbox_id ?? "Sandbox"}
      icon={<Terminal className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
      href={`/sandbox/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Status">
            <Badge variant="secondary" className="text-xs font-mono">
              {row.status ?? "—"}
            </Badge>
          </PeekField>
          <PeekField label="Tier">{row.tier ?? "—"}</PeekField>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sandbox not found.</p>
      )}
    </PeekDialog>
  );
}
