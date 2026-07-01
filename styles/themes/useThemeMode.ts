"use client";

import { useContext, useSyncExternalStore } from "react";
import { ReactReduxContext } from "react-redux";
import type { ThemeMode } from "@/styles/themes/themeSlice";

/**
 * Read the painted color mode from `<html class="dark">`.
 *
 * Tailwind `dark:` variants, semantic tokens, and SyncBootScript all key off
 * this class (plus the server-set theme cookie on first paint). Redux
 * `theme.mode` is the persistence/write authority, but it can briefly lag the
 * DOM on boot (initialState is `"dark"` while SyncBootScript / the cookie may
 * have already painted light). Components that apply their own colors — Prism,
 * Monaco, canvas — must follow what is painted, not a stale Redux snapshot.
 */
export function readThemeModeFromDOM(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

interface ThemeRootSlice {
  theme?: { mode?: ThemeMode };
}

/**
 * Subscribe to the live painted theme. Watches `<html>` class mutations (boot
 * pre-paint, applyPrePaint middleware) and Redux store updates when inside
 * `StoreProvider` so toggles re-render immediately.
 */
export function useThemeMode(): ThemeMode {
  const ctx = useContext(ReactReduxContext);

  return useSyncExternalStore<ThemeMode>(
    (onStoreChange) => {
      if (typeof document === "undefined") return () => {};

      const observer = new MutationObserver(onStoreChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      const unsubscribeStore = ctx?.store
        ? ctx.store.subscribe(onStoreChange)
        : () => {};

      return () => {
        observer.disconnect();
        unsubscribeStore();
      };
    },
    readThemeModeFromDOM,
    () => "dark",
  );
}
