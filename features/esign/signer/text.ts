// features/esign/signer/text.ts — one sentence per refusal the signing doors answer with
// (esign._can_act, the act bodies, esign-parity CONTRACT §6.2). In-app text budget: ≤ 2 sentences.

import { DoorRefusal, SessionEnded } from "../contract/signerDoor";

const REASON: Record<string, string> = {
  link_no_longer_valid: "This link is no longer valid. Ask the sender for a new one.",
  not_your_signer_row: "This document was sent to someone else. Sign in with the account it was sent to.",
  not_a_signer: "You are not a signer on this document.",
  not_authenticated: "Sign in to open this document.",
  waiting_on_earlier_position: "Someone else signs before you. We will email you when it is your turn.",
  envelope_voided: "The sender cancelled this request.",
  envelope_declined: "This document was declined, so it can no longer be signed.",
  envelope_expired: "This signing request expired. Ask the sender for a new one.",
  envelope_draft: "This document has not been sent yet.",
  signer_signed: "You have already signed this document.",
  signer_declined: "You declined to sign this document.",
  signer_delegated: "You assigned this document to someone else.",
  cc_recipient: "You receive a copy of this document; there is nothing to sign.",
  document_hash_mismatch: "The document changed after it was sent. Ask the sender to send it again.",
  document_not_previewed: "Open every document before you continue.",
  no_consent: "Agree to sign electronically first.",
  no_signature_adopted: "Add your signature before you finish.",
  no_initials_adopted: "Add your initials before you finish.",
  typed_name_required: "Type your name before you finish.",
  reason_required: "Say why you are declining.",
  required_fields_missing: "Some required fields are still empty.",
  invalid_value: "One of your entries does not fit its field.",
  unknown_field: "This document changed. Reload the page.",
  not_your_field: "That field belongs to someone else.",
  field_read_only: "That field was filled in by the sender.",
  delegation_not_allowed: "The sender does not allow assigning this document.",
  not_a_viewer: "There is nothing to review on this document.",
  not_completed: "The certificate is ready once everyone has signed.",
  uploaded_not_allowed: "The sender does not allow an uploaded signature.",
  phone_not_allowed: "The sender does not allow signing on a phone.",
  preview_only: "This is a preview. Nothing was sent.",
  unknown_action: "This step is not available yet.",
};

export const UNREACHABLE = "We could not reach AI Matrx just now. Your link is fine — try again in a moment.";

export function reasonText(reason: string | null | undefined): string {
  if (reason && REASON[reason]) return REASON[reason];
  if (reason?.startsWith("envelope_")) return "This document can no longer be signed.";
  return "This could not be done right now. Try again in a moment.";
}

/** The sentence for anything a door call threw. A SessionEnded is handled by the caller. */
export function errorText(err: unknown): string {
  if (err instanceof DoorRefusal) return err.message || reasonText(err.code);
  if (err instanceof SessionEnded) return "Your session ended.";
  return UNREACHABLE;
}

/** verify A5: a link locked after too many wrong codes says so, and when it reopens (local time). */
export function lockedNotice(lockedUntil: string | null | undefined, locale?: string): string {
  const at = lockedUntil ? new Date(lockedUntil) : null;
  if (!at || Number.isNaN(at.getTime())) return "Too many tries. Wait a few minutes, then try again.";
  const time = at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return `Too many tries. This link is locked until ${time}.`;
}
