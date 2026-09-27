"use client";

/**
 * Live counts for the saved views the sidebar shows (Linear: every pinned view
 * carries its count). One first-page search per distinct query through the
 * SAME runner the hub uses (see `countViewQuery` for why it is a first page
 * and when it says "99+"), two at a time, remembered for a minute so moving
 * around the hub does not re-run them. `refresh()` forgets them after a write.
 */

import { useEffect, useState } from "react";
import type { KnowledgeQuery, KnowledgeSearchRunner } from "@/features/knowledge/api/knowledgeSearch";
import { normalizeQuery } from "@/features/knowledge/hub/hubState";
import { countViewQuery, type ViewCount } from "@/features/knowledge/hub/hubSavedViews";

const TTL_MS = 60_000;
const CONCURRENCY = 2;
const cache = new Map<string, { at: number; value: ViewCount }>();

export function countKey(data: string, query: KnowledgeQuery): string {
  return `${data}|${JSON.stringify(normalizeQuery(query))}`;
}

/** Tests only. */
export function clearSavedViewCountCache(): void {
  cache.clear();
}

export function useSavedViewCounts(
  queries: { id: string; query: KnowledgeQuery }[],
  data: "live" | "sample",
  runner: KnowledgeSearchRunner,
): { counts: Record<string, ViewCount | undefined>; refresh: () => void } {
  const [tick, setTick] = useState(0);
  const [values, setValues] = useState<Record<string, ViewCount>>({});
  const keyed = queries.map((q) => ({ id: q.id, key: countKey(data, q.query), query: q.query }));
  const signature = keyed.map((k) => `${k.id}=${k.key}`).join("\n");

  useEffect(() => {
    const ctrl = new AbortController();
    const now = Date.now();
    const fresh: Record<string, ViewCount> = {};
    const todo = new Map<string, KnowledgeQuery>();
    for (const k of keyed) {
      const hit = cache.get(k.key);
      if (hit && now - hit.at < TTL_MS) fresh[k.key] = hit.value;
      else todo.set(k.key, k.query);
    }
    setValues(fresh);
    const queue = [...todo.entries()];
    const worker = async () => {
      while (queue.length && !ctrl.signal.aborted) {
        const [key, query] = queue.shift()!;
        try {
          const value = await countViewQuery(query, runner, ctrl.signal);
          cache.set(key, { at: Date.now(), value });
          if (!ctrl.signal.aborted) setValues((prev) => ({ ...prev, [key]: value }));
        } catch {
          return; // aborted
        }
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) void worker();
    return () => ctrl.abort();
    // `signature` captures every id/query pair; `tick` forces a re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, tick, runner]);

  const counts: Record<string, ViewCount | undefined> = {};
  for (const k of keyed) counts[k.id] = values[k.key];
  return {
    counts,
    refresh: () => {
      cache.clear();
      setTick((n) => n + 1);
    },
  };
}
