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
// Direct browser → Supabase, per CLAUDE.md § Data flow: this is a plain insert
// the browser is entitled to make, not compute. The SEND is compute and goes to
// Python; the RECORD does not.
//
// 🚨 THE MESSAGE HAS ALREADY LEFT BY THE TIME THIS RUNS. Nothing here may
// swallow a failure, retry silently, or report success it did not achieve: the
// caller is handed the failure in words and shows it. A person who believes a
// message was recorded when it was not will send it again.

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import {
  GMAIL_INTERACTION_CHANNEL,
  GMAIL_INTERACTION_PROVIDER,
  type GmailDraftedBy,
  type GmailInteractionWriteResult,
  type GmailSendAssociation,
  type GmailSendReceipt,
  type InteractionInsertWithAuditPending,
} from "./types";

/** The migration that must be applied before the audit columns exist. */
export const GMAIL_AUDIT_MIGRATION =
  "migrations/crm_interaction_gmail_audit_trail.sql";

const AUDIT_COLUMNS = [
  "drafted_by_agent_id",
  "drafted_by_run_id",
  "drafted_by_label",
  "approved_by",
  "approved_at",
  "approval_assist_id",
] as const;

/**
 * PostgREST answers an insert naming a column the table does not have with
 * PGRST204 and the column's name. That is the ONLY failure we retry, and we
 * retry it exactly once, without the audit columns, so the send is still
 * recorded — then we tell the caller the trail is missing and why.
 */
function isMissingAuditColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  const message = error.message ?? "";
  return AUDIT_COLUMNS.some((column) => message.includes(column));
}

function describe(error: { message?: string; code?: string }): string {
  const message = error.message?.trim();
  if (!message) {
    return "Supabase refused the write and returned no message.";
  }
  return error.code ? `${message} (${error.code})` : message;
}

/**
 * The subject line a timeline row shows, and the body it keeps.
 *
 * The body is stored verbatim — what the person approved is what the record
 * says was sent. Truncating it here would make the record disagree with the
 * mailbox, which is the one thing a sent record may never do.
 */
function interactionSubject(receipt: GmailSendReceipt): string {
  return receipt.subject.trim() || "(no subject)";
}

/**
 * Everything about the send that is not a column, marked with its `__kind` and
 * stored on `metadata` (THE KIND-MARKER LAW — the marker travels with the data).
 */
export const GMAIL_SEND_METADATA_KIND = "crm_gmail_send_record";

function sendMetadata(
  receipt: GmailSendReceipt,
  association: GmailSendAssociation,
): Json {
  return {
    __kind: GMAIL_SEND_METADATA_KIND,
    to: receipt.to,
    cc: receipt.cc,
    sent_via_account: {
      connection_id: receipt.connectionId,
      account_email: receipt.fromEmail,
    },
    // Carried, not stored as a column: a CRM table may not depend on a project
    // FK (db-rules §6d). The association proper is written by the caller
    // through `platform.associations`; this is the breadcrumb that says which
    // surface the message was composed from.
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
 * Write the sent message onto the record's timeline.
 *
 * Never throws: the caller is past the point of no return and needs a result it
 * can SHOW, not an exception that unwinds a card whose message already left.
 */
export async function recordGmailSendInteraction(
  input: RecordGmailSendInput,
): Promise<GmailInteractionWriteResult> {
  const { receipt, association, draftedBy } = input;
  const occurredAt = new Date().toISOString();

  // Generated here, not returned by the insert: an INSERT…RETURNING on this
  // table 42501s under the id-list std_select policy (the reason
  // `crm/service.ts::logInteraction` has no `.select()` either). Minting the id
  // client-side is how the caller gets a door to the row it just wrote.
  const interactionId = crypto.randomUUID();

  const base: InteractionInsertWithAuditPending = {
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
    metadata: sendMetadata(receipt, association),
  };

  const withAudit: InteractionInsertWithAuditPending = {
    ...base,
    drafted_by_agent_id: draftedBy?.agentId ?? null,
    drafted_by_run_id: draftedBy?.runId ?? null,
    drafted_by_label: draftedBy?.label ?? null,
    approved_by: input.approvedByUserId,
    // The CHECK is "a person AND a time, or neither".
    approved_at: input.approvedByUserId ? occurredAt : null,
    approval_assist_id: draftedBy?.assistId ?? null,
  };

  // No `.select()` anywhere below — see the id comment above.
  const first = await supabase
    .schema("crm")
    .from("interaction")
    .insert(withAudit);

  if (!first.error) {
    return { interactionId, auditTrailPending: false, failure: null };
  }

  if (!isMissingAuditColumn(first.error)) {
    return {
      interactionId: null,
      auditTrailPending: false,
      failure: describe(first.error),
    };
  }

  // The columns are not there yet. Record the send anyway — a timeline missing
  // the message entirely is far worse than one missing who approved it — and
  // hand the caller the sentence it must show.
  const retry = await supabase
    .schema("crm")
    .from("interaction")
    .insert(base);

  if (retry.error) {
    return {
      interactionId: null,
      auditTrailPending: true,
      failure: describe(retry.error),
    };
  }

  return { interactionId, auditTrailPending: true, failure: null };
}

/**
 * The sentence a surface shows when the audit columns are not there yet.
 * One wording, every caller — a stand-in that announces itself (LAW 4).
 */
export const GMAIL_AUDIT_PENDING_MESSAGE =
  `The message was sent and recorded on the timeline, but who drafted and approved it could not be stored: ` +
  `${GMAIL_AUDIT_MIGRATION} has not been applied yet.`;
