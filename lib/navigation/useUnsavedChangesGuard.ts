"use client";

// lib/navigation/useUnsavedChangesGuard.ts
//
// THE unsaved-changes guard — one for every editor. While `when` is true, a
// person cannot lose their edits without being asked:
//   • refresh / close tab       → the browser's own beforeunload prompt;
//   • an in-app link (the header Back, the sidebar, any <a>) → our confirm
//     dialog, then the navigation continues if they choose to discard;
//   • browser Back / Forward    → the same confirm, through the Navigation API
//     (where the browser supports cancelling a traversal).
// Links that stay on this page (a `?mode=` / `?tab=` switch), new-tab and
// modified clicks, downloads and other origins are never intercepted.
//
// It also returns `confirmDiscard()` for the page's own Discard / Cancel
// controls, so every "are you sure?" about unsaved work reads the same.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

export interface UnsavedChangesGuardOptions {
  /** True while there is unsaved work. */
  when: boolean;
  /** What is unsaved, in the reader's words: "your changes to this template". */
  what?: string;
}

interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

interface AnchorLike {
  href: string;
  target?: string | null;
  hasDownload?: boolean;
}

/**
 * Pure: the in-app destination a click on this link would leave the page for,
 * or null when the click must not be intercepted.
 */
export function leavingDestination(
  anchor: AnchorLike,
  current: URL,
  click: ClickLike,
): string | null {
  if (click.defaultPrevented || click.button !== 0) return null;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if (anchor.hasDownload) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  let url: URL;
  try {
    url = new URL(anchor.href, current);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  // Same page (a mode / tab / hash switch) keeps the draft — not leaving.
  if (url.pathname === current.pathname) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

interface NavigateEventLike extends Event {
  navigationType: string;
  cancelable: boolean;
  hashChange: boolean;
  destination: { key?: string; url: string };
}
interface NavigationLike extends EventTarget {
  traverseTo: (key: string) => unknown;
}

function navigationApi(): NavigationLike | null {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  return nav && typeof nav.addEventListener === "function" ? nav : null;
}

export function useUnsavedChangesGuard({ when, what = "your changes" }: UnsavedChangesGuardOptions) {
  const router = useRouter();
  const whenRef = useRef(when);
  useEffect(() => {
    whenRef.current = when;
  }, [when]);
  /** Set for the one navigation the person agreed to, so it is not asked twice. */
  const bypassRef = useRef(false);

  const confirmDiscard = async (): Promise<boolean> => {
    if (!whenRef.current) return true;
    return confirm({
      title: "Discard unsaved changes?",
      description: `You have not saved ${what}. Leaving now throws them away.`,
      confirmLabel: "Discard changes",
      variant: "destructive",
    });
  };

  useEffect(() => {
    if (!when) return undefined;
    bypassRef.current = false;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bypassRef.current) return;
      e.preventDefault();
    };

    const onClickCapture = (e: MouseEvent) => {
      if (bypassRef.current) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const dest = leavingDestination(
        { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute("download") },
        new URL(window.location.href),
        e,
      );
      if (!dest) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmDiscard().then((ok) => {
        if (!ok) return;
        bypassRef.current = true;
        router.push(dest);
      });
    };

    const nav = navigationApi();
    const onNavigate = (event: Event) => {
      const e = event as NavigateEventLike;
      if (bypassRef.current || e.navigationType !== "traverse" || e.hashChange) return;
      if (!e.cancelable || !e.destination.key) return;
      const dest = new URL(e.destination.url);
      if (dest.pathname === window.location.pathname) return;
      e.preventDefault();
      const key = e.destination.key;
      void confirmDiscard().then((ok) => {
        if (!ok) return;
        bypassRef.current = true;
        nav?.traverseTo(key);
      });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    nav?.addEventListener("navigate", onNavigate);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
      nav?.removeEventListener("navigate", onNavigate);
    };
    // confirmDiscard reads refs only.
  }, [when, router]);

  return { confirmDiscard };
}
