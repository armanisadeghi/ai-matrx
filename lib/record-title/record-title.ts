"use client";

/**
 * THE RECORD'S OWN NAME, for the chrome around it.
 *
 * A record page (a mandate, an agent, a workflow…) lives at an address whose
 * last segment is an IDENTIFIER — a key like `scraper.page_fetch_verdict` or a
 * uuid. Chrome that only has the URL (the browser tab, a breadcrumb) used to
 * print that identifier title-cased ("Scraper.page Fetch Verdict") or a generic
 * word ("Mandate"). The page already knows the record's display name, so it
 * publishes it here once and every piece of chrome reads it:
 *
 *   useRecordTitle(name)          — the page: sets the browser tab title and
 *                                   announces the name for its own pathname;
 *   useRecordTitleFor(pathname)   — the chrome: the published name for exactly
 *                                   that address, or null (fall back as before).
 *
 * The name is keyed by the pathname it was published for, so a crumb can never
 * show the previous record's name on the next page.
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

const APP_SUFFIX = " — AI Matrx";

let current: { pathname: string; title: string } | null = null;
const listeners = new Set<() => void>();

function publish(next: typeof current): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRecordTitle(name: string | null | undefined): void {
  const pathname = usePathname() ?? "";
  const title = name?.trim() || null;
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    const wanted = `${title}${APP_SUFFIX}`;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    // Route metadata streams in AFTER the page mounts and would put the
    // route's generic title back ("Mandates"); the record's name wins while
    // the record is on screen.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    publish({ pathname, title });
    return () => {
      observer.disconnect();
      if (current?.pathname === pathname) publish(null);
      document.title = previous;
    };
  }, [pathname, title]);
}

export function useRecordTitleFor(pathname: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (current && current.pathname === pathname ? current.title : null),
    () => null,
  );
}
