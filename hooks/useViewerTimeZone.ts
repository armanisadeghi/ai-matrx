"use client";

// hooks/useViewerTimeZone.ts
//
// THE VIEWER'S TIME ZONE, SAFE TO RENDER. The server has no viewer: it renders
// in its own zone, the browser hydrates in the person's, and every label that
// names a zone or formats a time from it is a hydration mismatch (React #418 —
// verifier, 2026-09-29: /meetings rendered "Los Angeles (PDT)" on the server and
// "New York (EDT)" in the browser). Reading
// `Intl.DateTimeFormat().resolvedOptions().timeZone` inside render — directly or
// through `useState(browserTimeZone)` — is that defect.
//
// `useSyncExternalStore` renders the server snapshot ("UTC") during hydration
// and re-renders with the real zone right after, so the markup always matches.

import { useSyncExternalStore } from "react";

/** Server and hydration-pass value. */
export const SERVER_TIME_ZONE = "UTC";

function readZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || SERVER_TIME_ZONE;
  } catch {
    return SERVER_TIME_ZONE;
  }
}

// The zone does not change under a running page; nothing to subscribe to.
const subscribe = () => () => undefined;

export function useViewerTimeZone(): string {
  return useSyncExternalStore(subscribe, readZone, () => SERVER_TIME_ZONE);
}
