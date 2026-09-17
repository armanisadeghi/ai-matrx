// features/crm/gmail/service.ts
//
// THE ONE WRITER OF A GMAIL-SENT INTERACTION ROW.
//
// Two paths reach it and there will never be a third:
//   1. a person composing from a record (`GmailComposePanel`);
//   2. an agent's proposal approved in the one approval queue
//      (`features/approvals/kinds/gmail-send.tsx`).
// Both send through the SAME reviewed-send card, so both record the send the
// same way. A second writer would mean two shapes of "sent email" on one
// timeline and nobody able to say which is true.
//
// Direct browser -> Supabase, per CLAUDE.md § Data flow: this is a plain insert
// the browser is entitled to make, not compute. The SEND is compute and goes to
// Python; the RECORD does not.
//
// 🚨 THE MESSAGE HAS ALREADY LEFT BY THE TIME THIS RUNS. Nothing here may
// swallow a failure, retry silently, or report success it did not achieve: the
// caller is handed the failure in words and shows it. A person who believes a
// message was recorded when it was not will send it again.

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { InteractionInsert } from "@/features/crm/types";
import {
  GMAIL_INTERACTION_CHANNEL,
  GMAIL_INTERACTION_PROVIDER,
  type GmailDraftedBy,
  type GmailInteractionWriteResult,
  type GmailSendAssociation,
  type GmailSendReceipt,
} from "./types";

/**
 * 🚨 THE RECEIPT IS THE CARD'S, NEVER THE DRAFT'S.
 *
 * Every field on the review card is editable and the card posts the bytes on
 * its own screen, so what left can differ from what the composer — or the agent
 * — wrote. A sent record built from the pre-review draft shows text nobody
 * received, and the audit trail then attests to the wrong message. This narrows
 * what the CARD reported; it is the only lawful source for a sent record.
 * (Bugbot HIGH #1, 2026-09-17.)
 *
 * Returns null when the card did not name a message id: the message may still
 * have gone, so the caller SAYS SO rather than writing a row with no external
 * id or, worse, writing nothing quietly.
 */
export function narrowGmailSendReceipt(
  responseData: unknown,
  connectionId: string,
): GmailSendReceipt | null {
  if (
    typeof responseData !== "object" ||
    responseData === null ||
    Array.isArray(responseData)
  ) {
    return null;
  }
  const data = responseData as Record<string, unknown>;
  if (typeof data.message_id !== "string") return null;
  return {
    messageId: data.message_id,
    connectionId,
    fromEmail: typeof data.from_email === "string" ? data.from_email : null,
    to: typeof data.to === "string" ? data.to : "",
    cc: Array.isArray(data.cc)
      ? data.cc.filter((entry): entry is string => typeof entry === "string")
      : [],
    subject: typeof data.subject === "string" ? data.subject : "",
    body: typeof data.body === "string" ? data.body : "",
  };
}

/** The migration that promotes the audit trail from jsonb into its own columns. */
export const GMAIL_AUDIT_MIGRATION =
  "migrations/crm_interaction_gmail_audit_trail.sql";

function describe(error: { message?: string; code?: string }): string {
  const message = error.message?.trim();
  if (!message) {
    return "Supabase refused the write and returned no message.";
  }
  return error.code ? `${message} (${error.code})` : message;
}

/** The subject a timeline row shows. The body is always stored verbatim. */
function interactionSubject(receipt: GmailSendReceipt): string {
  return receipt.subject.trim() || "(no subject)";
}

/**
 * Everything about the send that is not a column, marked with its `__kind`
 * (THE KIND-MARKER LAW — the marker travels with the data).
 */
export const GMAIL_SEND_METADATA_KIND = "crm_gmail_send_record";

/**
 * WHY THE AUDIT TRAIL RIDES `metadata` TODAY.
 *
 * `migrations/crm_interaction_gmail_audit_trail.sql` gives drafted-by and
 * approved-by their own columns, and it is written but NOT applied — the chair
 * applies DB files. The typed Supabase client refuses an insert naming a column
 * `types/database.types.ts` does not carry, a generated file is never
 * hand-edited, and this container cannot regenerate it; so those columns cannot
 * be written from here until the migration lands.
 *
 * The answer is NOT to drop the trail and warn about it. NOTHING IS LOST: the
 * facts are stored now, in the row's own jsonb, in exactly the shape the
 * migration's backfill reads — column names, not camelCase, so the promotion is
 * a straight copy that cannot mis-map a field. When the migration is applied it
 * promotes every row written in the meantime; nobody has to go and find them.
 */
function sendMetadata(
  receipt: GmailSendReceipt,
  association: GmailSendAssociation,
  approvedByUserId: string | null,
  approvedAt: string,
  draftedBy: GmailDraftedBy | null | undefined,
): Json {
  return {
    __kind: GMAIL_SEND_METADATA_KIND,
    to: receipt.to,
    cc: receipt.cc,
    sent_via_account: {
      connection_id: receipt.connectionId,
      account_email: receipt.fromEmail,
    },
    audit_trail: {
      drafted_by_agent_id: draftedBy?.agentId ?? null,
      drafted_by_run_id: draftedBy?.runId ?? null,
      drafted_by_label: draftedBy?.label ?? null,
      approval_assist_id: draftedBy?.assistId ?? null,
      // The constraint the migration adds is "a person AND a time, or
      // neither", so they are written together here too.
      approved_by: approvedByUserId,
      approved_at: approvedByUserId ? approvedAt : null,
    },
    // Carried, not a column: a CRM table may not depend on a project FK
    // (db-rules §6d). The association proper is written through
    // `platform.associations`; this is the breadcrumb naming the surface the
    // message was composed from.
    composed_from_project_id: association.projectId ?? null,
  } satisfies Json;
}

export interface RecordGmailSendInput {
  receipt: GmailSendReceipt;
  association: GmailSendAssociation;
  /** The person who authorized it — whoever pressed Send on the review card. */
  approvedByUserId: string | null;
  /** Present only when an agent wrote the draft. */
  draftedBy?: GmailDraftedBy | null;
}

/**
 * Build the row. Exported so a test can assert what would be written without a
 * database: the shape of a sent record is the thing that must not drift.
 */
export function gmailInteractionRow(
  input: RecordGmailSendInput,
  interactionId: string,
  occurredAt: string,
): InteractionInsert {
  const { receipt, association, draftedBy } = input;
  return {
    id: interactionId,
    party_id: association.partyId,
    // 🚨 Explicit, always. No resolver and no trigger picks an organization
    // (CLAUDE.md § every write carries an explicit organization_id).
    organization_id: association.organizationId,
    deal_id: association.dealId ?? null,
    contact_point_id: association.contactPointId ?? null,
    channel_code: GMAIL_INTERACTION_CHANNEL,
    direction: "outbound",
    status: "completed",
    occurred_at: occurredAt,
    subject: interactionSubject(receipt),
    body: receipt.body,
    provider: GMAIL_INTERACTION_PROVIDER,
    // Gmail's own id for the message — the external message id.
    provider_interaction_id: receipt.messageId,
    // Which connected account it went out through (sent_via_account). The
    // connection id, not the address: an address can be aliased or renamed and
    // the record would then name a mailbox that no longer exists.
    provider_account_id: receipt.connectionId,
    metadata: sendMetadata(
      receipt,
      association,
      input.approvedByUserId,
      occurredAt,
      draftedBy,
    ),
  };
}

/**
 * Write the sent message onto the record's timeline.
 *
 * Never throws: the caller is past the point of no return and needs a result it
 * can SHOW, not an exception that unwinds a card whose message already left.
 */
export async function recordGmailSendInteraction(
  input: RecordGmailSendInput,
): Promise<GmailInteractionWriteResult> {
  // Minted here, not returned by the insert: an INSERT…RETURNING on this table
  // 42501s under the id-list std_select policy (the reason
  // `crm/service.ts::logInteraction` has no `.select()` either). Minting it
  // client-side is how the caller gets a door to the row it just wrote.
  const interactionId = crypto.randomUUID();
  const row = gmailInteractionRow(
    input,
    interactionId,
    new Date().toISOString(),
  );

  // No `.select()` — see above.
  const { error } = await supabase
    .schema("crm")
    .from("interaction")
    .insert(row);

  if (error) {
    return { interactionId: null, failure: describe(error) };
  }
  return { interactionId, failure: null };
}
