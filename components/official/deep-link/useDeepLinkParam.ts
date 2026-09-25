"use client";

import { useSearchParams } from "next/navigation";
import {
  currentPathWithSearch,
  pushAddressWithoutNavigating,
  replaceAddressWithoutNavigating,
} from "@/lib/url-state/addressWithoutNavigating";

export interface DeepLinkParam {
  /** The raw param value, or null when absent. */
  value: string | null;
  /**
   * Set or remove this param, preserving every other one. Defaults to a
   * PUSH: opening or closing a deep-linked record is a discrete user step,
   * and Back is how the user undoes it. Pass `{ history: "replace" }` only
   * when the write is programmatic (consuming a one-shot intent, correcting
   * an impossible value) and must not become a step the user can go Back to.
   */
  set: (value: string | null, options?: { history?: "push" | "replace" }) => void;
  /** Remove this param from the URL, preserving every other one. */
  clear: () => void;
}

/**
 * Read a deep-link param and get correct ways to set or drop it.
 *
 * Every "?user=…" / "?category=…" / "?block=…" surface needs the same URL
 * mutations, and hand-rolling them is where implementations diverge: updates
 * must preserve sibling params and must go through the one door
 * (`addressWithoutNavigating`), because a raw `window.history.replaceState`
 * passing `window.history.state` does NOT update `useSearchParams`, so the UI
 * keeps rendering the value the user just cleared.
 *
 * Pair with `DeepLinkMissNotice` for the case where the param names a record
 * this surface cannot show.
 */
export function useDeepLinkParam(key: string): DeepLinkParam {
  const searchParams = useSearchParams();

  const value = searchParams.get(key);

  const set = (
    value: string | null,
    options?: { history?: "push" | "replace" },
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    const href = currentPathWithSearch(params);
    if (options?.history === "replace") replaceAddressWithoutNavigating(href);
    else pushAddressWithoutNavigating(href);
  };

  return { value, set, clear: () => set(null) };
}
