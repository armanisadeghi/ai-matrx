/**
 * The keyword kinds work on ONE site. The platform scope carries `siteId` as
 * optional, because a person-scoped queue has no site — and those kinds declare
 * `scopeRequirement: { field: "siteId" }`, so THE ENGINE NEVER MOUNTS THEM
 * without one (it names them and links their own console instead;
 * `features/approvals/ApprovalQueue.tsx`).
 *
 * This helper exists so that invariant needs no non-null assertion and no crash
 * if it is ever broken: an empty site id makes every read return nothing and
 * every route fall back to the site-less form, which is visibly wrong rather
 * than a white screen — and the `enabled` guard beside each query means no
 * request is made at all.
 */

import type { ApprovalScope } from "@/features/approvals/types";

export function siteOf(scope: ApprovalScope): string {
  return scope.siteId ?? "";
}
