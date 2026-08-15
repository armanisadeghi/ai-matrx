"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface DeepLinkParam {
  /** The raw param value, or null when absent. */
  value: string | null;
  /** Set or remove this param, preserving every other one. */
  set: (value: string | null) => void;
  /** Remove this param from the URL, preserving every other one. */
  clear: () => void;
}

/**
 * Read a deep-link param and get correct ways to set or drop it.
 *
 * Every "?user=…" / "?category=…" / "?block=…" surface needs the same URL
 * mutations, and hand-rolling them is where implementations diverge: updates
 * must preserve sibling params and must go through `router.replace`, because
 * `window.history.replaceState` does NOT update `useSearchParams`, so the UI
 * keeps rendering the value the user just cleared.
 *
 * Pair with `DeepLinkMissNotice` for the case where the param names a record
 * this surface cannot show.
 */
export function useDeepLinkParam(key: string): DeepLinkParam {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = searchParams.get(key);

  const set = (value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  return { value, set, clear: () => set(null) };
}
