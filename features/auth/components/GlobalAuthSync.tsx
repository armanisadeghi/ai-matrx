"use client";

import { usePublicAuthSync } from "@/hooks/usePublicAuthSync";

/**
 * Renders nothing. Runs the auth/guest sync hook as a sibling so it adds
 * zero nodes to the tree.
 *
 * Mounted once in `app/Providers.tsx` — the ONE provider stack for the whole
 * app (the separate `PublicProviders` boundary was deleted 2026-07-28; its
 * removal cut ~25% of total build time). This gives every route, authed or
 * anonymous, a resolved identity in Redux:
 *
 * - Authed: validated session + access token + admin level (also heals
 *   routes whose layout passes no SSR-preloaded user state).
 * - Guest: browser fingerprint → `setFingerprintId` + `setAuthReady`. The
 *   fingerprint rides every backend call as `X-Fingerprint-ID`; aidream's
 *   guest registry resolves it to a stable anonymous `auth.users` UUID and
 *   persists conversations under it (promoted in place at signup).
 *
 * THE SITE IS PUBLIC. Guests are first-class users of nearly every surface —
 * this mount is what makes their backend calls authenticated-as-guest instead
 * of silently headerless. Do not gate it, and do not remove it.
 */
export function GlobalAuthSync() {
  usePublicAuthSync();
  return null;
}
