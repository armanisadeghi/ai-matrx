// utils/supabase/restDeadline.ts — THE REST DEADLINE for server-side clients.
//
// WHY (2026-10-03, 22:27–22:35Z): the live Postgres host stopped completing
// connection handshakes (Supavisor: "authentication did not complete within
// 15000ms") and was restarted (postmaster start 22:34:55). Every server route
// that read the database through `utils/supabase/server.ts` waited on a
// PostgREST socket that never answered, so /dashboard, /api/compute-targets,
// every /podcast/* page and /sitemap.xml burned the whole 15s Vercel function
// limit and answered an opaque 504 FUNCTION_INVOCATION_TIMEOUT. The identity
// half was already bounded (@ai-matrx/data/next `createAuthBudget`, 2.5s); the
// DATA half had no deadline at all.
//
// THE RULE: a server-side PostgREST call that has not answered within the
// deadline is a stalled database, not a slow query — the `authenticated` role
// runs with statement_timeout=8s and the authenticator with lock_timeout=8s,
// so Postgres itself cancels anything legitimate before then. The call is
// aborted, supabase-js hands the caller an ordinary `{ error }`, and once one
// call on a client has stalled every later call on that client fails at once
// (the request has already spent its budget; waiting again would just walk
// back into the 504). The route then answers with an honest error while it
// still has time to.
//
// Browser clients are untouched: they are not inside a 15s function.
// Knob: SUPABASE_SERVER_REST_DEADLINE_MS (positive integer, milliseconds).

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** statement_timeout (8s) for `authenticated` plus one second of transport. */
export const DEFAULT_REST_DEADLINE_MS = 9_000;

export const REST_DEADLINE_ERROR_NAME = "RestDeadlineError";

const INSTALLED = Symbol.for("matrx.restDeadline.installed");

/** The configured deadline: the env knob when it is a positive integer, else the default. */
export function restDeadlineMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.SUPABASE_SERVER_REST_DEADLINE_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_REST_DEADLINE_MS;
}

function deadlineError(ms: number, url: string, stalledEarlier: boolean): Error {
  const err = new Error(
    stalledEarlier
      ? `database did not answer: an earlier call on this request stalled past the ${ms}ms deadline; failing fast (${url})`
      : `database did not answer within the ${ms}ms server deadline (${url})`,
  );
  err.name = REST_DEADLINE_ERROR_NAME;
  return err;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Returns a fetch that aborts each call after `ms` and, after the first
 * stall, refuses every later call immediately.
 */
export function deadlineFetch(inner: FetchLike, ms: number): FetchLike {
  let stalled = false;
  return async (input, init) => {
    const url = urlOf(input).split("?")[0];
    if (stalled) throw deadlineError(ms, url, true);
    const timer = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timer]) : timer;
    try {
      return await inner(input, { ...init, signal });
    } catch (cause) {
      if (timer.aborted && !init?.signal?.aborted) {
        stalled = true;
        console.error(`[restDeadline] ${deadlineError(ms, url, false).message}`);
        throw deadlineError(ms, url, false);
      }
      throw cause;
    }
  };
}

interface RestCarrier {
  rest?: { fetch?: unknown; [INSTALLED]?: boolean };
}

/**
 * Wraps the client's PostgREST fetch (every `.from()`, `.rpc()`, `.schema()`
 * reads `rest.fetch` at call time — the same seam `installAdminLane` uses).
 */
export function installRestDeadline<T>(client: T, ms: number = restDeadlineMs()): T {
  const rest = (client as RestCarrier | null)?.rest;
  if (!rest || typeof rest.fetch !== "function") {
    throw new Error(
      "[restDeadline] Supabase client has no rest.fetch to wrap — supabase-js changed shape. " +
        "Server routes would wait unbounded on a stalled database; fix this seam.",
    );
  }
  if (rest[INSTALLED]) return client;
  rest.fetch = deadlineFetch(rest.fetch as FetchLike, ms);
  rest[INSTALLED] = true;
  return client;
}

/** True when a supabase-js `{ error }` came from this deadline. */
export function isRestDeadlineError(error: { message?: string | null } | null | undefined): boolean {
  const message = error?.message ?? "";
  return message.includes(REST_DEADLINE_ERROR_NAME) || message.includes("server deadline") || message.includes("stalled past the");
}
