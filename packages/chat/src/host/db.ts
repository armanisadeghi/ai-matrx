/**
 * The db seam (PACKAGE-INDEPENDENCE §2.1, slice P6) — the ONE way package code
 * reaches the database: the host's `db`, the authenticated Supabase client it
 * passed to `<ChatProvider host={{ db }}>` / `configureChat`. RLS applies; the
 * package never builds a client of its own.
 *
 * Same names and shapes the call sites imported from the host app before
 * (`supabase`, `createClient` from `utils/supabase/client`; `getClaimsUser`
 * from `utils/supabase/claimsUser`; `schedulerDb` from
 * `utils/supabase/schedulerDb`), so moving a call site onto the db port
 * changed only its import specifier.
 *
 * Lazy and loud: importing this module reads nothing. `supabase` is a proxy
 * that resolves the configured host's `db` on every member access, and
 * `createClient()` returns it — so a module that captures `supabase` at import
 * time still reaches the client the host configures later. Used before any
 * host is configured, both throw `ChatHostNotConfiguredError`, which names the
 * remedy.
 */

import {
  AuthError,
  AuthSessionMissingError,
  type JwtPayload,
  type SupabaseClient,
  type UserAppMetadata,
  type UserMetadata,
} from "@supabase/supabase-js";
import { getChatHost } from "./configure";
import type { ChatDb } from "./contract";

/** The host's client, read at call time. */
export function createClient(): ChatDb {
  return getChatHost().db;
}

/**
 * The host's client. Every member access goes to the configured host's `db`;
 * methods are bound to it, so `const { from } = supabase` and
 * `supabase.from(…)` behave the same as on the client itself.
 */
export const supabase: ChatDb = new Proxy({} as ChatDb, {
  get(_target, key) {
    const db = getChatHost().db;
    const value: unknown = Reflect.get(db, key, db);
    return typeof value === "function" ? value.bind(db) : value;
  },
  has(_target, key) {
    return Reflect.has(getChatHost().db, key);
  },
  set(_target, key, value) {
    return Reflect.set(getChatHost().db, key, value);
  },
});

/** A client scoped to the `scheduler` schema (scheduled-task `sch_*` tables). */
export function schedulerDb<C extends ChatDb>(client: C) {
  return client.schema("scheduler");
}

// ── Who is calling, from the access token (never an auth-server round trip) ──

/**
 * The verified caller, built from the access token's claims. `id` is `sub`;
 * `app_metadata` / `user_metadata` default to `{}`.
 */
export interface ChatClaimsUser extends JwtPayload {
  id: string;
  app_metadata: UserAppMetadata;
  user_metadata: UserMetadata;
}

/** Any Supabase client — the only thing the claims read needs is `auth.getClaims`. */
export type ClaimsCapableClient = {
  auth: Pick<SupabaseClient["auth"], "getClaims">;
};

/** Is this `getClaims()` error the settled fact "nobody is signed in"? */
function isSignedOutError(error: AuthError): boolean {
  return (
    error instanceof AuthSessionMissingError ||
    error.name === "AuthSessionMissingError" ||
    error.code === "session_not_found"
  );
}

function userFromClaims(claims: JwtPayload | undefined): ChatClaimsUser | null {
  if (!claims || typeof claims.sub !== "string") return null;
  return {
    ...claims,
    id: claims.sub,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
  };
}

/**
 * `client.auth.getUser()` without the auth-server round trip: the access token
 * is verified locally (`getClaims`). Same envelope as `getUser()`, with one
 * distinction it never drew:
 *
 *  - CONFIRMED SIGNED OUT (no session, no token) → `{ user: null, error: null }`.
 *  - COULD NOT VERIFY (auth server / JWKS unreachable, a malformed or
 *    badly-signed token, or a verified token with no `sub`) → the `error` is
 *    kept, so a retry branch still fires and a screen never paints "signed
 *    out" over an outage.
 *
 * Same contract as matrx-frontend's `utils/supabase/claimsUser.ts`
 * (common-docs/systems/platform/proxy-identity/FEATURE.md); keep the two in step.
 */
export async function getClaimsUser(
  client: ClaimsCapableClient,
  jwt?: string,
): Promise<{ data: { user: ChatClaimsUser | null }; error: AuthError | null }> {
  const { data, error } = await client.auth.getClaims(jwt);
  if (error) {
    if (isSignedOutError(error)) return { data: { user: null }, error: null };
    return { data: { user: null }, error };
  }
  if (!data?.claims) return { data: { user: null }, error: null };

  const user = userFromClaims(data.claims);
  if (!user) {
    return {
      data: { user: null },
      error: new AuthError("Verified token carries no `sub` claim", 401, "bad_jwt"),
    };
  }
  return { data: { user }, error: null };
}
