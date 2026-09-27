"use client";

/**
 * The hub's triage reads: live counts for Inbox / Kept / Archived (sidebar),
 * and the list for whichever of the three is open. Each has its own honest
 * state (loading, ready, the server's refusal). `refresh()` re-reads both
 * after any write.
 */

import { useEffect, useState } from "react";
import type { KnowledgeHit, TriageState } from "@/features/knowledge/api/knowledgeSearch";
import { countTriage, listTriage, TRIAGE_STATES } from "./triageApi";

export type TriageCount =
  | { status: "loading" }
  | { status: "ready"; count: number; more: boolean }
  | { status: "error"; message: string };

export interface TriageList {
  status: "idle" | "loading" | "ready" | "error";
  hits: KnowledgeHit[];
  error: string | null;
  nextCursor: string | null;
  loadingMore: boolean;
}

export interface TriageData {
  counts: Record<TriageState, TriageCount>;
  list: TriageList;
  showMore: () => void;
  refresh: () => void;
  /** Drop rows locally the moment they are moved (the re-read confirms). */
  removeLocally: (keys: Set<string>) => void;
}

const LOADING: Record<TriageState, TriageCount> = {
  inbox: { status: "loading" },
  kept: { status: "loading" },
  archived: { status: "loading" },
};

export function countText(c: TriageCount | undefined): string | null {
  if (!c || c.status !== "ready") return null;
  return c.more ? `${c.count}+` : String(c.count);
}

export function useTriage(active: TriageState | null, enabled: boolean): TriageData {
  const [tick, setTick] = useState(0);
  const [counts, setCounts] = useState<Record<TriageState, TriageCount>>(LOADING);
  const [list, setList] = useState<TriageList>({
    status: "idle",
    hits: [],
    error: null,
    nextCursor: null,
    loadingMore: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    for (const s of TRIAGE_STATES) {
      countTriage(s)
        .then((r) => {
          if (!cancelled) setCounts((prev) => ({ ...prev, [s]: { status: "ready", ...r } }));
        })
        .catch((err: unknown) => {
          if (!cancelled)
            setCounts((prev) => ({
              ...prev,
              [s]: { status: "error", message: err instanceof Error ? err.message : String(err) },
            }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  useEffect(() => {
    if (!enabled || !active) {
      setList({ status: "idle", hits: [], error: null, nextCursor: null, loadingMore: false });
      return;
    }
    let cancelled = false;
    setList((l) => ({ ...l, status: l.hits.length ? l.status : "loading", error: null }));
    listTriage(active, { limit: 50 })
      .then((page) => {
        if (!cancelled)
          setList({ status: "ready", hits: page.hits, error: null, nextCursor: page.nextCursor, loadingMore: false });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setList({
            status: "error",
            hits: [],
            error: err instanceof Error ? err.message : String(err),
            nextCursor: null,
            loadingMore: false,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [active, enabled, tick]);

  const showMore = () => {
    if (!active || !list.nextCursor || list.loadingMore) return;
    const cursor = list.nextCursor;
    setList((l) => ({ ...l, loadingMore: true }));
    listTriage(active, { limit: 50, cursor })
      .then((page) =>
        setList((l) => ({
          ...l,
          hits: [...l.hits, ...page.hits],
          nextCursor: page.nextCursor,
          loadingMore: false,
        })),
      )
      .catch((err: unknown) =>
        setList((l) => ({ ...l, loadingMore: false, error: err instanceof Error ? err.message : String(err) })),
      );
  };

  return {
    counts,
    list,
    showMore,
    refresh: () => setTick((n) => n + 1),
    removeLocally: (keys) =>
      setList((l) => ({ ...l, hits: l.hits.filter((h) => !keys.has(`${h.entity}:${h.id}`)) })),
  };
}
