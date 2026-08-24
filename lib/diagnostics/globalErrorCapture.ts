/**
 * globalErrorCapture.ts
 *
 * The single owner of the global browser error listeners — `window` 'error'
 * (uncaught exceptions), `unhandledrejection` (dropped promises), and a
 * `console.error` wrapper. Each feeds the systemwide `errorCaptureStore`.
 *
 * Installed ONCE for EVERY user (not just admins) from `DeferredSingletons`.
 * Capture is in-memory and cheap; only the Error Inspector UI is admin-gated.
 * Capturing for everyone is what makes the future "surface certain errors to
 * end users" feature possible — the data is already there, gated by tier.
 *
 * This REPLACES the old per-listener capture in `AdminDebugContextCollector`
 * (now retired) — there is exactly one set of these listeners in the app.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { extractErrorMessage } from "@/utils/errors";
import { isKnownThirdPartyNoise } from "@/lib/console-noise";
import { isChunkLoadError } from "@/components/errors/chunk-load-recovery";

let installed = false;
/** Guards against capturing a console.error that fires from inside capture. */
let inConsoleCapture = false;

/** JSON-safe serialization that preserves Error objects at any nesting depth. */
export function serializeForErrorCapture(
  value: unknown,
  includeStack = true,
  seen: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };
    if (includeStack && value.stack) out.stack = value.stack;
    if (value.cause !== undefined) {
      out.cause = serializeForErrorCapture(value.cause, includeStack, seen);
    }
    for (const [key, nested] of Object.entries(value)) {
      out[key] = serializeForErrorCapture(nested, includeStack, seen);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      serializeForErrorCapture(item, includeStack, seen),
    );
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = serializeForErrorCapture(nested, includeStack, seen);
  }
  return out;
}

/**
 * Install the global error listeners. Idempotent and browser-only — safe to
 * call from any client effect; subsequent calls are no-ops.
 */
export function installGlobalErrorCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // ── Uncaught runtime exceptions ──────────────────────────────────────────
  window.addEventListener("error", (event: ErrorEvent) => {
    try {
      // Resource-load errors (img/script 404) fire 'error' with no `error`
      // object and an empty message — skip those, they aren't JS exceptions.
      if (!event.message && !event.error) return;
      const err = event.error;
      if (isChunkLoadError(err ?? { message: event.message })) return;
      const scriptUrl = event.filename || undefined;
      const scriptLine = event.lineno || undefined;
      const scriptColumn = event.colno || undefined;
      const baseRaw =
        err != null
          ? serializeForErrorCapture(err)
          : event.message
            ? { message: event.message }
            : undefined;
      const raw =
        scriptUrl || scriptLine || scriptColumn
          ? {
              ...(typeof baseRaw === "object" && baseRaw !== null
                ? (baseRaw as Record<string, unknown>)
                : { thrown: baseRaw }),
              scriptUrl,
              line: scriptLine,
              column: scriptColumn,
            }
          : baseRaw;
      captureError({
        source: "runtime-exception",
        message: event.message || extractErrorMessage(err) || "Uncaught error",
        name: err instanceof Error ? err.name : undefined,
        stack: err instanceof Error ? err.stack : undefined,
        raw,
      });
    } catch {
      /* capture must never break the page */
    }
  });

  // ── Unhandled promise rejections ─────────────────────────────────────────
  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason;
        if (isChunkLoadError(reason)) return;
        captureError({
          source: "unhandled-rejection",
          message: extractErrorMessage(reason) || "Unhandled promise rejection",
          name: reason instanceof Error ? reason.name : undefined,
          stack: reason instanceof Error ? reason.stack : undefined,
          raw: serializeForErrorCapture(reason),
        });
      } catch {
        /* capture must never break the page */
      }
    },
  );

  // ── console.error wrapper (NON-DEV ONLY) ─────────────────────────────────
  // Reassigning the global console.error inserts this wrapper's frame between
  // the real caller and any downstream handler — which CORRUPTS the origin
  // attribution of Next.js's dev error overlay (it would blame this file
  // instead of the real call site). In `next dev` the overlay already surfaces
  // every console.error anyway, so the wrapper there is pure downside.
  //
  // So we only wrap OUTSIDE development. In production/preview there is no Next
  // overlay to corrupt, and the Error Inspector becomes the one surface for
  // console.error diagnostics. The passive window listeners above run in every
  // environment (they don't reassign anything, so they corrupt nothing).
  if (process.env.NODE_ENV !== "development") {
    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      originalError(...args);
      if (inConsoleCapture) return; // never recurse into our own capture
      try {
        if (isKnownThirdPartyNoise(args)) return;
        if (args.some((arg) => isChunkLoadError(arg))) return;
        inConsoleCapture = true;
        const message = args
          .map((a) =>
            typeof a === "string"
              ? a
              : a instanceof Error
                ? a.message
                : (() => {
                    try {
                      return JSON.stringify(serializeForErrorCapture(a, false));
                    } catch {
                      return String(a);
                    }
                  })(),
          )
          .join(" ");
        const errArg = args.find((a) => a instanceof Error) as
          Error | undefined;
        captureError({
          source: "console-error",
          message: message || "console.error",
          name: errArg?.name,
          stack: errArg?.stack,
          raw: serializeForErrorCapture(args),
        });
      } catch {
        /* capture must never break the caller */
      } finally {
        inConsoleCapture = false;
      }
    };
  }
}
