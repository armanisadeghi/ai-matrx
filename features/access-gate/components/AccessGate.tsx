"use client";

/**
 * AccessGate — the drop-in that replaces a hand-rolled "couldn't load it" branch.
 *
 *   if (site.isError || !site.data) {
 *     return <AccessGate token="web_site" id={siteId} error={site.error}
 *                        onRetry={site.refetch} fallbackHref="/marketing/sites" />;
 *   }
 *
 * It decides between a REAL error (a timeout, a broken query — show the error,
 * offer retry) and an ACCESS state (denied, deleted, missing, signed out — show
 * the explanation and the way forward). Surfaces stop having to know the
 * difference, which is the whole reason they kept getting it wrong.
 *
 * 🚨 AND WHEN THE SERVER REFUSED IN WORDS, THOSE WORDS WIN. A door that
 * answered `{code, user_message}` has already said the true thing; the gate
 * prints it verbatim, discloses the code, and offers no retry — it never
 * replaces it with a sentence composed here about what it believes the
 * viewer's access to be. That substitution is V-XT-2/N2: a conversation the
 * server refused with `404 conversation_not_found` was rendered as "You do
 * have access to it — something went wrong on our side. Try again."
 * (`service/serverRefusal.ts`).
 */

import {
  AccessDenied,
  type AccessDeniedSuggestion,
} from "@/features/access-gate/components/AccessDenied";
import { classifyDataError } from "@/features/access-gate/classifyDataError";
import { readServerRefusal } from "@/features/access-gate/service/serverRefusal";
import { useAccessGate } from "@/features/access-gate/hooks/useAccessGate";
import type { AccessRequestability } from "@/features/access-gate/types";

export interface AccessGateProps {
  /** Canonical entity token of the record the surface tried to open. */
  token: string;
  id: string;
  /**
   * The error the read produced, if any. A null-row read (no error at all) is
   * the common case and is exactly what this gate is for.
   */
  error?: unknown;
  onRetry?: () => void;
  fallbackHref?: string;
  fallbackLabel?: string;
  /**
   * Parallel failed reads hidden by this gate's early return. Each is resolved
   * independently for truthful diagnostics; none renders a second surface.
   */
  relatedReads?: ReadonlyArray<{
    token: string;
    id: string;
    error: unknown;
  }>;
  /**
   * Render this instead when the failure was a genuine fault rather than an
   * access state. Defaults to the access surface, which handles faults with an
   * honest "something went wrong on our side" + retry.
   */
  renderFault?: (error: unknown) => React.ReactNode;
  /**
   * Two or three concrete things to do instead, in THIS feature — "your
   * websites", "create one". Without them the gate is honest and still a dead
   * end: it says what went wrong and leaves the user to re-navigate.
   */
  suggestions?: AccessDeniedSuggestion[];
  /**
   * `"absolute"` removes the request affordance entirely — for a door closed by
   * law, where the ask itself would leak. Defaults to `"requestable"`.
   */
  requestability?: AccessRequestability;
  /** The surface's own worded reason, in place of the generic explanation. */
  reason?: string;
  /** The surface's own headline, in place of the kind-naming generic one. */
  headline?: string;
  /** The surface's own trailing disclosure (a reference code, an audit id). */
  footer?: React.ReactNode;
}

export function AccessGate({
  token,
  id,
  error,
  onRetry,
  fallbackHref,
  fallbackLabel,
  relatedReads = [],
  renderFault,
  suggestions,
  requestability,
  reason,
  headline,
  footer,
}: AccessGateProps) {
  // A hard fault (network, timeout, malformed query) is not an access story.
  // Surfaces with a good error component keep using it; everyone else gets the
  // access surface, whose `ok`/`error` states already say the honest thing.
  if (error && classifyDataError(error) === "fault" && renderFault) {
    return <>{renderFault(error)}</>;
  }

  // The server's own refusal, when there was one. It outranks BOTH the generic
  // copy and a `reason` the surface composed: the door already said the true
  // thing, in words the person can report.
  const refusal = readServerRefusal(error);

  return (
    <>
      {relatedReads.map((read) => (
        <AccessGateCaptureResolver
          key={`${read.token}:${read.id}`}
          token={read.token}
          id={read.id}
          error={read.error}
        />
      ))}
      <AccessDenied
        token={token}
        id={id}
        readError={error}
        // A refused door is not a retry: offering one is the "Try again" that
        // can never succeed.
        onRetry={refusal ? undefined : onRetry}
        fallbackHref={fallbackHref}
        fallbackLabel={fallbackLabel}
        suggestions={suggestions}
        requestability={requestability}
        reason={refusal?.message ?? reason}
        headline={headline}
        footer={
          refusal?.code ? (
            <>
              {footer}
              <ServerRefusalCode code={refusal.code} issues={refusal.issues} />
            </>
          ) : (
            footer
          )
        }
      />
    </>
  );
}

/** Resolves diagnostics for a parallel read without rendering another gate. */
function AccessGateCaptureResolver({
  token,
  id,
  error,
}: {
  token: string;
  id: string;
  error: unknown;
}) {
  // This hook owns both the authoritative resolver call and capture
  // reconciliation. Its visual context is deliberately consumed by the one
  // primary AccessDenied above, never by a second competing surface.
  useAccessGate(token, id, { readError: error });
  return null;
}

/**
 * The refusal's machine code, disclosed where machine tokens belong: a closed
 * `<details>` under the body, never in the sentence a person reads. It is the
 * thing that makes a refusal reportable — "it said conversation_not_found" is
 * actionable, "it wouldn't open" is not.
 */
function ServerRefusalCode({
  code,
  issues,
}: {
  code: string;
  issues: string[];
}) {
  return (
    <details className="text-[11px] text-muted-foreground">
      <summary className="cursor-pointer select-none">
        What the server said
      </summary>
      <p className="mt-1 font-mono">{code}</p>
      {issues.length > 0 ? (
        <ul className="mt-1 list-disc pl-4">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
