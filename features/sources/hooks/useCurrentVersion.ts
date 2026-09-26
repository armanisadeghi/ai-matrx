"use client";

/**
 * Resolve a Source's current version before its screen reads pages or chunks
 * (see `features/sources/currentVersion.ts`). Direct Supabase under RLS.
 *
 * While resolving, `loading` is true and the screen reads nothing — it never
 * shows the pre-edit text first. If the lookup fails the screen shows the
 * document it was opened on and says it could not check for an edit.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  resolveSourceVersions,
  type SourceVersions,
  type VersionRow,
} from "@/features/sources/currentVersion";

export interface UseCurrentVersion {
  loading: boolean;
  versions: SourceVersions | null;
  /** A sentence when the edit check failed (the original is shown). */
  error: string | null;
}

export function useCurrentVersion(documentId: string): UseCurrentVersion {
  const [state, setState] = useState<
    UseCurrentVersion & { forId: string | null }
  >({
    loading: true,
    versions: null,
    error: null,
    forId: null,
  });

  useEffect(() => {
    let cancelled = false;
    const settle = (versions: SourceVersions, error: string | null = null) => {
      if (!cancelled)
        setState({ loading: false, versions, error, forId: documentId });
    };
    const fallback = {
      originalId: documentId,
      currentId: documentId,
      edited: false,
    };
    void (async () => {
      try {
        const docs = supabase.schema("docproc").from("processed_documents");
        const { data, error } = await docs
          .select("id,canonical_clean_id,derivation_kind,parent_processed_id")
          .eq("id", documentId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return settle(fallback);
        const row = data as VersionRow;
        let cleanAlive = false;
        if (row.canonical_clean_id && row.canonical_clean_id !== row.id) {
          const { data: clean, error: cleanError } = await supabase
            .schema("docproc")
            .from("processed_documents")
            .select("id")
            .eq("id", row.canonical_clean_id)
            .is("deleted_at", null)
            .maybeSingle();
          if (cleanError) throw cleanError;
          cleanAlive = !!clean;
        }
        settle(resolveSourceVersions(row, cleanAlive));
      } catch {
        settle(
          fallback,
          "Couldn't check whether this Source has an edited version, so the document you opened is shown.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Until the lookup for THIS id settles, nothing is known.
  if (state.forId !== documentId)
    return { loading: true, versions: null, error: null };
  return {
    loading: state.loading,
    versions: state.versions,
    error: state.error,
  };
}
