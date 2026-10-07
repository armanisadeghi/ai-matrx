// features/esign/contract/signerDoor.ts — STEP 0, FROZEN (e-sign parity CONTRACT.md §13.1, verbatim).
// Only the owning session amends this file (CONTRACT.md §21).

import type { FieldMapV2, FieldPatch, FieldValue, FieldValues } from "./fieldModel";

export type MarkTarget = "signature" | "initials";
export type MarkKind = "typed" | "drawn" | "uploaded";
export type MarkSource = "this_device" | "phone" | "saved";

export interface SignerLoadV2 { /* exactly §6.3: the server's snake_case keys */
  envelope: Record<string, unknown>; sender: { name: string; email?: string | null };
  organization: { id: string; name: string; logo_url: string | null };
  me: Record<string, unknown> & { id: string; color_index: number; acts_for: string[]; field_values: FieldValues };
  my_marks: { signature_base64: string | null; initials_base64: string | null; mime_type: string };
  other_signers: Array<{ id: string; order: number; role: string; status: string; name: string | null; color_index: number }>;
  others_filled: Array<{ field_id: string; signer_id: string; v: FieldValue }>;
  others_marks: Record<string, { signature_base64: string | null; initials_base64: string | null }>;
  documents: Array<{ id: string; name: string; position: number; content_hash: string;
                     page_count: number | null; mime_type: string | null; field_map: FieldMapV2 | Record<string, unknown> }>;
  consent: { disclosure_id: string; version: string; title: string; text: string } | null;
  settings: { signature_options: { typed: boolean; drawn: boolean; uploaded: boolean; phone: boolean };
              fill_all_allowed: boolean; delegation_allowed: boolean; message_to_sender_allowed: boolean;
              form_view: "off" | "available" | "default"; date_format_default: string };
  progress: { required_total: number; required_done: number };
  remaining_after_me: number;
}

export interface AdoptInput {
  target: MarkTarget; kind: MarkKind; source: MarkSource;
  typed_name?: string; typed_style?: string; image_data_url?: string; strokes?: unknown[];
  handoff_id?: string; saved_signature_id?: string; save_to_profile?: boolean; make_default?: boolean;
}

export interface SignerDoorApi {
  readonly seat: "signed_in" | "outsider" | "preview";
  load(): Promise<SignerLoadV2>;
  previewAck(documentId: string): Promise<{ documents_unseen: number; previewed_at: string | null }>;
  consent(disclosureId: string): Promise<void>;
  documentBytes(documentId: string): Promise<{ bytes: Uint8Array; mime_type: string; content_hash: string; name: string }>;
  adopt(input: AdoptInput): Promise<{ target: MarkTarget; image_base64: string }>;
  saveValues(patch: FieldPatch): Promise<{ values_saved_at: string; required_remaining: number; current: FieldValues }>;
  sign(input: { observed: Array<{ document_id: string; content_hash: string }>; action_id: string;
                time_zone: string; values: FieldPatch; message_to_sender?: string }): Promise<{ signed_at: string;
                everyone_signed: boolean; remaining: number; final_values: Record<string, FieldValue> }>;
  decline(reason: string): Promise<void>;
  delegate(input: { full_name: string; email: string; message: string }): Promise<void>;
  acknowledge(): Promise<void>;
  download(input: { parts: Array<"documents" | "certificate">; combine: boolean; document_ids?: string[] }):
    Promise<Array<{ name: string; mime_type: string; bytes: Uint8Array }>>;
  history(): Promise<Array<{ event: string; at: string; label: string; mine: boolean }>>;
  handoffStart(target: MarkTarget): Promise<{ handoff_id: string; path: string; secret: string; expires_at: string }>;
  handoffText(handoffId: string, secret: string, phone: string): Promise<{ last4: string }>;
  handoffStatus(handoffId: string): Promise<{ status: "waiting" | "opened" | "completed" | "cancelled" | "expired";
                                              image_base64?: string; mime_type?: string; method?: "drawn" | "uploaded" }>;
  handoffCancel(handoffId: string): Promise<void>;
}

/** A refusal the server answered, with the sentence the person reads. */
export class DoorRefusal extends Error {
  constructor(public readonly code: string, message: string, public readonly detail?: Record<string, unknown>) { super(message); }
}
/** The outsider session ended but the link is alive: re-open, never "ask the sender" (§5.9). */
export class SessionEnded extends Error {
  constructor(public readonly why: "taken_over" | "expired") { super(why); }
}
