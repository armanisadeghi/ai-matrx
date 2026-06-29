"use client";

import { useEffect, useState } from "react";

/**
 * Returns whether the document currently has the `dark` class on <html>.
 * Reacts to class changes so Monaco can flip themes without a remount.
 *
 * Duplicated from features/code-editor/hooks/useMonacoTheme.ts. We don't
 * touch monaco globally here — the caller picks the concrete theme to apply
 * based on the returned boolean.
 */
export function useMonacoTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const update = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          update();
          return;
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
