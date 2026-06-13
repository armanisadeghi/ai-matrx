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

import type { User } from "@supabase/supabase-js";

export const ONBOARDING_METADATA_KEY = "onboarding_completed" as const;

/** Onboarding destination for new users (replaces /dashboard on first login). */
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
