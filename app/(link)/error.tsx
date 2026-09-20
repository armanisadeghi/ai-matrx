// app/(link)/error.tsx — WHAT A STRANGER SEES WHEN A SENT LINK FAILS.
//
// THE DEFECT THIS EXISTS FOR. Until this file, the `(link)` group had NO error
// boundary. A public form fill or a signature request that threw on the server
// — measured cause: `canceling statement due to statement timeout` under lock
// contention on `custom.record` — fell all the way through to
// `app/global-error.tsx`, and the patient or the signer on the other end of
// somebody else's link was shown "This feature is still under development",
// a vote on whether to fire an employee they have never heard of, and a "Go
// home" button into a product they do not use. That screen is the app talking
// to ITSELF. It is a lie to that person, in our internal voice, on a page that
// is not ours to speak on.
//
// THE GROUP, NOT THE ROUTE. This boundary sits at the group root on purpose:
// `/f/<id>`, `/sign/<token>` and every link route added to this group later
// inherit it without anybody remembering to. A per-route `error.tsx` would
// have to be written again for each one, and the one nobody writes is the one
// a stranger finds.
//
// WHAT IT MAY NOT SAY. No stack, no digest, no server message. A server
// message on these routes can carry a table name, a SQL fragment or a row id
// belonging to the organization whose form this is — never the reader's to
// see. `error.message` is therefore never rendered, only classified.
//
// NO DIGEST, EITHER. A digest is a support handle, and this reader has no
// support channel with us: their channel is the person who sent the link. An
// opaque code on the page would be one more thing that means nothing to them.
//
// NO DOOR INTO THE APP. No "Go to dashboard", no sign-in, no marketing link —
// the reader has no account and wants none. There is exactly one control and
// it is the one that can actually help: try again.

"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { isChunkLoadError } from "@/components/errors/chunk-load-recovery";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";

/**
 * Is this the "it was slow / it did not arrive" shape, rather than an unknown
 * failure? Only signatures that SURVIVE to the client are trusted: a timeout /
 * abort / network name, or an explicit chunk-fetch signature. A server
 * component's thrown message is redacted by Next in production, so most real
 * timeouts will land in the generic branch — which is why the generic sentence
 * has to be honest on its own and never guesses a cause.
 */
function looksTransient(error: unknown): boolean {
  if (isChunkLoadError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; message?: unknown };
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : "";
  return /^(TimeoutError|AbortError|NetworkError)$/.test(name)
    ? true
    : /statement timeout|timed? ?out|network error|failed to fetch/i.test(
        message,
      );
}

export default function LinkError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const transient = looksTransient(error);
  const chunkFailure = isChunkLoadError(error);

  useEffect(() => {
    // The one capture channel this app already uses from error boundaries.
    // It feeds the Error Inspector; nothing it holds is rendered here.
    captureReactRenderError(error, {
      boundary: "LinkError",
      relation: "app/(link)",
    });
  }, [error]);

  // A chunk that never arrived cannot be re-rendered away — only refetched.
  // Everything else is a fresh server render, which is exactly `reset()`.
  const tryAgain = () => {
    if (chunkFailure) {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-12 matrx-touch-targets">
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle
            className="h-6 w-6 text-destructive"
            aria-hidden="true"
          />
        </div>

        <h1 className="text-xl font-medium text-foreground">
          {transient
            ? "This is taking longer than it should"
            : "We couldn’t open this link"}
        </h1>

        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
          {transient
            ? "The page didn’t finish loading this time. This is usually temporary."
            : "Something went wrong on our side while opening this page. Nothing you did caused it."}
        </p>

        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Try again in a moment. If it keeps happening, ask whoever sent you
          this link to send it again.
        </p>

        <button
          type="button"
          onClick={tryAgain}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    </main>
  );
}
