// features/crm/gmail/types.ts
//
// The shapes the Gmail-from-a-record path speaks.
//
// 🚨 STAND-IN TYPES LIVE HERE AND NOWHERE ELSE, AND THEY ANNOUNCE THEMSELVES.
// `migrations/crm_interaction_gmail_audit_trail.sql` adds six columns to
// `crm.interaction` (drafted_by_agent_id, drafted_by_run_id, drafted_by_label,
// approved_by, approved_at, approval_assist_id). That file is written but NOT
// applied — the chair applies DB files — so `types/database.types.ts` does not
// carry them yet, and a generated file is NEVER hand-edited.
//
// REMEDY, in order: the chair applies the migration, then `pnpm db-types`
// regenerates `types/database.types.ts`, then `GmailAuditTrailPending` below is
// DELETED and `InteractionInsert` alone carries these fields. Until then the
// writer in `./service.ts` degrades LOUDLY: the interaction row is still
// written with everything the schema does hold, and the caller is told in
// words that the audit trail could not be stored and why.

import type { InteractionInsert } from "@/features/crm/types";

/**
 * The six audit columns, as the unapplied migration declares them.
 *
 * Named `*Pending` per the google-native register's ruling (2026-09-17):
 * generated types cannot be regenerated from the build container, so a lane
 * that needs a not-yet-generated contract declares its own stand-in and says so.
 */
export interface GmailAuditTrailPending {
  drafted_by_agent_id?: string | null;
  drafted_by_run_id?: string | null;
  drafted_by_label?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  approval_assist_id?: string | null;
}

/** An interaction insert including the columns the migration is adding. */
export type InteractionInsertWithAuditPending = InteractionInsert &
  GmailAuditTrailPending;

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
   * True when the row was written WITHOUT the audit columns because the
   * migration has not been applied. The caller must say so out loud.
   */
  auditTrailPending: boolean;
  /**
   * Set when the message went out but the record did not. The send is NOT
   * reversible, so this is never swallowed and never retried silently.
   */
  failure: string | null;
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
