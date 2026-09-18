// features/crm/gmail/types.ts
//
// The shapes the Gmail-from-a-record path speaks.
//
// 🚨 NOTHING HERE WRITES. The `crm.interaction` row, its association edges and
// the `crm.sending_event` are written by the SERVER, on the reviewed-send
// endpoint (aidream `4dbffdffb`): two writers meant an ungated caller could mail
// an unsubscribed person and no sending event existed to correlate the bounce
// (VERIFY-B1-B2-R4 V4 / A8). The browser's own writer and its association writer
// are DELETED — the wire contract is `./reviewed-send-contract.ts` and the
// transport is `features/google-workspace/service.ts::sendReviewedGmail`.
//
// These shapes are what a SURFACE holds: what a compose window was opened with,
// who drafted it, and the constants a READER recognises a sent row by. The audit
// trail is on the row's own six columns AND mirrored in `metadata.audit_trail`
// (the server writes both from the same values, in the same statement), read
// through `./sent-record-facts.ts` — the ONE accessor.

import type { GmailCcAttribution } from "./recipient-integrity";

/**
 * `channel = gmail` (PLAN §4.4) as this table actually spells it.
 *
 * `channel_code` has a closed CHECK (call | email | meeting | sms | social |
 * note | task | other) and `provider` is already how the table names WHO
 * carried the message — live rows say 'twilio' for calls and 'apollo' for
 * email. A Gmail message is an email carried by Gmail, so it is both, and a
 * ninth channel code would have claimed it is a different kind of contact.
 */
export const GMAIL_INTERACTION_CHANNEL = "email" as const;
export const GMAIL_INTERACTION_PROVIDER = "gmail" as const;

/**
 * Everything about a Gmail send that is not a column rides `metadata`, marked
 * with this `__kind` (THE KIND-MARKER LAW — the marker travels with the data).
 * It lives here, not beside the writer, so a pure READER can recognise the row
 * without importing the Supabase client.
 */
export const GMAIL_SEND_METADATA_KIND = "crm_gmail_send_record";

/**
 * The role every Gmail-send association edge carries, so the reverse read —
 * "everything associated with this Person" — is one query.
 *
 * Identical to the server's own `GMAIL_SEND_ASSOCIATION_ROLE`
 * (`aidream/services/outreach_single_send/reviewed_send.py`), which is what
 * WRITES the edges now. Two spellings would be two sets of edges, and the reader
 * would see half of them.
 */
export const GMAIL_SEND_ASSOCIATION_ROLE = "gmail_send";

/** Who wrote the draft, when it was not the person sending it. */
export interface GmailDraftedBy {
  agentId: string | null;
  runId: string | null;
  /** The proposer's own label, kept because an agent can be renamed later. */
  label: string | null;
  /** The approval-queue row the decision was recorded in, when there was one. */
  assistId: string | null;
}

/**
 * What the sent message is ASSOCIATED WITH — HubSpot's word, and the reason
 * this record is worth anything at all.
 *
 * `projectId` is carried but is NOT a column: a CRM table may not depend on a
 * project FK (db-rules §6d), so a message composed from a project associates
 * through `platform.associations` — an EDGE the server writes, and reports back
 * per target so a refused link is a sentence rather than a silence.
 *
 * `organizationId` is the PARTY's own organization: it is what the send request
 * files the row under, and `crm._inherit_parent_org` RAISES on any other value
 * (VERIFY-B1-B2 D8).
 */
export interface GmailSendAssociation {
  partyId: string;
  organizationId: string;
  dealId?: string | null;
  projectId?: string | null;
  /** The recipient's CRM contact point, when the recipient IS one. */
  contactPointId?: string | null;
  /** The contact point's medium — what the compliance gate is asked about. */
  mediumId?: string | null;
  /**
   * Every address that received a COPY (Cc, and any further To address), with
   * whether this record holds it — decided by `./recipient-integrity.ts` and
   * written onto the row, so a Cc printed on a Person's timeline says whose
   * address it is instead of appearing there unattributed (N9).
   */
  ccAttribution?: GmailCcAttribution[];
}

/** What a compose window is opened with. */
export interface GmailComposeSeed {
  association: GmailSendAssociation;
  /** The person or company the message is about, for the window title. */
  subjectLabel: string;
  to: string;
  cc?: string[];
  subject?: string;
  body?: string;
  /** Present when an agent wrote the draft this window opened with. */
  draftedBy?: GmailDraftedBy;
}

/**
 * Narrow a `draftedBy` that arrived through Redux overlay data.
 *
 * Overlay data is `Record<string, unknown>` by the time the controller reads
 * it, and a wrong shape here would put a bogus agent id on an audit record.
 * A value that is not this shape returns null and the record simply says a
 * person wrote it — which is the truth when nobody said otherwise.
 */
export function narrowGmailDraftedBy(value: unknown): GmailDraftedBy | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const text = (key: string): string | null =>
    typeof source[key] === "string" ? (source[key] as string) : null;
  const drafted: GmailDraftedBy = {
    agentId: text("agentId"),
    runId: text("runId"),
    label: text("label"),
    assistId: text("assistId"),
  };
  // Nothing recognisable means nothing to record.
  return drafted.agentId || drafted.runId || drafted.label || drafted.assistId
    ? drafted
    : null;
}
