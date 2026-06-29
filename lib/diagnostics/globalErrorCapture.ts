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

let installed = false;
/** Guards against capturing a console.error that fires from inside capture. */
let inConsoleCapture = false;

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
      captureError({
        source: "runtime-exception",
        message: event.message || extractErrorMessage(err) || "Uncaught error",
        name: err instanceof Error ? err.name : undefined,
        stack: err instanceof Error ? err.stack : undefined,
        raw: serializeThrown(err ?? event.message),
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
        captureError({
          source: "unhandled-rejection",
          message: extractErrorMessage(reason) || "Unhandled promise rejection",
          name: reason instanceof Error ? reason.name : undefined,
          stack: reason instanceof Error ? reason.stack : undefined,
          raw: serializeThrown(reason),
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
        inConsoleCapture = true;
        const message = args
          .map((a) =>
            typeof a === "string"
              ? a
              : a instanceof Error
                ? a.message
                : (() => {
                    try {
                      return JSON.stringify(a);
                    } catch {
                      return String(a);
                    }
                  })(),
          )
          .join(" ");
        const errArg = args.find((a) => a instanceof Error) as
          | Error
          | undefined;
        captureError({
          source: "console-error",
          message: message || "console.error",
          name: errArg?.name,
          stack: errArg?.stack,
          raw: errArg ? serializeThrown(errArg) : args,
        });
      } catch {
        /* capture must never break the caller */
      } finally {
        inConsoleCapture = false;
      }
    };
  }
}
