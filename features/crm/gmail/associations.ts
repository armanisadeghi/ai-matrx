// features/crm/gmail/associations.ts
//
// 🚨 "ASSOCIATED WITH" IS A REAL EDGE, NOT A SENTENCE IN A COMMENT.
//
// A sent message is worth keeping because of what it is associated with — the
// Person, the deal it advances, the project it belongs to (HubSpot's word, and
// the whole reason to send from a CRM instead of from Gmail). Until 2026-09-17
// `service.ts` CLAIMED "the association proper is written through
// platform.associations" and no such write existed anywhere in the Gmail path
// (VERIFY-B1-B2 A5/D7). The party and the deal were at least columns; the
// project reached nothing but a breadcrumb in `metadata`.
//
// THE REGISTERED PATH ONLY. Every edge goes through `associationsService`
// (`features/scopes/service/associationsService.ts` → `assoc_add`), which is the
// one chokepoint for the `assoc_*` family: it re-checks access on BOTH
// endpoints, resolves the org, and is idempotent on (source, target, role). A
// direct insert into `platform.associations` is refused by design — the browser
// holds no grant on that table (access FEATURE.md § associations).
//
// THE MESSAGE HAS ALREADY LEFT when this runs, and so has the interaction row.
// A failed edge therefore never throws and never unwinds anything: it comes back
// as words the caller shows, because a person who thinks the association exists
// will never go and make it.

import { associationsService } from "@/features/scopes/service/associationsService";
import type { GmailSendAssociation } from "./types";

/** The role every Gmail-send edge carries, so the reverse read is one query. */
export const GMAIL_SEND_ASSOCIATION_ROLE = "gmail_send";

export interface GmailAssociationWriteResult {
  /** Which targets got an edge, as `type:id`. */
  written: string[];
  /** One sentence per target that did not, in the words a surface can show. */
  failures: string[];
}

/**
 * Write the sent row's association edges: Person always, deal and project when
 * the send came from one.
 *
 * The Person edge is written even though `party_id` is also a column: the
 * column is what the timeline reads, the edge is what "everything associated
 * with this Person" reads, and a record that appears in one and not the other is
 * the class of bug the association system exists to end.
 */
export async function recordGmailSendAssociations(args: {
  interactionId: string;
  association: GmailSendAssociation;
}): Promise<GmailAssociationWriteResult> {
  const { interactionId, association } = args;
  const targets: { type: "party" | "crm_deal" | "project"; id: string }[] = [
    { type: "party", id: association.partyId },
  ];
  if (association.dealId) {
    targets.push({ type: "crm_deal", id: association.dealId });
  }
  if (association.projectId) {
    targets.push({ type: "project", id: association.projectId });
  }

  const written: string[] = [];
  const failures: string[] = [];
  for (const target of targets) {
    try {
      const result = await associationsService.add({
        sourceType: "crm_interaction",
        sourceId: interactionId,
        targetType: target.type,
        targetId: target.id,
        orgId: association.organizationId,
        role: GMAIL_SEND_ASSOCIATION_ROLE,
      });
      if (result.ok) {
        written.push(`${target.type}:${target.id}`);
      } else {
        failures.push(
          `The sent message was not linked to this ${LABEL[target.type]}: ${result.error.message}`,
        );
      }
    } catch (error) {
      failures.push(
        `The sent message was not linked to this ${LABEL[target.type]}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return { written, failures };
}

const LABEL: Record<"party" | "crm_deal" | "project", string> = {
  party: "record",
  crm_deal: "deal",
  project: "project",
};
