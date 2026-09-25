"use client";

/**
 * UrlStateDoor — routes `@ai-matrx/kit/url-state` (`commitUrlParams`,
 * `useUrlState`, `useMirroredUrlState`) through the one address door.
 *
 * With no router injected, the kit writes `history.replaceState(
 * window.history.state, …)`: the `__NA` marker rides along, Next's patch is
 * skipped, and `useSearchParams` stays stale on every page that mixes the kit
 * with Next's hook (lane URL-STATE, 2026-09-24). Injecting the door's two
 * writers keeps the kit's own event and no-op rules, and makes Next agree.
 *
 * Registered at module evaluation (not in an effect) so it is in place before
 * any child's mount effect commits a param. Mounted once in app/layout.tsx.
 */
import { setUrlStateRouter } from "@ai-matrx/kit/url-state";
import {
  pushAddressWithoutNavigating,
  replaceAddressWithoutNavigating,
} from "@/lib/url-state/addressWithoutNavigating";

export function installUrlStateDoor(): void {
  if (typeof window === "undefined") return;
  setUrlStateRouter({
    push: pushAddressWithoutNavigating,
    replace: replaceAddressWithoutNavigating,
  });
}

installUrlStateDoor();

export function UrlStateDoor(): null {
  return null;
}
