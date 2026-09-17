// features/crm/gmail/types.ts
//
// The shapes the Gmail-from-a-record path speaks.
//
// No stand-in types live here. An earlier draft declared a `*Pending` mirror of
// the six audit columns `migrations/crm_interaction_gmail_audit_trail.sql`
// adds, so the writer could name them on a typed insert. It could not: the
// typed Supabase client refuses a column `types/database.types.ts` does not
// carry, and a generated file is never hand-edited. Those columns ARE live in the
// database; the generated types are what lag (`pnpm db-types` is owed to a
// session with DB env). Until then the audit trail is stored in the row's own
// `metadata` under the column names - written by `./service.ts` (`sendMetadata`)
// and read by `./sent-record-facts.ts`, the ONE accessor, so the move to columns
// is a one-line change.

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
 * through `platform.associations`. It is in this shape so the writer can say
 * plainly that it did not store it, rather than dropping it in silence.
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
}

/** The exact bytes that left, as the review card reported them. */
export interface GmailSendReceipt {
  /** Gmail's own message id — the external message id on the record. */
  messageId: string;
  /** The Google connection the message was sent from (sent_via_account). */
  connectionId: string;
  fromEmail: string | null;
  to: string;
  cc: string[];
  subject: string;
  body: string;
}

/** What the writer did, in the words a surface can show. */
export interface GmailInteractionWriteResult {
  interactionId: string | null;
  /**
   * Set when the message went out but the record did not — already a SENTENCE
   * with the remedy, never raw database text. The send is NOT reversible, so
   * this is never swallowed and never retried silently.
   */
  failure: string | null;
  /**
   * The row landed but one of its "Associated with" edges did not. Separate from
   * `failure` because the history IS true — only a link is missing.
   */
  associationFailures: string[];
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
