"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { activeSessionIdSet } from "../redux/slice";

export const STUDIO_ROUTE_BASE = "/transcription/studio";

export function studioSessionHref(sessionId: string | null): string {
  if (!sessionId) return STUDIO_ROUTE_BASE;
  return `${STUDIO_ROUTE_BASE}?session=${encodeURIComponent(sessionId)}`;
}

/**
 * Keeps transcript studio session selection in sync with `?session=` on the
 * page route. URL is the source of truth when `enabled`; window-panel mounts
 * pass `enabled: false` and keep Redux-only selection.
 */
export function useStudioSessionRoute(enabled: boolean) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();

  const sessionIdFromUrl = searchParams.get("session");

  useEffect(() => {
    if (!enabled) return;
    dispatch(activeSessionIdSet(sessionIdFromUrl));
  }, [enabled, sessionIdFromUrl, dispatch]);

  const navigateToSession = useCallback(
    (sessionId: string | null, options?: { replace?: boolean }) => {
      const href = studioSessionHref(sessionId);

      if (!enabled) {
        dispatch(activeSessionIdSet(sessionId));
        return;
      }

      if (options?.replace) {
        router.replace(href);
      } else {
        router.push(href);
      }
    },
    [enabled, router, dispatch],
  );

  return { sessionIdFromUrl, navigateToSession };
}
