"use client";

/**
 * hasBrowserSession — does this browser carry a signed-in Supabase session?
 *
 * A LOCAL read (`auth.getSession()` reads the cookie; no network). Use it to
 * skip a read that only a signed-in person can make: a signed-out visitor on
 * a shared link (`/p/<slug>`) running a public app used to fire ~17 of them
 * per run, each a 401 / "permission denied" / "Not authenticated" in the
 * console, for data a guest can never have (page-pass /p/[slug], 2026-09-27).
 * Skipping is the honest answer for those reads — the guest has none of it —
 * never a hidden failure: callers treat "no session" as an empty result.
 */

import { supabase } from "@/utils/supabase/client";

export async function hasBrowserSession(): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return Boolean(session);
  } catch {
    return false;
  }
}
