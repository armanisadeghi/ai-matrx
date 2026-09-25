"use client";

// features/mandates/record-next/useRecordBackHref.ts
//
// BACK RETURNS TO EXACTLY WHERE YOU WERE (register item 3), by the rule the
// detail system uses (`canGoBack` in lib/detail/core/useDetailCore.ts and
// features/window-panels/detail/DetailHost.tsx): only trust what THIS TAB did.
// A record opened straight from a link has nothing behind it, so Back goes to
// the list's home instead of leaving the app.
//
// How "what this tab did" is read: the browser's own Navigation API
// (`navigation.entries()`), which lists this tab's same-origin history. Walk
// back past every entry that is this same record (tab switches push `?tab=`),
// and if the entry before them is a mandate LIST, Back is that exact URL —
// search, filters and sort included. Anything else (a deep link, another page,
// a browser without the API) → the fallback list.

import { useEffect, useState } from "react";

/** The mandate list pages whose URL (with its query) Back may return to. */
const LIST_PATHS = new Set([
  "/administration/mandates",
  "/administration/mandates/list-preview",
]);

interface NavigationEntryLike {
  url: string | null;
  index: number;
}
interface NavigationLike {
  currentEntry: NavigationEntryLike | null;
  entries: () => NavigationEntryLike[];
}

function navigationApi(): NavigationLike | null {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  return nav && typeof nav.entries === "function" ? nav : null;
}

/** Pure: the list URL behind the current record, or null. Exported for tests. */
export function listUrlBehind(
  entries: readonly { url: string | null }[],
  currentIndex: number,
  recordPathname: string,
  origin: string,
): string | null {
  for (let i = currentIndex - 1; i >= 0; i -= 1) {
    const raw = entries[i]?.url;
    if (!raw) return null;
    const url = new URL(raw, origin);
    if (url.origin !== origin) return null;
    if (url.pathname === recordPathname) continue; // a tab switch on this record
    return LIST_PATHS.has(url.pathname)
      ? `${url.pathname}${url.search}`
      : null;
  }
  return null;
}

export function useRecordBackHref(fallbackHref: string): string {
  const [href, setHref] = useState(fallbackHref);
  useEffect(() => {
    const nav = navigationApi();
    const current = nav?.currentEntry;
    if (!nav || !current) return;
    const behind = listUrlBehind(
      nav.entries(),
      current.index,
      window.location.pathname,
      window.location.origin,
    );
    if (behind) setHref(behind);
  }, [fallbackHref]);
  return href;
}
