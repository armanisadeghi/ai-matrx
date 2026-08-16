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
// PATHS — the first one is now CONFIRMED against the writer, not assumed:
//   attributes.outreach_inbound = { label, evidence, bounce_type, matched_phrase,
//       ooo_return_at, member_status, sequence_branch, identity_id,
//       matched_send_provider_message_id, sending_event_id, ingested_at }
//     ← THE REAL PATH. Written by aidream
//       `aidream/services/outreach_inbound/service.py` when it inserts the
//       inbound crm.interaction row. Verified against that source 2026-08-15.
//   attributes.inbound_classification = { label, evidence }   ← never written; kept only as a tolerant alias
//   attributes.classification         = { label, evidence }   ← never written; ditto
//
// 🚨 This mismatch actually happened: the client was built against
// `inbound_classification` while the server shipped `outreach_inbound`, and the
// failure was SILENT — every real reply would have rendered "Unclassified" and
// the label facets would have been permanently empty, with no error anywhere.
// If you rename on the server, change it HERE and in the two SQL twins in the
// same commit.
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
    readObject(attributes, "outreach_inbound") ??
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
 * WHAT THE AI CLAIMED, AND WHAT IT READ IT FROM.
 *
 * `attributes.outreach_single_send.personalization` is stamped at draft time by
 * `create_draft` from the member's stored personalization record (WP5's writer
 * over `research.rs_source.page_analysis`). Every field carries the sentence it
 * will put in the message, the FACT behind it, and the SOURCE PAGE that fact
 * came from — validated server-side against the evidence set actually supplied
 * for that target, so a citation here is never the model's own invention.
 *
 * This is provenance only: it is never bound into the rendered message. The
 * reviewer reads it beside the draft, which is the entire point — approving a
 * claim you cannot trace is the failure the whole ladder exists to prevent.
 */
export interface PersonalizationField {
  name: string;
  label: string;
  text: string;
  fact: string | null;
  sourceUrl: string | null;
  editedBy: string | null;
}

export interface PersonalizationProvenance {
  fields: PersonalizationField[];
  version: string | null;
  generatedAt: string | null;
  /** True once a human reworded at least one line through the single-send client. */
  humanEdited: boolean;
}

/** The writer's own field names, in reading order. An unknown name still renders
 * (with its raw name as the label) rather than being silently dropped. */
const PERSONALIZATION_FIELD_LABELS: Record<string, string> = {
  opening_line: "Opening line",
  ps_line: "P.S. line",
};

export function readPersonalizationProvenance(
  attributes: unknown,
): PersonalizationProvenance | null {
  const block = readObject(readObject(attributes, "outreach_single_send"), "personalization");
  if (!block) return null;
  const rawFields = isJsonObject(block.fields) ? block.fields : {};
  const fields: PersonalizationField[] = [];
  for (const [name, value] of Object.entries(rawFields)) {
    if (!isJsonObject(value)) continue;
    const text = readString(value, "text");
    if (!text) continue;
    fields.push({
      name,
      label: PERSONALIZATION_FIELD_LABELS[name] ?? name.replace(/_/g, " "),
      text,
      fact: readString(value, "fact"),
      sourceUrl: readString(value, "source_url"),
      editedBy: readString(value, "edited_by"),
    });
  }
  if (fields.length === 0) return null;
  return {
    fields,
    version: readString(block, "version"),
    generatedAt: readString(block, "generated_at"),
    humanEdited: fields.some((field) => field.editedBy !== null),
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
