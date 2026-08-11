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
 */

import { AccessDenied } from "@/features/access-gate/components/AccessDenied";
import { classifyDataError } from "@/features/access-gate/classifyDataError";

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
   * Render this instead when the failure was a genuine fault rather than an
   * access state. Defaults to the access surface, which handles faults with an
   * honest "something went wrong on our side" + retry.
   */
  renderFault?: (error: unknown) => React.ReactNode;
}

export function AccessGate({
  token,
  id,
  error,
  onRetry,
  fallbackHref,
  fallbackLabel,
  renderFault,
}: AccessGateProps) {
  // A hard fault (network, timeout, malformed query) is not an access story.
  // Surfaces with a good error component keep using it; everyone else gets the
  // access surface, whose `ok`/`error` states already say the honest thing.
  if (error && classifyDataError(error) === "fault" && renderFault) {
    return <>{renderFault(error)}</>;
  }

  return (
    <AccessDenied
      token={token}
      id={id}
      onRetry={onRetry}
      fallbackHref={fallbackHref}
      fallbackLabel={fallbackLabel}
    />
  );
}
