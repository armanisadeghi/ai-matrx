"use client";

/**
 * The default navigation port's React readers (`./navigation`): the path and
 * query from `window.location`, kept current across back/forward. A client
 * module so the host contract stays importable from server code.
 */

import { useSyncExternalStore } from "react";
import type { ChatSearchParams } from "../contract";

const hasWindow = () => typeof window !== "undefined";

function subscribeToHistory(listener: () => void): () => void {
  if (!hasWindow()) return () => {};
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

export function useWindowPathname(): string {
  return useSyncExternalStore(
    subscribeToHistory,
    () => window.location.pathname,
    () => "/",
  );
}

// One params object per query string, so a re-render sees the same object.
let lastSearch: string | null = null;
let lastParams: ChatSearchParams = new URLSearchParams();

function paramsFor(search: string): ChatSearchParams {
  if (search !== lastSearch) {
    lastSearch = search;
    lastParams = new URLSearchParams(search);
  }
  return lastParams;
}

export function useWindowSearchParams(): ChatSearchParams {
  const search = useSyncExternalStore(
    subscribeToHistory,
    () => window.location.search,
    () => "",
  );
  return paramsFor(search);
}
