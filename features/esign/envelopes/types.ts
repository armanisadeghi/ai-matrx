// features/esign/envelopes/types.ts — the sender's view of an e-signature envelope.

import type { ListScopeKind } from "@/lib/list-scope/types";

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
}

export function envelopeHref(row: Pick<EnvelopeListRow, "id">): string {
  return `/esign/${row.id}`;
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
