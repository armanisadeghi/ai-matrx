/**
 * supabaseErrorCapture.ts
 *
 * Wraps a Supabase browser client in a transparent Proxy so EVERY `.from()`,
 * `.rpc()`, and `.schema(...).from()/.rpc()` call that resolves with an `error`
 * (or whose promise rejects) is captured into `errorCaptureStore` with full
 * raw PostgREST detail — code, message, details, hint, status — plus the table
 * / function name, the operation verb, and the route it fired from.
 *
 * This is the ONE place the app gains global Supabase-error capture. It is
 * applied once, in `utils/supabase/client.ts`, so all ~1,000 call sites inherit
 * capture with zero changes. The proxy is read-only and side-effect-free aside
 * from the capture call: every real method runs on the real client/builder via
 * `Reflect`/`apply`, so private state, `instanceof`, and chaining all behave
 * exactly as before. Only `from` / `rpc` / `schema` are intercepted — `auth`,
 * `storage`, `functions`, `realtime`, `channel` pass straight through.
 *
 * Browser-only by construction: it wraps the browser client. The server client
 * is untouched (server errors surface in server logs; this layer is about the
 * user's in-browser, on-page view).
 *
 * IT IS ALSO WHERE THE SESSION BARRIER LIVES (DD-237). Because this is the ONE
 * proxy every browser `.from()` / `.rpc()` / `.schema()` passes through, it is
 * the only place that can guarantee "no authenticated read leaves this client
 * before the session is attached" without asking a thousand call sites to
 * remember. The rule, the measurements behind it and the budgets are in
 * `utils/supabase/sessionBarrier.ts`; this file holds the two seams that call
 * it — a bounded wait before the request, and one retry after a refusal that
 * means the request carried no identity. `pnpm check:session-first-reads`
 * fails if either seam or the install call goes missing, or if browser code
 * starts building a Supabase client that does not pass through here.
 */

import { extractErrorMessage } from "@/utils/errors";
import { isTransportFailure } from "@ai-matrx/data/net";
import {
  captureError,
  type CapturedOperation,
} from "@/lib/diagnostics/errorCaptureStore";
import {
  awaitSessionBeforeSend,
  canSendImmediately,
  installSessionBarrier,
  endSessionIfUnverifiable,
  isSessionRefusal,
  recoverSessionForRetry,
  reportSessionRetryOutcome,
  sessionStateMarker,
  shouldRecoverSession,
} from "@/utils/supabase/sessionBarrier";
import {
  browserAdminLaneOpen,
  installAdminLane,
} from "@/utils/supabase/adminLane";

/** Context threaded through a single query-builder chain. */
interface ChainContext {
  operation?: CapturedOperation;
  schema?: string;
  relation?: string;
  captureEnabled?: boolean;
  /**
   * Set by a retry owner for an attempt it may repeat: return `false` for a
   * failure the owner WILL ask again about, so only the attempt that is
   * handed back to the caller is captured. Any other failure — a 42501, a
   * 23505, anything the owner returns untouched — still captures here.
   */
  captureFilter?: (failure: unknown) => boolean;
  /**
   * The signal the caller handed `.abortSignal()`. When the CALLER aborts it
   * (supersede, unmount — anything but a timeout), the abort-shaped answer is
   * its own control flow and the caller owns the outcome: nothing is filed.
   */
  callerSignal?: AbortSignal;
}

/** Marks a proxy so we never double-wrap. */
const WRAPPED = Symbol.for("matrx.supabaseCaptureWrapped");
const SET_CAPTURE_ENABLED = Symbol.for("matrx.supabaseCaptureEnabled");
const SET_CAPTURE_FILTER = Symbol.for("matrx.supabaseCaptureFilter");
const capturedErrorIds = new WeakMap<object, string>();

/** Find the original capture through typed wrappers without copying an incident. */
export function supabaseErrorCaptureId(error: unknown): string | undefined {
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const id = capturedErrorIds.get(current);
    if (id) return id;
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

/** Opt one query out when its caller owns retry plus final capture. */
export function suppressSupabaseErrorCapture<T>(builder: T): T {
  if (
    builder &&
    (typeof builder === "object" || typeof builder === "function")
  ) {
    const setEnabled = Reflect.get(builder as object, SET_CAPTURE_ENABLED);
    if (typeof setEnabled === "function") setEnabled(false);
  }
  return builder;
}

/**
 * Defer capture of the failures a retry owner is about to retry. `keep` sees
 * the PostgREST `error` (or the thrown value) and returns `false` only for a
 * failure the owner will ask again about; every other failure still captures.
 * No-op on anything that is not a wrapped builder (a plain Promise, a mock).
 */
export function filterSupabaseErrorCapture<T>(
  builder: T,
  keep: (failure: unknown) => boolean,
): T {
  if (
    builder &&
    (typeof builder === "object" || typeof builder === "function")
  ) {
    const setFilter = Reflect.get(builder as object, SET_CAPTURE_FILTER);
    if (typeof setFilter === "function") setFilter(keep);
  }
  return builder;
}

/**
 * "No such function on this database" — PostgREST PGRST202 / Postgres 42883.
 * The ONE predicate for a door that is not (yet) on the database answering.
 */
export function isAbsentDoorFailure(failure: unknown): boolean {
  if (!failure || typeof failure !== "object") return false;
  const code = (failure as { code?: unknown }).code;
  return code === "PGRST202" || code === "42883";
}

/**
 * For a caller that OWNS a working fallback when the door is absent (a door
 * applied on the clone, not yet on the main database): an absent door is not
 * filed, every other failure still is. Use only where the fallback really
 * answers — a caller that just shows "unavailable" must let the capture stand.
 */
export function allowAbsentDoor<T>(builder: T): T {
  return filterSupabaseErrorCapture(
    builder,
    (failure) => !isAbsentDoorFailure(failure),
  );
}

function isAbortShaped(failure: unknown): boolean {
  if (!failure || typeof failure !== "object") return false;
  if ((failure as { name?: unknown }).name === "AbortError") return true;
  return isAbortResultError(failure as { message?: string; hint?: string });
}

/**
 * The caller aborted its own request (not a timeout): the answer is the
 * caller's control flow, never an incident. A timeout signal's reason is a
 * `TimeoutError` — that is a failure and still captures.
 */
function cancelledByCaller(ctx: ChainContext, failure: unknown): boolean {
  const signal = ctx.callerSignal;
  if (!signal?.aborted || !isAbortShaped(failure)) return false;
  const reasonName = (signal.reason as { name?: unknown } | undefined)?.name;
  return reasonName !== "TimeoutError";
}

/** Fail open: a filter that throws must never hide a failure. */
function shouldCapture(ctx: ChainContext, failure: unknown): boolean {
  if (ctx.captureEnabled === false) return false;
  try {
    if (cancelledByCaller(ctx, failure)) return false;
  } catch {
    /* fail open */
  }
  if (!ctx.captureFilter) return true;
  try {
    return ctx.captureFilter(failure) !== false;
  } catch {
    return true;
  }
}

/** DML verbs whose presence in the chain tells us the operation type. */
const OPERATION_METHODS: Record<string, CapturedOperation> = {
  select: "select",
  insert: "insert",
  update: "update",
  upsert: "upsert",
  delete: "delete",
};

interface PostgrestLikeResult {
  error?: {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  } | null;
  status?: number;
  statusText?: string;
}

// PGRST002 is special: PostgREST could not load its schema cache, so it did
// not execute the requested query. Replaying that exact builder is therefore
// safe even when the caller was issuing a mutation. Keep the recovery here,
// before capture, so every browser Supabase call gets the same behavior and a
// recovered infrastructure restart never enters the repair queue.
const SCHEMA_CACHE_RETRY_DELAYS_MS = [250, 750] as const;

export function isSchemaCacheUnavailableResult(
  result: PostgrestLikeResult,
): boolean {
  return result.error?.code === "PGRST002";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Preserve the HTTP fact when PostgREST supplies no useful error sentence. */
export function postgrestResultErrorMessage(
  result: PostgrestLikeResult,
): string {
  const message = result.error?.message?.trim();
  if (message) return message;

  const status =
    typeof result.status === "number" ? `HTTP ${result.status}` : "an error";
  const statusText = result.statusText?.trim();
  const statusLabel = statusText ? `${status} (${statusText})` : status;
  return `Supabase request failed with ${statusLabel}; PostgREST returned no error message`;
}

/**
 * A cancelled request is NOT a failure — it's expected control flow (navigation,
 * unmount, a superseding fetch calling `controller.abort()`). postgrest-js does
 * not reject on abort: it RESOLVES with an error object
 * (`{ message: "AbortError: The operation was aborted.", hint: "Request was
 * aborted (timeout or manual cancellation)", code: "" }`), so it lands in
 * `captureResult` (the resolved-error path), never the exception path where
 * `err.name` would already carry "AbortError".
 *
 * Detect that shape and tag it with the canonical `name: "AbortError"` — the
 * same signature `captureApiError` uses — so the single `request-aborted`
 * downgrade rule silences aborts across every Supabase call site, not just the
 * throwing ones. Without this, one cancelled RPC surfaces as a red error.
 */
// MATRX-EXCEPTION: `?? ""` defaults two explicitly-optional string fields
// before a substring match — pure classification logic, not a boundary write.
function isAbortResultError(e: { message?: string; hint?: string }): boolean {
  const msg = (e.message ?? "").toLowerCase();
  const hint = (e.hint ?? "").toLowerCase();
  return (
    msg.startsWith("aborterror") ||
    msg.includes("the operation was aborted") ||
    msg.includes("signal is aborted") ||
    hint.includes("request was aborted")
  );
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Clean a raw stack down to the application frames that issued the query.
 * Drops the capture-layer frames and node_modules / framework noise so the
 * result points at the component / hook / service that made the failing call.
 */
function cleanCallSite(rawStack: string | undefined): string | undefined {
  if (!rawStack) return undefined;
  const lines = rawStack.split("\n");
  const frames = lines
    .filter((l) => /\s+at\s/.test(l))
    .filter((l) => !l.includes("/lib/diagnostics/supabaseErrorCapture"))
    .filter((l) => !l.includes("node_modules"))
    .filter((l) => !/\bat\s+(Object\.)?then\b/.test(l))
    .map((l) => l.trim());
  const app = frames.slice(0, 8);
  return app.length ? app.join("\n") : undefined;
}

/** JSON-safe serialization of a thrown value (Error or arbitrary object). */
function serializeThrown(err: unknown): unknown {
  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    // Copy the instance's own enumerable props (custom error subclasses often
    // attach fields like `code`/`status`/`details`) — Object.assign does the
    // reflection without needing a cast on the non-indexable Error type.
    Object.assign(out, err);
    return out;
  }
  return err;
}

function captureResult(
  ctx: ChainContext,
  res: PostgrestLikeResult,
  caller: Error,
): void {
  const e = res.error;
  if (!e) return;
  const id = captureError({
    source: "supabase-postgrest",
    operation: ctx.operation,
    schema: ctx.schema,
    relation: ctx.relation,
    code: typeof e.code === "string" ? e.code : undefined,
    message: postgrestResultErrorMessage(res),
    details: typeof e.details === "string" ? e.details : undefined,
    hint: typeof e.hint === "string" ? e.hint : undefined,
    status: typeof res.status === "number" ? res.status : undefined,
    // Normalize expected browser control/transport failures so narrow tier
    // rules can keep them visible locally without filing a server repair job.
    // Real PostgREST/Postgres responses carry a code/status and stay loud.
    name: isAbortResultError(e)
      ? "AbortError"
      : isTransportFailure(e)
        ? "TypeError"
        : undefined,
    callSite: cleanCallSite(caller.stack),
    // DD-237: what the client knew about its own session when this failed.
    // A bare `42501 permission denied` cost three lanes a day each because
    // nothing recorded whether the request had an identity at all.
    sessionState: sessionStateMarker(),
    raw: e,
  });
  capturedErrorIds.set(e, id);
}

function captureException(
  ctx: ChainContext,
  err: unknown,
  caller: Error,
): void {
  const status = (err as { status?: number } | undefined)?.status;
  const id = captureError({
    source: "supabase-exception",
    operation: ctx.operation,
    schema: ctx.schema,
    relation: ctx.relation,
    name: err instanceof Error ? err.name : undefined,
    message: extractErrorMessage(err),
    stack: err instanceof Error ? err.stack : undefined,
    status: typeof status === "number" ? status : undefined,
    callSite: cleanCallSite(caller.stack),
    sessionState: sessionStateMarker(),
    raw: serializeThrown(err),
  });
  if (err && typeof err === "object") capturedErrorIds.set(err, id);
}

/**
 * Wrap a PostgREST query/filter builder. The builder is a thenable: awaiting it
 * runs the request. We intercept `then` to inspect the resolved `{ data, error }`
 * and the rejection path, and we keep every chained return wrapped so the
 * operation verb is tracked no matter where in the chain it appears.
 */
function wrapBuilder<T extends object>(builder: T, ctx: ChainContext): T {
  if (
    !builder ||
    (typeof builder !== "object" && typeof builder !== "function")
  ) {
    return builder;
  }
  if ((builder as { [WRAPPED]?: boolean })[WRAPPED]) return builder;

  const proxy = new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === WRAPPED) return true;
      if (prop === SET_CAPTURE_ENABLED) {
        return (enabled: boolean) => {
          ctx.captureEnabled = enabled;
        };
      }
      if (prop === SET_CAPTURE_FILTER) {
        return (keep: (failure: unknown) => boolean) => {
          ctx.captureFilter = keep;
        };
      }

      // Track the operation verb as the chain is constructed.
      if (typeof prop === "string" && prop in OPERATION_METHODS) {
        if (!ctx.operation || ctx.operation === "unknown") {
          ctx.operation = OPERATION_METHODS[prop];
        }
      }

      if (prop === "then") {
        const thenFn = (target as { then?: unknown }).then;
        if (typeof thenFn !== "function") return undefined;
        return (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => {
          // Captured cheaply at execution time; `.stack` is only formatted
          // (the expensive part) if we actually capture an error below.
          const caller = new Error("supabase-call-site");
          // THE SESSION BARRIER (DD-237), second seam. One retry per chain: a
          // refusal that means "this request carried no identity" asks for the
          // session back and replays the request once. A 42501 is raised before
          // the statement does anything and PostgREST runs each request in its
          // own transaction, so replaying a refused write replays nothing.
          let sessionRetried = false;
          // Set while the one session retry is in flight, so its OWN result —
          // not the token that preceded it — decides what gets announced.
          let awaitingRetryOutcome = false;
          const execute = (retryIndex: number): unknown =>
            Reflect.apply(thenFn, target, [
              async (res: unknown) => {
                if (awaitingRetryOutcome) {
                  awaitingRetryOutcome = false;
                  try {
                    if (res && typeof res === "object") {
                      reportSessionRetryOutcome(ctx, res as PostgrestLikeResult);
                    }
                  } catch {
                    /* reporting must never eat the result */
                  }
                }
                if (
                  res &&
                  typeof res === "object" &&
                  isSchemaCacheUnavailableResult(res as PostgrestLikeResult) &&
                  retryIndex < SCHEMA_CACHE_RETRY_DELAYS_MS.length
                ) {
                  await wait(SCHEMA_CACHE_RETRY_DELAYS_MS[retryIndex]);
                  return execute(retryIndex + 1);
                }
                try {
                  if (
                    res &&
                    typeof res === "object" &&
                    !sessionRetried &&
                    isSessionRefusal(res as PostgrestLikeResult) &&
                    shouldRecoverSession(ctx)
                  ) {
                    sessionRetried = true;
                    // A token this database can never verify (minted by another
                    // auth authority) is ended and the person sent to sign in —
                    // retrying it would only repeat the same refusal.
                    if (!(await endSessionIfUnverifiable(ctx, res as PostgrestLikeResult))) {
                      if (await recoverSessionForRetry(ctx)) {
                        awaitingRetryOutcome = true;
                        return execute(retryIndex);
                      }
                    }
                  }
                } catch {
                  /* the retry is a recovery; its failure never eats the result */
                }
                try {
                  if (res && typeof res === "object" && "error" in res) {
                    if (
                      (res as PostgrestLikeResult).error &&
                      shouldCapture(ctx, (res as PostgrestLikeResult).error)
                    ) {
                      captureResult(ctx, res as PostgrestLikeResult, caller);
                    }
                  }
                } catch {
                  /* capture must never break the caller */
                }
                return onFulfilled ? onFulfilled(res) : res;
              },
              (err: unknown) => {
                try {
                  if (shouldCapture(ctx, err)) {
                    captureException(ctx, err, caller);
                  }
                } catch {
                  /* capture must never break the caller */
                }
                if (onRejected) return onRejected(err);
                throw err;
              },
            ]);

          // THE SESSION BARRIER (DD-237), first seam. The synchronous path is
          // the one every healthy request takes — an attached session, a door
          // declared anonymous-by-design, or a browser with no auth cookie —
          // and it is byte-identical to the behaviour before the barrier. Only
          // a request whose session is EXPECTED but not yet in hand waits, and
          // only for a bounded budget.
          // Fail OPEN, always: a barrier that threw would take every read in
          // the app with it, which is a far worse defect than the one it fixes.
          let gate = true;
          try {
            gate = canSendImmediately(ctx);
          } catch {
            gate = true;
          }
          if (gate) return execute(0);
          return (async () => {
            try {
              await awaitSessionBeforeSend(ctx);
            } catch {
              /* the wait is an optimization; the request still goes */
            }
            return execute(0);
          })();
        };
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          if (
            prop === "abortSignal" &&
            typeof AbortSignal !== "undefined" &&
            args[0] instanceof AbortSignal
          ) {
            ctx.callerSignal = args[0];
          }
          const result = Reflect.apply(value, target, args);
          // Most builder methods return `this` (the real target) for chaining.
          if (result === target) return proxy;
          // A method that returns another builder/thenable stays wrapped so the
          // terminal `then` is always our instrumented one.
          if (
            result &&
            (typeof result === "object" || typeof result === "function") &&
            (isThenable(result) ||
              (result as { [WRAPPED]?: boolean })[WRAPPED] !== undefined ||
              prop === "returns" ||
              prop === "select" ||
              prop === "single" ||
              prop === "maybeSingle")
          ) {
            return wrapBuilder(result as object, ctx);
          }
          return result;
        };
      }
      return value;
    },
  });

  return proxy;
}

/** Wrap a `.schema(name)` scope so its `from`/`rpc` carry the schema name. */
function wrapScope<T extends object>(scope: T, schema: string): T {
  if ((scope as { [WRAPPED]?: boolean })[WRAPPED]) return scope;
  return new Proxy(scope, {
    get(target, prop, receiver) {
      if (prop === WRAPPED) return true;
      const value = Reflect.get(target, prop, receiver);
      if (prop === "from" && typeof value === "function") {
        return (relation: string, ...rest: unknown[]) =>
          wrapBuilder(
            Reflect.apply(value, target, [relation, ...rest]) as object,
            { schema, relation },
          );
      }
      if (prop === "rpc" && typeof value === "function") {
        return (fn: string, ...rest: unknown[]) =>
          wrapBuilder(Reflect.apply(value, target, [fn, ...rest]) as object, {
            operation: "rpc",
            schema,
            relation: fn,
          });
      }
      // `.schema(a).schema(b)` (a service re-scoping a scoped client) must stay
      // captured — the raw scope's `.schema` returned an unwrapped client and
      // every read through it failed invisibly (RC-B12 round 4: scheduling).
      if (prop === "schema" && typeof value === "function") {
        return (name: string, ...rest: unknown[]) =>
          wrapScope(Reflect.apply(value, target, [name, ...rest]) as object, name);
      }
      return value;
    },
  });
}

/**
 * Wrap a Supabase browser client for global error capture. Intercepts only the
 * PostgREST surface (`from` / `rpc` / `schema`); everything else is passed
 * through untouched.
 */
export function wrapClientForCapture<T>(client: T): T {
  if (typeof window === "undefined") return client; // browser-only
  if (
    client === null ||
    (typeof client !== "object" && typeof client !== "function")
  ) {
    return client;
  }
  const target = client as object;
  if ((target as { [WRAPPED]?: boolean })[WRAPPED]) return client;

  // THE SESSION BARRIER (DD-237) binds here, at client construction — the
  // earliest point `INITIAL_SESSION` can be heard, which is what makes the
  // barrier's wait free on every healthy request. Idempotent and browser-only.
  installSessionBarrier(target);

  // THE ADMIN LANE binds here too, for the same reason: this is the ONE door
  // every browser client passes through. Each PostgREST request decides at
  // send time from the current path — /administration/** rides the lane,
  // every user page does not. Rule and reasons: utils/supabase/adminLane.ts.
  installAdminLane(target, browserAdminLaneOpen);

  return new Proxy(target, {
    get(target, prop, receiver) {
      if (prop === WRAPPED) return true;
      const value = Reflect.get(target, prop, receiver);
      if (prop === "from" && typeof value === "function") {
        return (relation: string, ...rest: unknown[]) =>
          wrapBuilder(
            Reflect.apply(value, target, [relation, ...rest]) as object,
            { relation },
          );
      }
      if (prop === "rpc" && typeof value === "function") {
        return (fn: string, ...rest: unknown[]) =>
          wrapBuilder(Reflect.apply(value, target, [fn, ...rest]) as object, {
            operation: "rpc",
            relation: fn,
          });
      }
      if (prop === "schema" && typeof value === "function") {
        return (name: string, ...rest: unknown[]) =>
          wrapScope(
            Reflect.apply(value, target, [name, ...rest]) as object,
            name,
          );
      }
      return value;
    },
  }) as T;
}
