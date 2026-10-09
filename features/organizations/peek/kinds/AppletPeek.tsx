"use client";

/**
 * AppletPeek — read-only quick preview for an Applet resource.
 *
 * Pattern (copy this for new kinds):
 *   1. fetch the one row by id from the kind's table
 *   2. drop fields into <PeekDialog> + <PeekField>
 *   3. set href to the kind's detail route
 */

import React from "react";
import { AppWindow } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { appDb } from "@/utils/supabase/appDb";
import { peekHref } from "../peekHref";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";
import { ReadFailure } from "@ai-matrx/design-system";

interface AppletRow {
  name: string | null;
  description: string | null;
  created_at: string | null;
}

export default function AppletPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<AppletRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<unknown>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await appDb(supabase)
        .from("definition")
        .select("name, description, created_at")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setLoadError(error ?? null);
        setRow((data as AppletRow) ?? null);
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
      record={{ token: "app", id }}
      onClose={onClose}
      title={row?.name || "Applet"}
      icon={<AppWindow className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
      href={peekHref("app", id)}
      loading={loading}
    >
      {loadError ? (
        <ReadFailure error={loadError} what="this Applet" onRetry={() => setAttempt((n) => n + 1)} />
      ) : row ? (
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
        <p className="text-sm text-muted-foreground">Applet not found.</p>
      )}
    </PeekDialog>
  );
}
