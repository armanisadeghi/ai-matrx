// utils/supabase/clientClaimsCache.ts
//
// Client-only dedup wrapper around `getClaimsUser(supabase)` — the browser
// verifies the access token's claims locally (WebCrypto against the project's
// JWKS), and `getClaimsUser` itself carries no caching. Measured on
// production: EVERY (core) page load fired two independent client-side
// claims verifications on mount — `GlobalAuthSync` → `usePublicAuthSync`
// (mounted once in `app/Providers.tsx` for every route) and a second
// shell-island reader (since retired) — each calling
// `getClaimsUser(supabase)` within the same boot window, each capable of
// firing its own `/auth/v1/.well-known/jwks.json` fetch when the SDK's
// module-level JWKS cache has not warmed yet (a fresh tab, a cold reload).
//
// This is the house pattern (module-scoped in-flight `Promise` + short-TTL
// cache — see `lib/api/broker/cache.ts`, `features/organizations/service/
// membershipsService.ts`) applied to ONE call shape: "verify the current
// browser session's claims, no explicit JWT". It never touches
// `claimsUser.ts` itself — that file is the shared client+server identity
// primitive and a server request must NEVER share another request's cached
// verdict, so caching stays scoped to this browser-only wrapper.
//
// A short TTL (not just in-flight dedup) also absorbs the case where the two
// callers do not run in the very same tick — `usePublicAuthSync` delays
// 100ms before its effect and other readers fire "after first paint".
// It is short enough that a genuine sign-in/sign-out/refresh is never served
// a stale verdict for more than a moment, and the auth-state listener below
// clears it immediately on any identity-changing event anyway.

"use client";

import { supabase } from "@/utils/supabase/client";
import { getClaimsUser, type ApiClaimsUser } from "@/utils/supabase/claimsUser";
import { pinnedSigningKeysFor } from "@/utils/supabase/projectSigningKeys";
import type { AuthError } from "@supabase/supabase-js";
import {
  endUnverifiableSession,
  isUnverifiableTokenError,
} from "@/utils/supabase/unverifiableSession";

type ClaimsResult = { data: { user: ApiClaimsUser | null }; error: AuthError | null };

const TTL_MS = 2_000;

let cached: { value: ClaimsResult; expiresAt: number } | null = null;
let inflight: Promise<ClaimsResult> | null = null;

let listenerInstalled = false;
function installInvalidationListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  supabase.auth.onAuthStateChange((event) => {
    if (
      event === "SIGNED_OUT" ||
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED" ||
      event === "USER_UPDATED"
    ) {
      cached = null;
    }
  });
}

/**
 * The current browser session's verified claims, deduped: concurrent and
 * near-concurrent callers within `TTL_MS` of each other share one
 * verification (and therefore one JWKS fetch on a cold cache) instead of
 * each running `getClaimsUser(supabase)` independently.
 */
export async function getClientClaimsUserCached(): Promise<ClaimsResult> {
  installInvalidationListener();

  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inflight) return inflight;

  inflight = getClaimsUser(supabase, undefined, {
    // Same pinned-key trick `getServerAuth.ts` uses: `fetchJwk` answers from
    // this PUBLIC key first, so a cold browser session verifies the token
    // with no `/auth/v1/.well-known/jwks.json` round trip at all. A key not
    // listed here (post-rotation) falls through to the fetched JWKS exactly
    // as before — this can only remove a network call, never change a
    // verdict. Traced live: a single `getClaimsUser(supabase)` call (this
    // wrapper's own in-flight dedup already collapsed the two call sites to
    // one) still fired `jwks.json` TWICE — auth-js/jose's own remote-JWKS
    // fetch-then-retry-on-miss behavior, not a duplicate call on our side.
    // Scoped to the authority this bundle talks to (projectSigningKeys.ts):
    // a session minted by another project must fail here, not verify.
    jwks: { keys: pinnedSigningKeysFor(process.env.NEXT_PUBLIC_SUPABASE_URL) },
  })
    .then((result) => {
      // The authority SETTLED that this browser's token is not one of its own
      // (minted by another project — live vs the nightly clone). The earliest
      // point to end it, before any read is refused (unverifiableSession.ts).
      if (isUnverifiableTokenError(result.error)) {
        void endUnverifiableSession(supabase.auth, { door: "auth.getClaims", via: "claims" });
      }
      cached = { value: result, expiresAt: Date.now() + TTL_MS };
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
