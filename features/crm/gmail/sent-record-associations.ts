// features/crm/gmail/sent-record-associations.ts
//
// 🚨 "ASSOCIATED WITH" IS WHAT THE EDGES SAY, NOT WHAT THE ROW HOPES.
//
// `GmailSentRecordDetails` printed "Associated with <Person> <deal> <project>"
// from `party_id`, `deal_id` and `metadata.composed_from_project_id` — the row's
// own columns — and never consulted `platform.associations`. So when an edge was
// refused (three sequential refusals, measured) the row still asserted the
// association forever, while "everything associated with this Person" did not
// list the message. The only trace was three toasts nobody keeps
// (VERIFY-B1-B2-R2 N7 / break I).
//
// This module is the comparison: what the row INTENDED to be associated with,
// against the edges that actually exist. The surface then shows the linked ones
// as doors and the missing ones as missing, with a retry — honest state, not a
// sentence that happens to be false.
//
// Pure: no React, no Supabase.

import { GMAIL_SEND_ASSOCIATION_ROLE } from "./associations";

/** The edge shape this reads — the association package's, narrowed. */
export interface SentRecordEdgeLike {
  otherType: string;
  otherId: string;
  role: string | null;
}

export type GmailAssociationTargetType = "party" | "crm_deal" | "project";

export interface GmailIntendedAssociation {
  type: GmailAssociationTargetType;
  id: string;
  /** The name a person reads, when the surface knows one. */
  label?: string | null;
}

export interface GmailAssociationStanding {
  /** Intended AND present in `platform.associations`. */
  linked: GmailIntendedAssociation[];
  /** Intended and NOT present — shown as missing, with a retry. */
  missing: GmailIntendedAssociation[];
}

/**
 * Compare the row's intended associations against the live edges.
 *
 * The role is deliberately NOT required to match: an edge to the same target
 * written under another role still associates the two records, and claiming
 * "not linked" because the role differs would be a second kind of lie. The
 * role is what the reverse read filters on when it wants Gmail sends only.
 */
export function gmailAssociationStanding(
  intended: GmailIntendedAssociation[],
  edges: SentRecordEdgeLike[],
): GmailAssociationStanding {
  const linked: GmailIntendedAssociation[] = [];
  const missing: GmailIntendedAssociation[] = [];
  for (const target of intended) {
    const present = edges.some(
      (edge) => edge.otherType === target.type && edge.otherId === target.id,
    );
    (present ? linked : missing).push(target);
  }
  return { linked, missing };
}

/** The role every Gmail-send edge carries, re-exported for the reverse read. */
export { GMAIL_SEND_ASSOCIATION_ROLE };
