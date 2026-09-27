"use client";

/** The person's tags (every tag scope in their organizations) with filed counts. */

import { useEffect, useState } from "react";
import { listTags, type HubTag } from "./tagApi";

export interface HubTagsState {
  status: "loading" | "ready" | "error";
  items: HubTag[];
  error: string | null;
  retry: () => void;
}

export function useHubTags(enabled: boolean): HubTagsState {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<HubTagsState, "retry">>({ status: "loading", items: [], error: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: s.items.length ? s.status : "loading", error: null }));
    listTags()
      .then((items) => {
        if (!cancelled) setState({ status: "ready", items, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({ status: "error", items: [], error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);
  return { ...state, retry: () => setTick((n) => n + 1) };
}
