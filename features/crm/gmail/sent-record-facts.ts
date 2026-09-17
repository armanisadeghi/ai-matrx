// features/crm/gmail/sent-record-facts.ts
//
// 🚨 THE ONE ACCESSOR FOR A SENT MESSAGE'S FACTS, AND THE ONE PLACE THE MOVE
// FROM `metadata` TO COLUMNS HAPPENS.
//
// `crm.interaction` carries six audit columns LIVE in the database
// (`drafted_by_agent_id`, `drafted_by_run_id`, `drafted_by_label`,
// `approved_by`, `approved_at`, `approval_assist_id` — applied by
// `migrations/crm_interaction_gmail_audit_trail.sql`), but
// `types/database.types.ts` does not carry them yet: regenerating it needs a
// session with DB env (`pnpm db-types`), which this one did not have. The typed
// Supabase client therefore cannot NAME them on an insert, so `./service.ts`
// writes the same six keys into `metadata.audit_trail`, in the migration's own
// column spelling.
//
// This module is the seam that makes that a one-line change rather than a sweep:
// every reader — the timeline, any future "everything this agent sent" report —
// reads the facts from HERE, and here reads the column when the row carries one
// and falls back to `metadata.audit_trail` when it does not. When the types are
// regenerated, `columnValue` below becomes a direct property read and nothing
// else in the repo changes.
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
 * Read one audit key: the COLUMN when the row already carries it, else the
 * `metadata.audit_trail` copy written in the same spelling.
 *
 * The cast is the whole reason this function exists and is the ONLY one: the
 * generated row type predates the columns, so a reader that named them directly
 * would not compile, and a reader that only read `metadata` would go blind the
 * day the types catch up.
 */
function auditValue(row: InteractionRow, key: GmailAuditKey): string | null {
  const asRecord = row as unknown as Record<string, unknown>;
  const fromColumn = asRecord[key];
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
  return {
    provider: row.provider ?? null,
    subject: row.subject ?? null,
    messageId: row.provider_interaction_id ?? null,
    to: text(metadata, "to"),
    cc,
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
