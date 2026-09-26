"use client";

// lib/entity-list/useListSearchParams.ts
//
// THE FIRST RENDER READS THE URL (2026-09-26).
//
// `@ai-matrx/kit/url-state`'s `useUrlSearchParams` is a `useSyncExternalStore`
// over `window.location.search` whose SERVER snapshot is "" — it cannot know
// the request's query string. React renders the server pass AND the hydration
// pass with that server snapshot, so every URL-backed list opened at
// `/workflows/all?scope=orgs&q=seo` first painted Mine with an empty search,
// then flipped to My Orgs once the client snapshot took over (seen on
// localhost, the mandate-sharing verification).
//
// Next's `useSearchParams()` carries the real request query into both of those
// passes. So before hydration completes this returns Next's params, and after it
// the kit's live snapshot, which also follows `commitUrlParams` and popstate.
// Both describe the same address, so the switch is invisible. Outside a Next
// router (unit tests) Next's hook answers null and the kit's value is used
// throughout.

import { useMemo, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useUrlSearchParams } from "@ai-matrx/kit/url-state";

const noopSubscribe = () => () => {};

/** False during the server render and the hydration render, true after. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function useListSearchParams(): URLSearchParams {
  const live = useUrlSearchParams();
  const request = useSearchParams();
  const hydrated = useHydrated();
  const requestString = request?.toString() ?? null;
  const fromRequest = useMemo(
    () => (requestString === null ? null : new URLSearchParams(requestString)),
    [requestString],
  );
  return !hydrated && fromRequest ? fromRequest : live;
}
