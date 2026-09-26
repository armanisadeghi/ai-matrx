"use client";

/**
 * Whether a Source is saved — read off its HEAD, never the version on screen
 * (a person's edit never carries `kept_at`; the screen used to say "Not saved"
 * after every edit). Direct Supabase read under RLS, one row, one column.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { sourceKeptAt } from "@/features/sources/currentVersion";

export function useSourceKept(
  viewed: { id: string; kept_at: string | null } | null,
  headId: string | null,
): { keptAt: string | null | undefined; reload: () => void } {
  const [head, setHead] = useState<{ id: string; keptAt: string | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const needsHead = !!viewed && !!headId && viewed.id !== headId;

  useEffect(() => {
    if (!needsHead || !headId) return undefined;
    let cancelled = false;
    void supabase
      .schema("docproc")
      .from("processed_documents")
      .select("kept_at")
      .eq("id", headId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setHead({ id: headId, keptAt: (data as { kept_at: string | null }).kept_at });
      });
    return () => {
      cancelled = true;
    };
  }, [needsHead, headId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  if (!viewed || !headId) return { keptAt: undefined, reload };
  return {
    keptAt: sourceKeptAt(viewed, headId, head?.id === headId ? head.keptAt : undefined),
    reload,
  };
}
