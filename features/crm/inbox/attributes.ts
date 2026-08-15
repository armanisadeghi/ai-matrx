// features/crm/inbox/attributes.ts
//
// 🚨 THE ONE READER of crm.interaction.attributes on the client.
//
// The inbound-reply ingester and the sequence runner (aidream, shipping
// alongside this) write their state into that jsonb column. The exact paths are
// NOT frozen yet, so every surface reads them through this module and through
// the SQL twins `public.crm_inbound_label` / `public.crm_inbound_evidence`
// (migrations/crm_08_inbox_chasebox.sql). A rename on the server is then a
// one-line change HERE and a one-line change THERE — never a grep across the
// inbox, the Chasebox, the timeline and the record page.
//
// ASSUMED PATHS (report them, don't hide them):
//   attributes.inbound_classification = { label, evidence }   ← primary
//   attributes.classification         = { label, evidence }   ← accepted alias
//   attributes.outreach_single_send   = { member_id, medium_id, identity_id,
//       template_id, reputation_case_id, backlink_id, variables,
//       render_fingerprint, drafted_at, approved_at, approved_by, sent_at,
//       provider_message_id, send_failure }
//   attributes.inbox                  = { handled_at, handled_by }  ← OURS
//
// `attributes.inbox` is the only key this client writes, and it is written by
// the `crm_inbox_set_handled` RPC rather than a raw update, so the rest of the
// bag can never be clobbered.

import { isJsonObject } from "@/types/json";

/**
 * The classifier's verdict on an inbound reply. Closed set, mirrored from the
 * ingester's contract — anything else renders as "other" rather than as a raw
 * string the user has never seen before.
 */
export const INBOUND_LABELS = [
  "bounce",
  "unsubscribe",
  "ooo",
  "interested",
  "not_interested",
  "other",
] as const;
export type InboundLabel = (typeof INBOUND_LABELS)[number];

export const INBOUND_LABEL_META: Record<
  InboundLabel,
  { label: string; tone: "positive" | "negative" | "neutral" | "warning" }
> = {
  interested: { label: "Interested", tone: "positive" },
  not_interested: { label: "Not interested", tone: "negative" },
  unsubscribe: { label: "Unsubscribe", tone: "negative" },
  bounce: { label: "Bounced", tone: "warning" },
  ooo: { label: "Out of office", tone: "neutral" },
  other: { label: "Other", tone: "neutral" },
};

/** Narrow an arbitrary classifier string onto the closed set. */
export function toInboundLabel(value: string | null | undefined): InboundLabel | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (INBOUND_LABELS as readonly string[]).includes(normalized)
    ? (normalized as InboundLabel)
    : "other";
}

function readObject(value: unknown, key: string): Record<string, unknown> | null {
  if (!isJsonObject(value)) return null;
  const nested = value[key];
  return isJsonObject(nested) ? nested : null;
}

function readString(source: Record<string, unknown> | null, key: string): string | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/** The classifier block, whichever of the two accepted paths it arrived on. */
export function readInboundClassification(attributes: unknown): {
  label: InboundLabel | null;
  rawLabel: string | null;
  evidence: string | null;
} {
  const block =
    readObject(attributes, "inbound_classification") ??
    readObject(attributes, "classification");
  const rawLabel = readString(block, "label");
  return {
    label: toInboundLabel(rawLabel),
    rawLabel,
    evidence: readString(block, "evidence"),
  };
}

/** The `outreach_single_send` block the server writes onto every draft/send. */
export interface OutreachSendAttributes {
  memberId: string | null;
  mediumId: string | null;
  identityId: string | null;
  templateId: string | null;
  reputationCaseId: string | null;
  backlinkId: string | null;
  renderFingerprint: string | null;
  draftedAt: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
  sendFailure: string | null;
}

export function readOutreachSendAttributes(attributes: unknown): OutreachSendAttributes {
  const block = readObject(attributes, "outreach_single_send");
  return {
    memberId: readString(block, "member_id"),
    mediumId: readString(block, "medium_id"),
    identityId: readString(block, "identity_id"),
    templateId: readString(block, "template_id"),
    reputationCaseId: readString(block, "reputation_case_id"),
    backlinkId: readString(block, "backlink_id"),
    renderFingerprint: readString(block, "render_fingerprint"),
    draftedAt: readString(block, "drafted_at"),
    approvedAt: readString(block, "approved_at"),
    sentAt: readString(block, "sent_at"),
    providerMessageId: readString(block, "provider_message_id"),
    sendFailure: readString(block, "send_failure"),
  };
}

/**
 * The id the `/outreach/single/drafts/{draft_id}/…` endpoints expect for a
 * draft that is sitting on a `crm.interaction` row.
 *
 * The interaction id IS the draft id today. That is stated here rather than
 * assumed at four call sites, and an explicit `draft_id` in the attributes bag
 * wins if the server ever separates the two.
 */
export function readOutreachDraftId(
  interactionId: string,
  attributes: unknown,
): string {
  const block = readObject(attributes, "outreach_single_send");
  return readString(block, "draft_id") ?? interactionId;
}
