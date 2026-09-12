// The ONE error→HTTP-status mapping for every `/api/admin/surfaces/*` route.
//
// WHY THIS IS SHARED, and why the mapping grew.
// Each of the four routes carried its own byte-identical `errorResponse` that
// special-cased exactly two prefixes — Unauthorized (401) and Forbidden (403) —
// and answered 500 for everything else. So the service's most deliberate,
// most CORRECT refusals ("no such row", "that row is still declared in a code
// manifest", "this row was written 20 minutes ago") reached the browser as
// SERVER ERRORS carrying an accurate message. A 500 says "this endpoint is
// broken"; those answers say "your request was understood and refused". Four
// copies is also how a mapping drifts: fixing it in one route would have left
// the other three lying.
//
// The status is derived from the message the service threw, because that is the
// contract the service already publishes (see `deleteMirrorRow`, which throws
// rather than returning an envelope precisely so the message reaches the admin
// verbatim). Every pattern below is anchored on a stable prefix or an exported
// constant — never on loose prose that a reworded sentence would silently
// unmap.
//
// The body shape `{ error: string }` is unchanged: `surfaces.service.ts` parses
// it, and the drift dialog reads the message to tell the recency refusal apart
// from a real failure.

import { NextResponse } from "next/server";
import {
  RECENT_ROW_REFUSAL_PREFIX,
  STILL_DECLARED_REFUSAL_PREFIX,
  NO_SUCH_MIRROR_ROW_PREFIX,
} from "@/features/surfaces/services/manifest-sync.service";

/**
 * Map a thrown error to its honest HTTP status.
 *
 * - 401 Unauthorized — no session.
 * - 403 Forbidden — signed in, not a super admin.
 * - 404 Not Found — the addressed row does not exist (it may already be gone).
 * - 409 Conflict — the request is well-formed and understood, and the CURRENT
 *   STATE refuses it: the row is still declared in code, or it is inside the
 *   recency window and the caller has not confirmed. Both are resolvable by the
 *   caller (re-run the report; confirm again), which is exactly what 409 means
 *   and exactly what 500 does not.
 * - 500 — anything else, which is now genuinely "something broke".
 */
export function surfacesAdminErrorStatus(message: string): number {
  if (message.startsWith("Unauthorized")) return 401;
  if (message.startsWith("Forbidden")) return 403;
  if (message.startsWith(NO_SUCH_MIRROR_ROW_PREFIX)) return 404;
  if (message.startsWith(STILL_DECLARED_REFUSAL_PREFIX)) return 409;
  if (message.startsWith(RECENT_ROW_REFUSAL_PREFIX)) return 409;
  return 500;
}

/** The ONE error response every `/api/admin/surfaces/*` route returns. */
export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json(
    { error: message },
    { status: surfacesAdminErrorStatus(message) },
  );
}
