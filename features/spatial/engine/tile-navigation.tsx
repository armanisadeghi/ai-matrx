"use client";

/**
 * Nothing inside a tile takes over the board.
 *
 * A tile renders a feature's canonical component — the same one its own page
 * renders — and those components navigate: a meeting's Join sent the whole tab
 * to the meeting room, a row's "Open" pushed its record page, a link left. On a
 * board each of those REPLACED the board (2026-10-02). Until a thing can run
 * inside its tile, leaving the page from a tile opens a new tab instead, and
 * says so. Two doors, one rule (`leavesBoard`):
 *   - `TileNavigationBoundary` — around every tile body: the app router its
 *     content sees (`useRouter`, `<Link>`) opens another page in a new tab;
 *     the board's own address (query, hash) is unchanged behaviour.
 *   - `useTileNavigationGuard` — on the board: a document navigation (a plain
 *     link, `location.assign`, a form) started by a press inside a tile is
 *     cancelled and opened in a new tab (the Navigation API's `navigate`).
 */

import { type ReactNode, useContext, useEffect } from "react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { toast } from "@/lib/toast";

/** A press inside a tile this recently is what started a navigation. */
export const TILE_GESTURE_WINDOW_MS = 1500;

/** The URL `href` goes to when it leaves the page at `current`; null when it stays on it. */
export function leavesBoard(href: string, current: { href: string; origin: string; pathname: string }): URL | null {
  let url: URL;
  try {
    url = new URL(href, current.href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null; // mailto:, tel:, blob:…
  if (url.origin !== current.origin) return url;
  return url.pathname === current.pathname ? null : url;
}

/** Open `url` in a new tab, never this one; tell the person (with a way in if a blocker stopped it). */
export function openOutsideBoard(url: string): void {
  const opened = window.open(url, "_blank");
  if (opened) {
    opened.opener = null;
    toast("Opened in a new tab");
    return;
  }
  toast("Opens in a new tab", { action: { label: "Open", onClick: () => window.open(url, "_blank", "noopener") } });
}

/** Around a tile body: the router its content sees never replaces the board. */
export function TileNavigationBoundary({ children }: { children: ReactNode }) {
  const router = useContext(AppRouterContext);
  if (!router) return <>{children}</>;
  const leave =
    (go: (href: string, options?: Parameters<AppRouterInstance["push"]>[1]) => void) =>
    (href: string, options?: Parameters<AppRouterInstance["push"]>[1]) => {
      const out = leavesBoard(href, window.location);
      if (out) openOutsideBoard(out.href);
      else go(href, options);
    };
  const tileRouter: AppRouterInstance = {
    ...router,
    push: leave(router.push),
    replace: leave(router.replace),
  };
  return <AppRouterContext.Provider value={tileRouter}>{children}</AppRouterContext.Provider>;
}

interface NavigateEventLike extends Event {
  navigationType: "push" | "replace" | "reload" | "traverse";
  destination: { url: string };
  downloadRequest: string | null;
  hashChange: boolean;
}

/**
 * On the board: a document navigation away from the page that a press inside
 * a tile started opens in a new tab instead. Browsers without the Navigation
 * API keep only the router door.
 */
export function useTileNavigationGuard(): void {
  useEffect(() => {
    const nav = (window as unknown as { navigation?: EventTarget }).navigation;
    if (!nav) return;
    let lastTilePress = -Infinity;
    const onPress = (e: Event) => {
      // Every press counts: one outside a tile (the board's own chrome) clears it.
      const t = e.target;
      lastTilePress = t instanceof Element && t.closest("[data-spatial-card]") ? performance.now() : -Infinity;
    };
    const onNavigate = (event: Event) => {
      const e = event as NavigateEventLike;
      if (!e.cancelable || e.downloadRequest !== null || e.hashChange) return;
      if (e.navigationType !== "push" && e.navigationType !== "replace") return;
      if (performance.now() - lastTilePress > TILE_GESTURE_WINDOW_MS) return;
      const out = leavesBoard(e.destination.url, window.location);
      if (!out) return;
      e.preventDefault();
      lastTilePress = -Infinity;
      openOutsideBoard(out.href);
    };
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("keydown", onPress, true);
    nav.addEventListener("navigate", onNavigate);
    return () => {
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("keydown", onPress, true);
      nav.removeEventListener("navigate", onNavigate);
    };
  }, []);
}
