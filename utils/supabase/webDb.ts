/**
 * utils/supabase/webDb.ts
 *
 * Marketing, crawler, and CMS records live in the dedicated `web` Postgres
 * schema. Persisted data is queried directly through Supabase under the
 * caller's JWT; the scraper service is only a live crawl command/stream edge.
 *
 *   const db = webDb(supabase); // .from(...) / .rpc(...) resolve against web
 *
 * Works with browser, SSR, and admin Supabase clients.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type WebTableName = keyof Database["web"]["Tables"];

/** A Supabase client scoped to the canonical `web` schema. */
export function webDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("web");
}

/**
 * Raised before a web-schema request is constructed when the browser does not
 * have a usable authenticated session. This keeps session-hydration races from
 * reaching PostgREST as anonymous requests and surfacing as misleading table
 * permission errors.
 */
export class WebAuthenticationRequiredError extends Error {
  constructor(
    message = "Sign in before loading marketing data.",
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "WebAuthenticationRequiredError";
  }
}

/**
 * Resolve the caller's browser session before exposing the web query builder.
 * Every client-side marketing data service must use this helper rather than
 * calling webDb directly.
 */
export async function requireAuthenticatedSupabaseSession<
  C extends SupabaseClient<Database>,
>(client: C) {
  const sessionResult = await client.auth
    .getSession()
    .catch((error: unknown) => {
      throw new WebAuthenticationRequiredError(
        "Your sign-in session could not be verified. Refresh and try again.",
        error,
      );
    });

  if (sessionResult.error) {
    throw new WebAuthenticationRequiredError(
      "Your sign-in session could not be verified. Refresh and try again.",
      sessionResult.error,
    );
  }

  if (!sessionResult.data.session?.access_token) {
    throw new WebAuthenticationRequiredError();
  }

  return sessionResult.data.session;
}

export async function authenticatedWebDb<C extends SupabaseClient<Database>>(
  client: C,
) {
  await requireAuthenticatedSupabaseSession(client);

  return webDb(client);
}
