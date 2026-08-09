"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface DeepLinkParam {
  /** The raw param value, or null when absent. */
  value: string | null;
  /** Remove this param from the URL, preserving every other one. */
  clear: () => void;
}

/**
 * Read a deep-link param and get a correct way to drop it.
 *
 * Every "?user=…" / "?category=…" / "?block=…" surface needs the same two
 * things, and hand-rolling the second is where they diverge: the clear must
 * preserve sibling params and must go through `router.replace`, because
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

  const clear = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return { value, clear };
}
