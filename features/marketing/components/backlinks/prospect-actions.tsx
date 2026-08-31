"use client";

/**
 * A backlink prospect's actions — ONE definition shared by both methods on
 * the Prospects surface: link-gap competitor prospecting
 * (`BacklinkProspectsTab`) and SERP prospecting (`SerpProspectsTab`). Both
 * triage the same shape of row — a domain with a Matrx Authority score and a
 * `review_status` — into the same CRM outreach path
 * (`/backlinks?view=prospects&method=…`), so a right-click on either offers
 * the same doors.
 *
 * 🚨 NO NEW WRITE PATH HERE. `onReview` / `onAddToOutreach` are host-supplied
 * — each Prospects method owns its own `useLinkGapProspects` /
 * `useSerpProspects` mutation state; this module only describes the row.
 */

import { Ban, CheckCircle2, Clock, ExternalLink, Megaphone, RotateCcw, Users } from "lucide-react";
import {
  type ContextMenuEntityRef,
  type ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";
import { resolveEntityDoors } from "@/components/official/entity-ref/doors";
import { linkGapReviewLabel } from "@/features/marketing/components/backlinks/lib/link-gap";

export type ProspectReviewStatus = "pending" | "approved" | "snoozed" | "rejected";

export interface ProspectDomainMenuRow {
  id: string;
  normalizedDomain: string;
  displayDomain: string;
  reviewStatus: string;
  /** Which table this row IS, so the entity ref names the right record. */
  source: "link-gap" | "serp";
  /** The CRM party this prospect already resolved to, once approved+folded. */
  partyId?: string | null;
}

/** No separate "prospect" record exists once a party is folded — the row IS
 * the party from that point on; before that it is its own scope target. */
export function prospectDomainEntityRef(
  row: ProspectDomainMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  if (row.partyId) return { type: "party", id: row.partyId, title: row.displayDomain };
  return {
    type: row.source === "serp" ? "seo_serp_opportunity" : "seo_link_gap_domain",
    id: row.id,
    title: row.displayDomain,
  };
}

export function useProspectDomainMenuSection(opts: {
  getRow: () => ProspectDomainMenuRow | null;
  onReview: (ids: string[], status: ProspectReviewStatus) => void;
  reviewing?: boolean;
  /** Selects just this row, then opens the surface's outreach-list dialog. */
  onAddToOutreach?: (row: ProspectDomainMenuRow) => void;
  /** THE CONSISTENCY STEP — what THIS surface cannot do, and why. */
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { getRow, onReview, reviewing, onAddToOutreach, unavailable } = opts;
  const row = getRow();
  const status = row?.reviewStatus;
  const partyHref = row?.partyId
    ? resolveEntityDoors("party", row.partyId).href
    : null;

  const reviewItem = (
    id: string,
    label: string,
    icon: typeof CheckCircle2,
    target: ProspectReviewStatus,
  ) => ({
    kind: "item" as const,
    id,
    label,
    icon,
    disabled: !row || Boolean(reviewing) || status === target,
    description:
      row && status === target ? `Already ${linkGapReviewLabel(target).toLowerCase()}` : undefined,
    onSelect: () => {
      if (row) onReview([row.id], target);
    },
  });

  const section: ContextMenuExtraSection = {
    id: "prospect-domain-actions",
    label: "Prospect",
    icon: Users,
    items: [
      {
        kind: "link",
        id: "prospect-open",
        label: "Open prospect site",
        icon: ExternalLink,
        href: row?.normalizedDomain ? `https://${row.normalizedDomain}` : "#",
        target: "_blank",
        disabled: !row?.normalizedDomain,
      },
      reviewItem("prospect-approve", "Approve", CheckCircle2, "approved"),
      reviewItem("prospect-later", "Save for later", Clock, "snoozed"),
      reviewItem("prospect-reject", "Not for us", Ban, "rejected"),
      reviewItem("prospect-reset", "Reset to pending", RotateCcw, "pending"),
      {
        kind: "item",
        id: "prospect-add-outreach",
        label: "Add to outreach list",
        icon: Megaphone,
        disabled: !row || !onAddToOutreach,
        onSelect: () => {
          if (row && onAddToOutreach) onAddToOutreach(row);
        },
      },
      {
        kind: "link",
        id: "prospect-open-crm",
        label: "Open in CRM",
        icon: Users,
        href: partyHref ?? "#",
        disabled: !partyHref,
        description: !partyHref ? "Not yet in your CRM" : undefined,
      },
    ],
  };
  return withAvailability(section, unavailable);
}
