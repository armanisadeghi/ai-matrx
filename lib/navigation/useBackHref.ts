"use client";

// lib/navigation/useBackHref.ts
//
// BACK RETURNS TO WHERE THE PERSON CAME FROM — the platform version of the rule
// the mandate record uses (features/mandates/record-next/useRecordBackHref.ts):
// only trust what THIS TAB did. Read this tab's same-origin history through the
// browser's Navigation API, walk back past entries that are this same page
// (tab/mode switches push `?tab=` / `?mode=`), and the entry before them is
// Back — its search, filters and sort included. A page opened straight from a
// link (nothing behind it in this tab), another origin, or a browser without
// the API → the fallback, so Back never leaves the app.
//
// Returned as an href (not a router.back() call) so Back stays a real link:
// open-in-new-tab and middle-click keep working.

import { useEffect, useState } from "react";

interface NavigationEntryLike {
  url: string | null;
  index: number;
}
interface NavigationLike {
  currentEntry: NavigationEntryLike | null;
  entries: () => NavigationEntryLike[];
}

function navigationApi(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  return nav && typeof nav.entries === "function" ? nav : null;
}

/** Pure: the same-origin URL this tab came from, skipping this page's own entries. */
export function previousPageUrl(
  entries: readonly { url: string | null }[],
  currentIndex: number,
  currentPathname: string,
  origin: string,
): string | null {
  for (let i = currentIndex - 1; i >= 0; i -= 1) {
    const raw = entries[i]?.url;
    if (!raw) return null;
    const url = new URL(raw, origin);
    if (url.origin !== origin) return null;
    if (url.pathname === currentPathname) continue;
    return `${url.pathname}${url.search}`;
  }
  return null;
}

export function useBackHref(fallbackHref: string): string {
  const [href, setHref] = useState(fallbackHref);
  useEffect(() => {
    const nav = navigationApi();
    const current = nav?.currentEntry;
    if (!nav || !current) {
      setHref(fallbackHref);
      return;
    }
    setHref(
      previousPageUrl(nav.entries(), current.index, window.location.pathname, window.location.origin) ??
        fallbackHref,
    );
  }, [fallbackHref]);
  return href;
}
