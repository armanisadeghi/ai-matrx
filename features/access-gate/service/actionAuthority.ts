/**
 * actionAuthority — "may the caller do this to a LIVE record?", read from the
 * same `access_denied_context` answer the gate uses.
 *
 * `AccessDeniedContext.status` answers a different question: "why couldn't I
 * OPEN this record". Since V-XT-2/N2 (2026-09-15) it reads `ok` only after the
 * caller's own read FAULTED, so a live record the caller fully owns reports
 * `denied` when nothing faulted. A pre-action check that required
 * `status === "ok"` therefore refused every delete, admins included
 * ("We couldn't verify deletion access", site settings, 2026-09-17).
 *
 * Authority is the pair the resolver actually knows: the record exists and is
 * not deleted, plus the caller's `level`. Everything else — deleted, missing,
 * signed out, resolver fault — is unverified.
 */

import type { AccessDeniedContext } from "@/features/access-gate/types";

export type ActionAuthority =
  | { verified: false }
  | { verified: true; level: AccessDeniedContext["level"] };

export function actionAuthority(context: AccessDeniedContext): ActionAuthority {
  if (context.status === "ok" || context.status === "denied") {
    return { verified: true, level: context.level };
  }
  return { verified: false };
}
