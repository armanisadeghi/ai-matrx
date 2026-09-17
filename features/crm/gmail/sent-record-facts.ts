// features/crm/gmail/sent-record-facts.ts
//
// 🚨 THE ONE ACCESSOR FOR A SENT MESSAGE'S FACTS.
//
// `crm.interaction` carries six audit columns (`drafted_by_agent_id`,
// `drafted_by_run_id`, `drafted_by_label`, `approved_by`, `approved_at`,
// `approval_assist_id` — `migrations/crm_interaction_gmail_audit_trail.sql`), and
// `types/database.types.ts` now carries them too, so they are read as ordinary
// typed columns. The earlier header here, and in `./types.ts`, claimed the
// generated file lagged and that the facts therefore lived only in `metadata`:
// that was true when it was written and is FALSE now (verified against the
// generated row type, 2026-09-17).
//
// The `metadata.audit_trail` copy is still read as a FALLBACK, and that is not
// legacy: the server writes both halves from the same values in the same
// statement (`gmail_interaction_metadata` in
// `aidream/services/outreach_single_send/reviewed_send.py`), and rows written
// before the columns existed carry only the jsonb. A column wins whenever the row
// has one.
//
// 🚨 NOTHING IN THIS FEATURE WRITES THE ROW ANY MORE — the server does, inside
// the reviewed-send request (aidream `4dbffdffb`). This module reads.
//
// Pure: no React, no Supabase.

import type { InteractionRow } from "@/features/crm/types";
import { GMAIL_INTERACTION_PROVIDER, GMAIL_SEND_METADATA_KIND } from "./types";

/** The six audit keys, spelled as the COLUMNS spell them. */
export const GMAIL_AUDIT_KEYS = [
  "drafted_by_agent_id",
  "drafted_by_run_id",
  "drafted_by_label",
  "approved_by",
  "approved_at",
  "approval_assist_id",
] as const;
export type GmailAuditKey = (typeof GMAIL_AUDIT_KEYS)[number];

/** What a timeline can show about a message that was sent from a record. */
export interface GmailSentRecordFacts {
  /** Who carried the message — `provider` on the row ("gmail"). */
  provider: string | null;
  subject: string | null;
  /** Gmail's own message id. */
  messageId: string | null;
  /** The addresses the message actually went to, as the card reported them. */
  to: string | null;
  cc: string[];
  /**
   * Per-Cc attribution written by the send: whose address it is, and whether
   * THIS record holds it. Empty on rows written before F-20, which is why the
   * surface still prints `cc` itself when this is empty (R2 N9).
   */
  ccAttribution: GmailCcOnRecord[];
  /** The connected account it went out through. */
  sentViaAccountEmail: string | null;
  draftedByAgentId: string | null;
  draftedByRunId: string | null;
  draftedByLabel: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalAssistId: string | null;
  /** The project the message was composed from, when it was composed from one. */
  composedFromProjectId: string | null;
}

/** One Cc as the row records it — the column spelling, not camelCase. */
export interface GmailCcOnRecord {
  address: string;
  contactPointId: string | null;
  mediumId: string | null;
  heldByThisRecord: boolean;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Read one audit key: the COLUMN when the row carries it, else the
 * `metadata.audit_trail` copy written in the same spelling by the same statement.
 *
 * Typed straight off the generated row — no cast: the generated file carries all
 * six columns (it did not when this was written, which is what the old header
 * described). The jsonb leg stays for rows written before the columns existed.
 */
function auditValue(row: InteractionRow, key: GmailAuditKey): string | null {
  const fromColumn = row[key];
  if (typeof fromColumn === "string" && fromColumn.trim()) return fromColumn;
  const trail = jsonObject(jsonObject(row.metadata)?.audit_trail);
  return text(trail, key);
}

/** True when this row is a Gmail message sent through the reviewed-send path. */
export function isGmailSentRecord(row: InteractionRow): boolean {
  if (row.provider === GMAIL_INTERACTION_PROVIDER) return true;
  return jsonObject(row.metadata)?.__kind === GMAIL_SEND_METADATA_KIND;
}

/** Everything a surface may show about a sent Gmail message on this row. */
export function gmailSentRecordFacts(row: InteractionRow): GmailSentRecordFacts {
  const metadata = jsonObject(row.metadata);
  const account = jsonObject(metadata?.sent_via_account);
  const cc = Array.isArray(metadata?.cc)
    ? (metadata.cc as unknown[]).filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  const ccAttribution: GmailCcOnRecord[] = Array.isArray(
    metadata?.cc_attribution,
  )
    ? (metadata.cc_attribution as unknown[]).flatMap((entry) => {
        const record = jsonObject(entry);
        const address = text(record, "address");
        if (!address) return [];
        return [
          {
            address,
            contactPointId: text(record, "contact_point_id"),
            mediumId: text(record, "medium_id"),
            heldByThisRecord: record?.held_by_this_record === true,
          },
        ];
      })
    : [];
  return {
    provider: row.provider ?? null,
    subject: row.subject ?? null,
    messageId: row.provider_interaction_id ?? null,
    to: text(metadata, "to"),
    cc,
    ccAttribution,
    sentViaAccountEmail: text(account, "account_email"),
    draftedByAgentId: auditValue(row, "drafted_by_agent_id"),
    draftedByRunId: auditValue(row, "drafted_by_run_id"),
    draftedByLabel: auditValue(row, "drafted_by_label"),
    approvedBy: auditValue(row, "approved_by"),
    approvedAt: auditValue(row, "approved_at"),
    approvalAssistId: auditValue(row, "approval_assist_id"),
    composedFromProjectId: text(metadata, "composed_from_project_id"),
  };
}
