/**
 * supabaseErrorCapture.ts
 *
 * Wraps a Supabase browser client in a transparent Proxy so EVERY `.from()`,
 * `.rpc()`, and `.schema(...).from()/.rpc()` call that resolves with an `error`
 * (or whose promise rejects) is captured into `errorCaptureStore` with full
 * raw PostgREST detail — code, message, details, hint, status — plus the table
 * / function name, the operation verb, and the route it fired from.
 *
 * This is the ONE place the app gains global Supabase-error visibility. It is
 * applied once, in `utils/supabase/client.ts`, so all ~1,000 call sites inherit
 * capture with zero changes. The proxy is read-only and side-effect-free aside
 * from the capture call: every real method runs on the real client/builder via
 * `Reflect`/`apply`, so private state, `instanceof`, and chaining all behave
 * exactly as before. Only `from` / `rpc` / `schema` are intercepted — `auth`,
 * `storage`, `functions`, `realtime`, `channel` pass straight through.
 *
 * Browser-only by construction: it wraps the browser client. The server client
 * is untouched (server errors surface in server logs; this layer is about the
 * user's in-browser, on-page visibility).
 */

import { extractErrorMessage } from "@/utils/errors";
import {
  captureError,
  type CapturedOperation,
} from "@/lib/diagnostics/errorCaptureStore";

/** Context threaded through a single query-builder chain. */
interface ChainContext {
  operation?: CapturedOperation;
  schema?: string;
  relation?: string;
}

/** Marks a proxy so we never double-wrap. */
const WRAPPED = Symbol.for("matrx.supabaseCaptureWrapped");

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
    for (const key of Object.keys(err)) {
      out[key] = (err as unknown as Record<string, unknown>)[key];
    }
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
  captureError({
    source: "supabase-postgrest",
    operation: ctx.operation,
    schema: ctx.schema,
    relation: ctx.relation,
    code: typeof e.code === "string" ? e.code : undefined,
    message: e.message || "Supabase returned an error",
    details: typeof e.details === "string" ? e.details : undefined,
    hint: typeof e.hint === "string" ? e.hint : undefined,
    status: typeof res.status === "number" ? res.status : undefined,
    callSite: cleanCallSite(caller.stack),
    raw: e,
  });
}

function captureException(
  ctx: ChainContext,
  err: unknown,
  caller: Error,
): void {
  const status = (err as { status?: number } | undefined)?.status;
  captureError({
    source: "supabase-exception",
    operation: ctx.operation,
    schema: ctx.schema,
    relation: ctx.relation,
    name: err instanceof Error ? err.name : undefined,
    message: extractErrorMessage(err),
    stack: err instanceof Error ? err.stack : undefined,
    status: typeof status === "number" ? status : undefined,
    callSite: cleanCallSite(caller.stack),
    raw: serializeThrown(err),
  });
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
          return Reflect.apply(thenFn, target, [
            (res: unknown) => {
              try {
                if (res && typeof res === "object" && "error" in res) {
                  captureResult(ctx, res as PostgrestLikeResult, caller);
                }
              } catch {
                /* capture must never break the caller */
              }
              return onFulfilled ? onFulfilled(res) : res;
            },
            (err: unknown) => {
              try {
                captureException(ctx, err, caller);
              } catch {
                /* capture must never break the caller */
              }
              if (onRejected) return onRejected(err);
              throw err;
            },
          ]);
        };
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
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
      return value;
    },
  });
}

/**
 * Wrap a Supabase browser client for global error capture. Intercepts only the
 * PostgREST surface (`from` / `rpc` / `schema`); everything else is passed
 * through untouched.
 */
export function wrapClientForCapture<T extends object>(client: T): T {
  if (typeof window === "undefined") return client; // browser-only
  if ((client as { [WRAPPED]?: boolean })[WRAPPED]) return client;

  return new Proxy(client, {
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
  });
}
