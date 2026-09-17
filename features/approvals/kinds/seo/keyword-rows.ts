/**
 * WHICH KEYWORD LEDGER ROW BELONGS TO WHICH MOUNT — the pure half of the three
 * SEO kinds' answer to THE ONE WILL-RENDER PREDICATE (`../../rendered.ts`).
 *
 * 🚨 A KEYWORD PROPOSAL BELONGS TO ONE SITE. `apply_keyword_meaning` carries the
 * site it was written for, and `keywordMeaningKind`'s reader filters on exactly
 * that (`assist.action.siteId === siteOf(scope)`). Until 2026-09-17 the predicate
 * did not: it asked only whether some mounted kind read the ACTION SHAPE, so on
 * site A's queue a deep link to site B's row answered "still waiting on you,
 * past the first page of this list" — a list that can never show it — and the
 * badge and header could disagree with the screen the same way (Bugbot round 10,
 * finding 1). The kind's recogniser and the kind's reader now come from the same
 * place, so they cannot drift.
 *
 * It lives in its own module, free of React and of every query client, so the
 * predicate's tests can ask the REAL kinds' real rule without mounting the SEO
 * workbench's dependency graph.
 */

import type { AssistAction } from "@/features/assists/types";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { ApprovalRowPlace, ApprovalScope } from "@/features/approvals/types";
import { siteOf } from "./siteScope";

/**
 * THIS mount shows this row: it is a keyword-meaning proposal and it was written
 * for the site this queue stands on. A mount with no site never reaches here —
 * those kinds declare `scopeRequirement: { field: "siteId" }` and are not
 * mounted — and an empty site id matches nothing, never everything.
 */
export function keywordMeaningRendersRow(
  action: AssistAction,
  scope: ApprovalScope,
): boolean {
  if (action.kind !== "apply_keyword_meaning") return false;
  const site = siteOf(scope);
  return site.length > 0 && action.siteId === site;
}

/**
 * WHERE THE ROW IS when it is not here: that site's own queue, named by the site
 * the producer stamped on the row (`siteLabel`, written at emit time so no read
 * is needed). The approvals console mounts one queue per site the reader can
 * see, so it is the door that actually shows this row.
 */
export function keywordMeaningRowElsewhere(
  action: AssistAction,
): ApprovalRowPlace | null {
  if (action.kind !== "apply_keyword_meaning") return null;
  const site = action.siteLabel ?? action.siteId;
  return {
    explain: `this keyword proposal belongs to ${site}, so it waits on that website's own queue.`,
    where: {
      label: `Open the approvals for ${site}`,
      href: marketingRoutes.approvals(),
    },
  };
}

/**
 * A kind whose reader is an RPC over the site's own tables, not the assists
 * ledger — `placement_drift` (`seo.gsc_offering_placement_drift`) and
 * `topic_placement` (`listOfferingProposals`). It turns NO ledger row into an
 * item on any mount, so it must never be the reason a row is called "on screen
 * here" and never the door a deep link is sent to.
 */
export const RENDERS_NO_LEDGER_ROW = () => false;
export const PLACES_NO_LEDGER_ROW = (): ApprovalRowPlace | null => null;
