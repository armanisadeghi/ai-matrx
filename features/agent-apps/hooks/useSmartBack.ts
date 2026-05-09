"use client";

/**
 * useSmartBack — header back-arrow handler that walks the browser history
 * when there is one to walk, and falls back to a hardcoded route otherwise.
 *
 * Why: a hardcoded `<Link href="/agent-apps">` always lands the user on the
 * unfiltered list, even if they entered the app from /agent-apps?q=tutor and
 * are now three sub-routes deep. Using router.back() lets the browser do the
 * right thing (restore the filtered list, restore scroll position) — but we
 * need a fallback for direct-link entries where history is shallow.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";

export function useSmartBack(fallbackHref: string) {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [router, fallbackHref]);
}
