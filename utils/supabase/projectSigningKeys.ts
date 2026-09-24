// utils/supabase/projectSigningKeys.ts — the PUBLIC half of the project's JWT
// signing key, pinned so a server render verifies a session with no network.
//
// WHY (lane SESSION-VERDICT, 2026-09-24). `getClaims()` verifies the access
// token locally, but it needs the project's JWKS to do it, and auth-js keeps
// that JWKS in a module-level cache (`GLOBAL_JWKS`, 10-minute TTL). A cold
// Vercel function starts with that cache EMPTY, so its first render fetches
// `/auth/v1/.well-known/jwks.json` inside the 2.5s identity budget — while the
// same cold function is still evaluating its module graph. Production logs:
// every `[getServerAuth] … AuthRetryableFetchError: aborted due to timeout`
// in the three days to 2026-09-24 was a first render (/b/<booking> ×5,
// /privacy-policy ×2), the proxy logged ZERO `AUTH UNREACHABLE` for the same
// requests, and the endpoint answers in ~0.19s from a warm client. So it is not
// the AUTH-504 class (a saturated database behind GoTrue); it is one network
// fetch that a render never needed to make.
//
// Supplying the key here makes `fetchJwk` answer from this list first
// (auth-js `fetchJwk(kid, jwks)`): no fetch, no budget, no timeout.
//
// ROTATION IS SAFE BY CONSTRUCTION. A token signed by a key NOT listed here
// misses the list and auth-js falls through to the cached/fetched JWKS exactly
// as before — slower on a cold function, never wrong. After a rotation, add
// the new public key here (never remove the old one until its tokens expire).
// `tsx scripts/check-session-verdict.ts --live` compares this list with the live JWKS.
//
// These are PUBLIC keys (the JWKS endpoint serves them to anyone). Nothing
// secret lives in this file.

import type { JWK } from "@supabase/supabase-js";

export const PROJECT_SIGNING_KEYS: JWK[] = [
  {
    alg: "ES256",
    crv: "P-256",
    ext: true,
    key_ops: ["verify"],
    kid: "a00aed0b-202c-483a-91ff-fc74719a3bb2",
    kty: "EC",
    use: "sig",
    x: "guqOsgjJqGVU6g_K0iIXKrzixlkeXKOqkPUQCconp6U",
    y: "39zQtkzlfQuPf_MtIhYmMdxNQpIR2Pkl11AToywaslY",
  },
];
