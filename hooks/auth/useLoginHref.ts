"use client";

/**
 * hooks/auth/useLoginHref.ts
 *
 * The client-side capture point. A "Sign in" link or a programmatic bounce in a
 * Client Component has everything it needs to preserve the user's place — the
 * route they are standing on — and dozens of them were throwing it away by
 * hard-coding `/login`.
 *
 * Rules (all inherited from `utils/auth/auth-destination.ts`):
 *   - If the current URL already carries a destination (the user is mid-flow),
 *     THAT one is passed forward. A new one is never invented.
 *   - Otherwise the current route becomes the destination.
 *   - Auth pages and off-site values are refused, so this can never loop.
 *
 * ```tsx
 * const loginHref = useLoginHref();          // "/login?redirectTo=%2Ftasks"
 * <Link href={loginHref}>Sign in</Link>
 *
 * const signUpHref = useLoginHref("/sign-up");
 * ```
 */

import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  captureAuthDestination,
  readAuthDestination,
  withAuthDestination,
} from "@/utils/auth/auth-destination";

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function currentHash(): string {
  return window.location.hash;
}

export function useAuthDestination(): string | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hash = useSyncExternalStore(subscribeToHash, currentHash, () => "");

  // Already mid-flow → carry the existing destination, never mint a second.
  const existing = readAuthDestination(searchParams);
  if (existing) return existing;

  return captureAuthDestination(pathname, searchParams, hash);
}

export function useLoginHref(target: string = "/login"): string {
  return withAuthDestination(target, useAuthDestination());
}
