/**
 * forbiddenTarget — how `app/forbidden.tsx` learns WHICH record was refused.
 *
 * Next's `forbidden()` carries no payload: it throws, and the nearest
 * `forbidden.tsx` boundary renders with no props. That is fine for a generic
 * "403" page and useless for ours, because the whole point of the access gate
 * is that the user is told what they tried to open, who owns it, and how to
 * ask for it.
 *
 * `React.cache()` gives us the one thing we need and nothing more: a
 * REQUEST-SCOPED holder. `requireAccess(..., { forbid: true })` writes the
 * target into it immediately before throwing; the boundary — which renders in
 * that same request's render pass — reads it back out.
 *
 * DEGRADE, NEVER LIE. If the boundary renders without a target (a bare
 * `forbidden()` call from somewhere that never set one), it shows the honest
 * generic refusal rather than inventing a record. Nothing here asserts a
 * deletion, an absence, or a reason.
 */
import "server-only";
import { cache } from "react";

export interface ForbiddenTarget {
  /** Canonical entity token of the record the caller was refused. */
  token: string;
  id: string;
  /** Where "back to what I can see" should land. */
  fallbackHref?: string;
  fallbackLabel?: string;
}

/**
 * One holder per request render. `cache` memoizes on the (empty) argument list
 * for the lifetime of a single server render, which is exactly the scope the
 * throw and its boundary share.
 */
const holder = cache((): { current: ForbiddenTarget | null } => ({
  current: null,
}));

export function setForbiddenTarget(target: ForbiddenTarget): void {
  holder().current = target;
}

export function getForbiddenTarget(): ForbiddenTarget | null {
  return holder().current;
}
