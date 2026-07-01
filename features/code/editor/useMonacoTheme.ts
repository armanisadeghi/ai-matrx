"use client";

import { useThemeMode } from "@/styles/themes/useThemeMode";

/**
 * Returns whether the document currently has the `dark` class on <html>.
 * Reacts to class changes so Monaco can flip themes without a remount.
 */
export function useMonacoTheme(): boolean {
  return useThemeMode() === "dark";
}
