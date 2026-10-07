// features/esign/contract/draft.ts — STEP 0, FROZEN (e-sign parity CONTRACT.md §12.1, verbatim).
// Only the owning session amends this file (CONTRACT.md §21).

import type { DateFormat, FieldDefinitionV2, FieldGroupV2 } from "./fieldModel";

export type RecipientRole = "signer" | "viewer" | "cc_recipient";
export type RecipientVerification = "none" | "email_code" | "access_code";

export interface DraftRecipient {
  key: string;                    // client-minted, stable
  role: RecipientRole;
  order: number;                  // 1-based routing step; equal steps only when parallel
  full_name: string;              // legal name, editable at send (ours #5)
  email: string;                  // the same person may appear on several recipients (A-N5)
  user_id: string | null;         // picked member
  color_index: number;            // §12.6; stable once assigned
  company?: string | null;
  job_title?: string | null;
  private_message?: string | null;   // ≤ 2000
  verification: RecipientVerification;   // outsiders only; members: "none"
  has_access_code: boolean;       // set by the server after esign_draft_set_access_code; never the code
  template_role?: string | null;  // set when the draft came from a template
}

export type DraftField = Omit<FieldDefinitionV2, "signer_id"> & { document_key: string; recipient_key: string };
export type DraftGroup = Omit<FieldGroupV2, "signer_id"> & { document_key: string; recipient_key: string };

export interface DraftSettings {
  signing_order: "sequential" | "parallel";
  expires_in_days: number;                         // 1..365, counted from SEND
  reminders: { enabled: boolean; cadence_days: number[] };
  expiry_warning_days: number | null;
  allow_delegation: boolean;
  allow_fill_all: boolean;
  form_view: "off" | "available" | "default";
  date_format_default: DateFormat;
  sender_time_zone: string | null;
}

export interface EnvelopeDraftV1 {
  schema_version: 1;
  title: string;                  // ≤ 300
  email_subject: string;          // ≤ 200; UI prefills "Please sign: <title>", labelled as the subject
  message: string;                // ≤ 4000
  documents: Array<{ key: string; file_id: string; name: string; page_count: number | null }>; // ≤ 10
  recipients: DraftRecipient[];   // ≤ 20
  fields: DraftField[];           // ≤ 500
  groups: DraftGroup[];           // ≤ 200
  settings: DraftSettings;
}

export interface EnvelopeTemplateV1 extends Omit<EnvelopeDraftV1, "recipients"> {
  recipients: Array<Omit<DraftRecipient, "has_access_code"> & { template_role: string }>; // people optional
}
