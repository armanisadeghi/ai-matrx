// features/esign/envelopes/types.ts — the sender's view of an e-signature envelope.

import type { ListScopeKind } from "@/lib/list-scope/types";
import type { components } from "@ai-matrx/agents/generated/api-types";

/** All = what I sent, was given, or must sign · Mine = what I sent. */
export const ENVELOPE_LIST_SCOPES: ListScopeKind[] = ["all", "mine"];

export type EnvelopeStatus = "sent" | "in_progress" | "completed" | "declined" | "voided" | "expired" | "draft";

export interface EnvelopeListRow {
  id: string;
  title: string;
  status: EnvelopeStatus | string;
  organization_id: string;
  organization_name: string | null;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  updated_at: string;
  i_manage: boolean;
  my_signer_status: string | null;
  my_turn: boolean;
  signer_count: number;
  signed_count: number;
  signer_names: string | null;
  /** Every recipient with their own status (empty for a draft: recipients live in the draft). */
  signers?: { name: string; status: string; role: string }[];
}

/** Where a row opens: the envelope page for whoever may manage it, the signing door for a signer. */
export function envelopeHref(row: Pick<EnvelopeListRow, "id"> & Partial<Pick<EnvelopeListRow, "i_manage">>): string {
  return row.i_manage === false ? signHref(row.id) : `/esign/${row.id}`;
}

/** Where a signer opens their own copy (the signing surface's signed-in door). */
export function signHref(envelopeId: string): string {
  return `/sign/e/${envelopeId}`;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Waiting",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
  voided: "Voided",
  expired: "Expired",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export const SIGNER_STATUS_LABEL: Record<string, string> = {
  pending: "Not yet sent",
  notified: "Sent",
  opened: "Opened",
  viewed: "Viewed",
  consented: "Agreed",
  signed: "Signed",
  declined: "Declined",
  delegated: "Passed on",
  delivery_failed: "Not delivered",
  expired: "Expired",
};

// ─── sending: recipients and placed fields ───────────────────────────────────────

/** The four boxes a signer fills at signing, each from what they adopted (the frozen contract). */
export type FieldKind = components["schemas"]["EsignFieldInput"]["kind"];

export interface FieldKindSpec {
  kind: FieldKind;
  label: string;
  /** Default box size as fractions of the page (8.5x11). */
  w: number;
  h: number;
}

export const FIELD_KINDS: readonly FieldKindSpec[] = [
  { kind: "signature", label: "Signature", w: 0.25, h: 0.06 },
  { kind: "initials", label: "Initials", w: 0.08, h: 0.05 },
  { kind: "date_signed", label: "Date signed", w: 0.16, h: 0.035 },
  { kind: "full_name", label: "Name", w: 0.22, h: 0.035 },
];

export function fieldKindSpec(kind: FieldKind): FieldKindSpec {
  return FIELD_KINDS.find((k) => k.kind === kind) ?? FIELD_KINDS[0];
}

/** One person asked to sign. A picked member carries `userId`; an outsider is a name and an address. */
export interface Recipient {
  key: string;
  fullName: string;
  email: string;
  userId: string | null;
  avatarUrl: string | null;
}

/**
 * A box placed on one page of one document for one recipient. Coordinates are fractions of the
 * page, origin top-left; `page` is 1-based. Held against the document's file id and the
 * recipient's key so removing or reordering either never points a box at the wrong one.
 */
export interface PlacedField {
  id: string;
  fileId: string;
  recipientKey: string;
  kind: FieldKind;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A field as the send request carries it (indexes into `file_ids` and `signers`). */
export type EnvelopeFieldInput = components["schemas"]["EsignFieldInput"];

/** Keep a box on its page: never smaller than a sliver, never past an edge. */
export function clampBox(box: { x: number; y: number; w: number; h: number }) {
  const w = Math.min(1, Math.max(0.02, box.w));
  const h = Math.min(1, Math.max(0.015, box.h));
  return {
    w,
    h,
    x: Math.min(1 - w, Math.max(0, box.x)),
    y: Math.min(1 - h, Math.max(0, box.y)),
  };
}

/**
 * The send request's fields, indexed against the documents and signers actually sent. A box whose
 * document or recipient is gone is dropped, never re-pointed.
 */
export function fieldsForSend(
  fields: readonly PlacedField[],
  fileIds: readonly string[],
  recipientKeys: readonly string[],
): EnvelopeFieldInput[] {
  const out: EnvelopeFieldInput[] = [];
  for (const f of fields) {
    const document_index = fileIds.indexOf(f.fileId);
    const signer_index = recipientKeys.indexOf(f.recipientKey);
    if (document_index < 0 || signer_index < 0) continue;
    const box = clampBox(f);
    out.push({ document_index, signer_index, kind: f.kind, page: Math.max(1, Math.round(f.page)), ...box });
  }
  return out;
}

/** Each recipient's colour on the page — the chart palette, in order. */
const RECIPIENT_TOKENS = ["--chart-1", "--chart-2", "--chart-4", "--chart-6", "--chart-3", "--chart-5"];

export function recipientColor(index: number, alpha = 1): string {
  const token = RECIPIENT_TOKENS[((index % RECIPIENT_TOKENS.length) + RECIPIENT_TOKENS.length) % RECIPIENT_TOKENS.length];
  return alpha === 1 ? `hsl(var(${token}))` : `hsl(var(${token}) / ${alpha})`;
}
