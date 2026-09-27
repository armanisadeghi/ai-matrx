"use client";

/**
 * Reads `source_list_facts` for the Sources the hub has loaded, and keeps
 * re-reading the ones still indexing until their job ends (THE STAGE RE-READ
 * RULE, `factsPollDelayMs`). Failed batches mark only their own ids; a retry
 * re-reads just those.
 */

import { useEffect, useRef, useState } from "react";
import { readSourceFacts } from "@/features/sources/hooks/useSources";
import { factsPollDelayMs, indexingIds, type SourceFacts } from "@/features/sources/sourceRows";
import { stageOf, type HubStage } from "@/features/knowledge/hub/hubStage";

export interface SourceStages {
  facts: ReadonlyMap<string, SourceFacts>;
  failedIds: ReadonlySet<string>;
  loading: boolean;
  stageFor: (sourceId: string) => HubStage | null;
  retry: (ids: string[]) => void;
  /** Re-read every loaded Source (after a write). */
  refresh: () => void;
}

export function useSourceStages(ids: string[], enabled: boolean): SourceStages {
  const [facts, setFacts] = useState<Map<string, SourceFacts>>(new Map());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const key = enabled ? [...new Set(ids)].sort().join(",") : "";
  const startedAt = useRef<number>(Date.now());

  const read = async (list: string[]) => {
    if (!list.length) return;
    const res = await readSourceFacts(list);
    setFacts((prev) => {
      const next = new Map(prev);
      res.facts.forEach((f, id) => next.set(id, f));
      return next;
    });
    setFailedIds((prev) => {
      const next = new Set(prev);
      list.forEach((id) => (res.failedIds.has(id) ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    startedAt.current = Date.now();
    setLoading(true);
    void read(key.split(",")).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  // Re-read the rows still indexing until they settle.
  const pending = indexingIds(facts).filter((id) => key.split(",").includes(id)).join(",");
  useEffect(() => {
    if (!pending) return undefined;
    const delay = factsPollDelayMs(true, Date.now() - startedAt.current);
    if (delay === null) return undefined;
    const t = window.setTimeout(() => void read(pending.split(",")), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, facts]);

  return {
    facts,
    failedIds,
    loading,
    stageFor: (id) => stageOf(facts.get(id), failedIds.has(id)),
    retry: (list) => void read(list),
    refresh: () => setVersion((n) => n + 1),
  };
}
