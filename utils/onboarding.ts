// utils/onboarding.ts
//
// "New user" onboarding flag. Lives on `auth.users.user_metadata` so it is
// read for free at SSR boot (no extra query) and survives in the validated
// `getUser()` payload.
//
// Semantics: the flag stores COMPLETION. A user is "new" until they (or a
// future trigger) flip `onboarding_completed` to `true`. Absence of the key
// therefore means "new" — which makes every existing and brand-new user a
// new user with zero backfill required.
//
// 🚨 THE FUNNEL MAY ONLY FIRE ON `/dashboard` — Arman's ruling, 2026-08-12.
// `/welcome` is the DEFAULT landing for someone arriving with no page in mind,
// NOT an override of a real destination. A new user is the MOST important
// person to deliver to what they asked for: they came to make meta titles or
// try agent creation, and that intent is exactly what earned us the signup.
// Dropping them on /welcome instead is the worst thing we can do.
//
//   no destination / the generic hub (`/dashboard`)  ->  /welcome
//   any specific destination (`/agents/all`, `/tasks`, …)  ->  that page
//
// So: this funnel lives in EXACTLY ONE place — `app/(core)/dashboard/layout.tsx`
// — because /dashboard is the generic hub and "send me to the hub" means "I have
// no particular intent". **Never add a second call site**, never put it in the
// root layout, the middleware, or an auth action: each of those sees users who
// DO have a destination, and would silently eat it. The destination system
// (`utils/auth/auth-destination.ts`) never routes through here at all.

import type { User } from "@supabase/supabase-js";

export const ONBOARDING_METADATA_KEY = "onboarding_completed" as const;

/**
 * Where a NEW user lands when they arrive with no particular destination.
 * Reached only via the `/dashboard` funnel above — never by overriding a
 * destination the user actually asked for.
 */
export const WELCOME_ROUTE = "/welcome";

type MetadataCarrier =
  | {
      user_metadata?: Record<string, unknown> | null;
    }
  | null
  | undefined;

/**
 * True when onboarding has been explicitly completed. Anything other than the
 * literal boolean `true` (missing, false, null, undefined) counts as NOT done.
 */
export function isOnboardingComplete(user: MetadataCarrier): boolean {
  return user?.user_metadata?.[ONBOARDING_METADATA_KEY] === true;
}

/** Inverse of {@link isOnboardingComplete} — the user still needs onboarding. */
export function isNewUser(user: MetadataCarrier): boolean {
  return !isOnboardingComplete(user);
}

/** Narrowed Supabase User overload for call sites that already have one. */
export function isNewSupabaseUser(user: User | null): boolean {
  return isNewUser(user);
}
