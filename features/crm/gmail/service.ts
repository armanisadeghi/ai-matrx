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
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { recordGmailSendAssociations } from "./associations";
import type { Json } from "@/types/database.types";
import type { InteractionInsert } from "@/features/crm/types";
import {
  GMAIL_INTERACTION_CHANNEL,
  GMAIL_INTERACTION_PROVIDER,
  GMAIL_SEND_METADATA_KIND,
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

/**
 * 🚨 A DATABASE REFUSAL BECOMES A SENTENCE, NEVER RAW POSTGRES TEXT.
 *
 * The message has already left when this runs, so the person needs to know two
 * things and neither of them is a SQLSTATE: what did not happen, and what to do
 * about it. Raw text reached the toast until 2026-09-17 — including
 * `crm._inherit_parent_org`'s own raise, which reads as a bug report rather than
 * "log it by hand" (VERIFY-B1-B2 D8). The technical detail is not lost: it goes
 * to the Error Inspector through `captureError`, where an agent or an admin can
 * read it.
 */
export function gmailWriteRefusalSentence(error: {
  message?: string;
  code?: string;
}): string {
  const raw = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
  if (raw.includes("organization") || error.code === "P0001") {
    // `platform.inherit_org_from_parent` fills a NULL org from the party;
    // `crm._inherit_parent_org` RAISES when an explicit org disagrees with the
    // party's. That is the right behaviour — the row belongs to the Person's
    // timeline, so the Person's organization is the only true one.
    return (
      "The message was sent, but it could not be recorded: this record belongs " +
      "to a different organization than the one the message was filed under. " +
      "Log it on the record by hand so the history is true, and tell an admin " +
      "the record and the deal disagree about their organization."
    );
  }
  if (error.code === "42501" || raw.includes("permission denied") || raw.includes("policy")) {
    return (
      "The message was sent, but you do not have permission to add activity to " +
      "this record, so nothing was recorded. Log it by hand or ask whoever owns " +
      "the record to add it."
    );
  }
  if (error.code === "23505") {
    return (
      "The message was sent, and it looks like it was already recorded on this " +
      "record — check the timeline before logging it again."
    );
  }
  return (
    "The message was sent, but the database refused to record it on the " +
    "timeline. Log it by hand so the history is true; the technical detail is " +
    "in the admin error inspector."
  );
}

/** The subject a timeline row shows. The body is always stored verbatim. */
function interactionSubject(receipt: GmailSendReceipt): string {
  return receipt.subject.trim() || "(no subject)";
}

/** Re-exported from `./types` so existing importers are unchanged. */
export { GMAIL_SEND_METADATA_KIND } from "./types";

/**
 * WHY THE AUDIT TRAIL RIDES `metadata` TODAY.
 *
 * `migrations/crm_interaction_gmail_audit_trail.sql` IS APPLIED — the six
 * columns, both FKs, the "a person AND a time, or neither" CHECK, the same-org
 * trigger and all four indexes are live (verified 2026-09-17). What is missing is
 * narrower: `types/database.types.ts` does not carry them yet, because
 * regenerating it (`pnpm db-types`) needs DB env this session did not have. The
 * typed Supabase client refuses an insert naming a column the generated file does
 * not carry, and a generated file is never hand-edited — so the facts go into the
 * row's own jsonb, under the COLUMN names (not camelCase), which is exactly the
 * shape the migration's backfill read.
 *
 * NOTHING IS LOST AND NOTHING IS BLIND: every reader goes through
 * `./sent-record-facts.ts`, which reads the column when the row carries one and
 * this jsonb when it does not. Regenerating the types therefore moves the write
 * (here) and changes nothing else. The backfill itself ran once, at apply time,
 * and does NOT promote rows written afterwards — the accessor is what makes that
 * harmless.
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
    // (db-rules §6d). The association proper IS written, through
    // `platform.associations` — see `./associations.ts`, called by
    // `recordGmailSendInteraction` right after the row lands. This key stays as
    // the breadcrumb naming the surface the message was composed from, readable
    // without a second query.
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
    // 🚨 Explicit, always (CLAUDE.md § every write carries an explicit
    // organization_id) — AND IT IS THE PARTY'S ORGANIZATION. Two live triggers
    // on `crm.interaction` have an opinion: `trg_inherit_org`
    // (`platform.inherit_org_from_parent`) fills a NULL org from the party, and
    // `crm._inherit_parent_org` RAISES when the explicit org differs from the
    // party's. So passing anything but the Person's organization — a deal's, say
    // — fails the insert AFTER the message has left (VERIFY-B1-B2 D8). An
    // earlier version of this comment claimed no trigger picks an org; it does
    // not, but one refuses.
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
    // Nothing fails silently: the person gets a sentence, the Error Inspector
    // gets the refusal itself.
    captureError({
      source: "supabase-postgrest",
      operation: "insert",
      schema: "crm",
      relation: "interaction",
      code: error.code,
      message: `Gmail sent record refused: ${error.message ?? "(no message)"}`,
      userMessage: "A sent Gmail message could not be recorded on the timeline.",
      raw: error,
    });
    return {
      interactionId: null,
      failure: gmailWriteRefusalSentence(error),
      associationFailures: [],
    };
  }

  // 🚨 "Associated with" is an EDGE, and the row exists now, so it is written
  // now — through the registered RPC path only (`./associations.ts`). A failure
  // here never unwinds the row and never throws: it is reported.
  const associations = await recordGmailSendAssociations({
    interactionId,
    association: input.association,
  });
  for (const failure of associations.failures) {
    captureError({
      source: "supabase-postgrest",
      operation: "insert",
      schema: "platform",
      relation: "associations",
      message: `Gmail sent record association refused: ${failure}`,
      userMessage: failure,
      raw: failure,
    });
  }
  return {
    interactionId,
    failure: null,
    associationFailures: associations.failures,
  };
}
