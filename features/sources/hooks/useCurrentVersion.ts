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
 *
 * While the facts say a job is open (`indexing`), the facts are RE-READ on
 * `factsPollDelayMs` until the job ends — the stage a person sees is the job's
 * real state, never a one-time read that outlives the job.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  versionsFromFacts,
  type SourceVersions,
} from "@/features/sources/currentVersion";
import {
  factsPollDelayMs,
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
  /**
   * A sentence when a job this screen watched ended and the Source is still
   * not searchable (the job failed or produced nothing) — null otherwise.
   */
  jobEndedWithoutText: string | null;
  /** Re-read the facts now (and keep re-reading while a job is open). */
  reload: () => void;
}

export const JOB_ENDED_WITHOUT_TEXT =
  "Processing finished, but no searchable text came out of it. Press Process now to try again.";

async function readFacts(documentId: string): Promise<SourceFactsRow | null> {
  const { data, error } = await supabase
    .schema("docproc")
    .rpc("source_list_facts", { p_ids: [documentId] });
  if (error) throw error;
  return (
    ((data ?? []) as SourceFactsRow[]).find(
      (r) => r.processed_document_id === documentId,
    ) ?? null
  );
}

export function useCurrentVersion(documentId: string): UseCurrentVersion {
  const [state, setState] = useState<{
    loading: boolean;
    versions: SourceVersions | null;
    facts: SourceFacts | null;
    error: string | null;
    forId: string | null;
    sawIndexing: boolean;
  }>({
    loading: true,
    versions: null,
    facts: null,
    error: null,
    forId: null,
    sawIndexing: false,
  });
  const [tick, setTick] = useState(0);
  const pollStart = useRef<number | null>(null);
  const lastIndexing = useRef(false);
  const settledFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    pollStart.current = null;
    const fallback = {
      originalId: documentId,
      currentId: documentId,
      edited: false,
    };

    const read = async (first: boolean) => {
      try {
        const row = await readFacts(documentId);
        if (cancelled) return;
        settledFor.current = documentId;
        // Not readable (or gone): the access gate below answers that.
        if (!row) {
          if (first)
            setState({
              loading: false,
              versions: fallback,
              facts: null,
              error: null,
              forId: documentId,
              sawIndexing: false,
            });
          return;
        }
        const facts = sourceFactsFromRow(row);
        if (!facts) throw new Error("current version not reported");
        setState((prev) => ({
          loading: false,
          versions: versionsFromFacts(facts),
          facts,
          error: null,
          forId: documentId,
          sawIndexing:
            (prev.forId === documentId && prev.sawIndexing) || facts.indexing,
        }));
        lastIndexing.current = facts.indexing;
        const now = Date.now();
        if (facts.indexing && pollStart.current === null) pollStart.current = now;
        const delay = factsPollDelayMs(
          facts.indexing,
          pollStart.current === null ? 0 : now - pollStart.current,
        );
        if (delay !== null) timer = setTimeout(() => void read(false), delay);
        else pollStart.current = null;
      } catch {
        if (cancelled) return;
        if (first) {
          settledFor.current = documentId;
          setState({
            loading: false,
            versions: fallback,
            facts: null,
            error:
              "Couldn't check whether this Source has an edited version, so the document you opened is shown.",
            forId: documentId,
            sawIndexing: false,
          });
        } else if (lastIndexing.current) {
          // A re-read that failed keeps the last facts and tries again — a
          // job that is still open must not freeze the stage on one hiccup.
          timer = setTimeout(() => void read(false), 5_000);
        }
      }
    };
    void read(settledFor.current !== documentId);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [documentId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // Until the lookup for THIS id settles, nothing is known.
  if (state.forId !== documentId)
    return {
      loading: true,
      versions: null,
      facts: null,
      error: null,
      jobEndedWithoutText: null,
      reload,
    };
  const f = state.facts;
  return {
    loading: state.loading,
    versions: state.versions,
    facts: f,
    error: state.error,
    jobEndedWithoutText:
      state.sawIndexing && f && !f.indexing && f.currentChunkCount === 0
        ? JOB_ENDED_WITHOUT_TEXT
        : null,
    reload,
  };
}
