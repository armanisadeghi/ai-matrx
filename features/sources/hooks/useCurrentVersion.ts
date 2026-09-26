"use client";

/**
 * Resolve a Source's current version before its screen reads pages or chunks,
 * through the SAME server fact the Sources page reads
 * (`docproc.source_list_facts`: newest recapture in the chain, then its live
 * edit). Direct Supabase under RLS; no client-side version rule.
 *
 * While resolving, `loading` is true and the screen reads nothing — it never
 * shows the pre-edit text first. If the lookup fails the screen shows the
 * document it was opened on and says it could not check for an edit.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  versionsFromFacts,
  type SourceVersions,
} from "@/features/sources/currentVersion";
import {
  sourceFactsFromRow,
  type SourceFacts,
  type SourceFactsRow,
} from "@/features/sources/sourceRows";

export interface UseCurrentVersion {
  loading: boolean;
  versions: SourceVersions | null;
  /**
   * The same facts row the Sources page reads (current version's chunk count,
   * indexing, attachments) — null when it could not be read. The Source screen
   * says "Not yet searchable" from `currentChunkCount`, never from the
   * capture's own chunks.
   */
  facts: SourceFacts | null;
  /** A sentence when the edit check failed (the original is shown). */
  error: string | null;
}

export function useCurrentVersion(documentId: string): UseCurrentVersion {
  const [state, setState] = useState<
    UseCurrentVersion & { forId: string | null }
  >({
    loading: true,
    versions: null,
    facts: null,
    error: null,
    forId: null,
  });

  useEffect(() => {
    let cancelled = false;
    const settle = (
      versions: SourceVersions,
      error: string | null = null,
      facts: SourceFacts | null = null,
    ) => {
      if (!cancelled)
        setState({ loading: false, versions, facts, error, forId: documentId });
    };
    const fallback = {
      originalId: documentId,
      currentId: documentId,
      edited: false,
    };
    void (async () => {
      try {
        const { data, error } = await supabase
          .schema("docproc")
          .rpc("source_list_facts", { p_ids: [documentId] });
        if (error) throw error;
        const row = ((data ?? []) as SourceFactsRow[]).find(
          (r) => r.processed_document_id === documentId,
        );
        // Not readable (or gone): the access gate below answers that.
        if (!row) return settle(fallback);
        const facts = sourceFactsFromRow(row);
        if (!facts) throw new Error("current version not reported");
        settle(versionsFromFacts(facts), null, facts);
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
    return { loading: true, versions: null, facts: null, error: null };
  return {
    loading: state.loading,
    versions: state.versions,
    facts: state.facts,
    error: state.error,
  };
}
