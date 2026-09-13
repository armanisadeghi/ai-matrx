"use client";

import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setMode } from "@/styles/themes/themeSlice";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { MENU_ITEM_CLASS } from "./menuItemClass";

/**
 * Theme toggle menu entry. Sets the opposite resolved mode — the sync engine handles
 * broadcast (cross-tab in <20ms), persistence (`matrx:theme`), and pre-paint
 * class/attribute updates. No direct DOM, cookie, or localStorage writes here
 * (PR 1.B: consumers stopped racing with the engine for the `theme` key).
 *
 * Mount-gated icon/label to avoid the hydration mismatch that fires when the
 * SSR initialState (`mode: "dark"`, so SSR renders "switch to light") differs
 * from the client post-rehydrate state (which may be `"light"` from
 * localStorage). Until Phase 3 lands cookie-based SSR handoff, this matches
 * the SSR default on first paint, then flips to the real Redux value after
 * mount.
 */
export function ThemeToggleMenuItem() {
  const dispatch = useAppDispatch();
  const isDark = useThemeMode() === "dark";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount: render the SSR-matching default. `themeSlice` initialState
  // is `"dark"`, so SSR always shows the "switch to light" affordance.
  const displayIsDark = mounted ? isDark : true;

  return (
    <label htmlFor="shell-user-menu" className="block">
      <button
        className={MENU_ITEM_CLASS}
        onClick={() => dispatch(setMode(isDark ? "light" : "dark"))}
      >
        {displayIsDark ? <Sun /> : <Moon />}
        {displayIsDark ? "Light Mode" : "Dark Mode"}
      </button>
    </label>
  );
}
