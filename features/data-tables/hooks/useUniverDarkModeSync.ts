/**
 * useUniverDarkModeSync — keep a Univer instance's dark mode in lockstep with
 * the app's Redux theme (`state.theme.mode`).
 *
 * Univer owns its own theming (see https://docs.univer.ai/guides/docs/ui/themes):
 * you boot it with `theme` + `darkMode`, then flip dark mode at runtime via the
 * Facade API `univerAPI.toggleDarkMode(isDark)`. This is the ONLY supported way
 * to theme Univer — do NOT try to force it with a `colorScheme` CSS override on
 * a wrapper (that just fights Univer's own popups/portals and breaks dark mode).
 *
 * Shared by every Univer surface (DocumentEditor, WorkbookEditor) so the
 * redux→Univer theme bridge lives in exactly one place.
 */
"use client";

import { useEffect } from "react";
import type { FUniver } from "@univerjs/presets";

import { useAppSelector } from "@/lib/redux/hooks";

/**
 * @param apiRef  Ref holding the Univer Facade API (set once the instance boots).
 * @param ready   True once the instance is booted and the API is usable.
 */
export function useUniverDarkModeSync(
  apiRef: React.RefObject<FUniver | null>,
  ready: boolean,
): void {
  const mode = useAppSelector((s) => s.theme.mode);

  useEffect(() => {
    if (!ready || !apiRef.current) return;
    apiRef.current.toggleDarkMode(mode === "dark");
  }, [apiRef, ready, mode]);
}
