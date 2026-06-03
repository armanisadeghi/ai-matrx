"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsAuthenticated,
  selectFingerprintId,
} from "@/lib/redux/selectors/userSelectors";

/**
 * The kind of visitor currently looking at the page.
 *
 * - `authenticated` — signed in. Full app. Conversion nudges do not show.
 * - `first-time-guest` — no Supabase session AND no prior visit recorded
 *   for this fingerprint. Polite tone; the landing does the heavy lifting.
 * - `returning-guest` — no session, but this fingerprint has visited
 *   before. Time to convert: stronger nudges, inline cards, exit-intent.
 *
 * The split lets the same primitives speak more directly to people who
 * have already chosen to come back at least once.
 */
export type UserType =
  | "authenticated"
  | "first-time-guest"
  | "returning-guest";

const VISIT_KEY = "matrx.guest.firstSeenAt";

/**
 * Canonical "what kind of visitor is this?" hook. Read this rather than
 * re-deriving from `selectIsAuthenticated` + ad-hoc localStorage probes.
 *
 * Server render and the client's first render always report
 * `first-time-guest` for unauthenticated visitors (localStorage is not
 * available during SSR and we trust the SSR shape). After mount, the
 * hook honors the real first-seen marker.
 */
export function useUserType(): UserType {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const fingerprintId = useAppSelector(selectFingerprintId);
  const [hasReturned, setHasReturned] = useState(false);

  useEffect(() => {
    if (isAuthenticated) return;
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(VISIT_KEY);
    if (stored) {
      // Hydrate-from-storage on mount; the rule fires on every read-then-set,
      // but this is a one-shot SSR-safe sync (no cascading renders).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasReturned(true);
      return;
    }
    window.localStorage.setItem(VISIT_KEY, String(Date.now()));
  }, [isAuthenticated, fingerprintId]);

  if (isAuthenticated) return "authenticated";
  return hasReturned ? "returning-guest" : "first-time-guest";
}

/** Sugar over `useUserType` for the common boolean case. */
export function useIsGuest(): boolean {
  const t = useUserType();
  return t !== "authenticated";
}
