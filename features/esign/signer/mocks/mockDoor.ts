// features/esign/signer/mocks/mockDoor.ts — DEV DEMO ONLY: an in-memory SignerDoorApi (esign-parity
// CONTRACT §17 step 4). Two-page PDF, one field of every kind, a second signer who already signed,
// slow saves, and a `session_taken_over` simulation. Imported only by app/(dev)/demos/esign-signer.

import type { FieldMapV2, FieldPatch, FieldValue, FieldValues } from "../../contract/fieldModel";
import {
  type AdoptInput,
  DoorRefusal,
  type MarkTarget,
  SessionEnded,
  type SignerDoorApi,
  type SignerLoadV2,
} from "../../contract/signerDoor";
import { samplePdfBytes } from "./samplePdf";

const ME = "signer-me";
const CLINIC = "signer-clinic";
const DOC = "doc-agreement";

function f(
  id: string,
  kind: FieldMapV2["fields"][number]["kind"],
  page: number,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<FieldMapV2["fields"][number]> = {},
): FieldMapV2["fields"][number] {
  return { id, kind, signer_id: ME, page, x, y, w, h, required: true, label: "", ...extra };
}

export const MOCK_FIELD_MAP: FieldMapV2 = {
  schema_version: 2,
  fields: [
    f("f-name", "full_name", 1, 0.215, 0.228, 0.31, 0.026, { label: "Full name" }),
    f("f-email", "email", 1, 0.18, 0.258, 0.35, 0.026, { label: "Email" }),
    f("f-company", "company", 1, 0.205, 0.288, 0.33, 0.026, { label: "Company", required: false }),
    f("f-dob", "date", 1, 0.235, 0.318, 0.24, 0.026, { label: "Date of birth", date_format: "MM/DD/YYYY" }),
    f("f-visits", "number", 1, 0.345, 0.348, 0.16, 0.026, {
      label: "Visits per year",
      number: { min: 0, max: 52, decimals: 0 },
      required: false,
    }),
    f("f-r-phone", "radio", 1, 0.286, 0.43, 0.022, 0.018, { label: "Phone", group_id: "g-contact", option_value: "Phone" }),
    f("f-r-email", "radio", 1, 0.383, 0.43, 0.022, 0.018, { label: "Email", group_id: "g-contact", option_value: "Email" }),
    f("f-r-text", "radio", 1, 0.473, 0.43, 0.022, 0.018, { label: "Text", group_id: "g-contact", option_value: "Text" }),
    f("f-remind", "checkbox", 1, 0.444, 0.46, 0.022, 0.018, { label: "Visit reminders", required: false }),
    f("f-location", "dropdown", 1, 0.28, 0.49, 0.3, 0.026, {
      label: "Preferred location",
      options: ["Downtown", "Riverside", "North Hills", "Telehealth"],
    }),
    f("f-notes", "text", 1, 0.118, 0.565, 0.6, 0.06, {
      label: "Notes for the care team",
      multiline: true,
      max_length: 500,
      placeholder: "Allergies, access needs, anything we should know",
      required: false,
    }),
    f("f-init-1", "initials", 1, 0.478, 0.678, 0.08, 0.032, { label: "Initials 1" }),
    f("f-privacy", "checkbox", 2, 0.37, 0.18, 0.022, 0.018, { label: "Privacy notice" }),
    f("f-sign", "signature", 2, 0.273, 0.226, 0.3, 0.045, { label: "Signature 1" }),
    f("f-date", "date_signed", 2, 0.6, 0.235, 0.16, 0.026, { label: "Date signed", date_format: "MM/DD/YY" }),
    f("f-init-2", "initials", 2, 0.19, 0.295, 0.08, 0.032, { label: "Initials 2" }),
    { ...f("c-sign", "signature", 2, 0.33, 0.377, 0.28, 0.045, { label: "Signature" }), signer_id: CLINIC },
    { ...f("c-date", "date_signed", 2, 0.6, 0.386, 0.16, 0.026, { label: "Date signed" }), signer_id: CLINIC },
  ],
  groups: [{ id: "g-contact", kind: "radio", signer_id: ME, label: "Preferred contact", required: true }],
};

function inkPng(text: string): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 150;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#0d2673";
  ctx.font = "italic 72px serif";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 16, 75, 568);
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface MockOptions {
  seat: "signed_in" | "outsider";
  formView: "off" | "available" | "default";
  /** Milliseconds every save takes (slow network). */
  saveDelayMs: number;
  /** Start with consent already given (a returning signer). */
  consented: boolean;
  role: "signer" | "viewer";
}

export interface MockDoor extends SignerDoorApi {
  /** The next call answers as if another window took the session over. */
  simulateTakeover(): void;
  /** What the server holds right now (for the demo's own readout). */
  stored(): FieldValues;
}

export function createMockDoor(options: MockOptions): MockDoor {
  const values: FieldValues = {};
  let consentedAt: string | null = options.consented ? new Date().toISOString() : null;
  let signedAt: string | null = null;
  let takeover = false;
  const marks: Record<MarkTarget, string | null> = { signature: null, initials: null };
  const bytes = samplePdfBytes();
  const viewer = options.role === "viewer";

  function gate() {
    if (takeover) {
      takeover = false;
      throw new SessionEnded("taken_over");
    }
    if (signedAt) throw new DoorRefusal("signer_signed", "You have already signed this document.");
  }

  return {
    seat: options.seat,
    simulateTakeover() {
      takeover = true;
    },
    stored() {
      return { ...values };
    },
    async load(): Promise<SignerLoadV2> {
      await wait(250);
      if (takeover) {
        takeover = false;
        throw new SessionEnded("taken_over");
      }
      const clinicSig = inkPng("Dr. Lena Ortiz");
      return {
        envelope: {
          id: "6f1c9e2a-4b7d-4c61-9a3e-2d8f5b0c7e14",
          title: "Patient Services Agreement",
          message: "Please review and sign before your visit on Friday. Call us with any questions.",
          email_subject: "Please sign: Patient Services Agreement",
          status: "sent",
          expires_at: new Date(Date.now() + 9 * 86400000).toISOString(),
          signing_order: "parallel",
        },
        sender: { name: "Maya Chen", email: "maya.chen@riversideclinic.example" },
        organization: { id: "org-riverside", name: "Riverside Clinic", logo_url: null },
        me: {
          id: ME,
          status: signedAt ? "signed" : "sent",
          role: options.role,
          full_name: "Jordan Avery Blake",
          email: "jordan.blake@example.com",
          company: null,
          job_title: null,
          color_index: 0,
          private_message: "Jordan — page 1 has your contact preferences.",
          document_previewed_at: null,
          consented_at: consentedAt,
          signed_at: signedAt,
          acts_for: [ME],
          field_values: { ...values },
          values_saved_at: null,
        },
        my_marks: {
          signature_base64: marks.signature,
          initials_base64: marks.initials,
          mime_type: "image/png",
        },
        other_signers: [{ id: CLINIC, order: 1, role: "signer", status: "signed", name: "Dr. Lena Ortiz", color_index: 1 }],
        others_filled: [{ field_id: "c-date", signer_id: CLINIC, v: "10/06/26" }],
        others_marks: { [CLINIC]: { signature_base64: clinicSig || null, initials_base64: null } },
        documents: [
          {
            id: DOC,
            name: "Patient Services Agreement.pdf",
            position: 0,
            content_hash: "mock",
            page_count: 2,
            mime_type: "application/pdf",
            field_map: viewer ? { schema_version: 2, fields: [], groups: [] } : MOCK_FIELD_MAP,
          },
        ],
        consent: {
          disclosure_id: "disc-1",
          version: "3",
          title: "Electronic record and signature disclosure",
          text:
            "You agree to receive this document electronically and to sign it with an electronic signature, " +
            "which has the same effect as a handwritten one. You may ask the sender for a paper copy at no cost, " +
            "and you may withdraw this consent before you sign by declining. Keep a copy of every document you sign.",
        },
        settings: {
          signature_options: { typed: true, drawn: true, uploaded: true, phone: true },
          fill_all_allowed: true,
          delegation_allowed: true,
          message_to_sender_allowed: true,
          form_view: options.formView,
          date_format_default: "MM/DD/YYYY",
        },
        progress: { required_total: 10, required_done: 0 },
        remaining_after_me: 0,
      };
    },
    async previewAck() {
      await wait(150);
      gate();
      return { documents_unseen: 0, previewed_at: new Date().toISOString() };
    },
    async consent() {
      await wait(300);
      gate();
      consentedAt = new Date().toISOString();
    },
    async documentBytes() {
      await wait(400);
      return { bytes: bytes.slice(), mime_type: "application/pdf", content_hash: "mock", name: "Patient Services Agreement.pdf" };
    },
    async adopt(input: AdoptInput) {
      await wait(500);
      gate();
      const image = input.image_data_url?.replace(/^data:image\/\w+;base64,/, "") ?? inkPng(input.typed_name ?? "Signed");
      marks[input.target] = image;
      return { target: input.target, image_base64: image };
    },
    async saveValues(patch: FieldPatch) {
      await wait(options.saveDelayMs);
      gate();
      const current: FieldValues = {};
      const at = new Date().toISOString();
      for (const [id, entry] of Object.entries(patch)) {
        const field = MOCK_FIELD_MAP.fields.find((x) => x.id === id);
        if (!field) throw new DoorRefusal("unknown_field", "This document changed. Reload the page.");
        const held = values[id];
        if (!held || entry.seq > held.seq) values[id] = { v: entry.v, seq: entry.seq, at };
        // Radio: one option set true clears the group's others (§2.2).
        if (field.kind === "radio" && entry.v === true && field.group_id) {
          for (const other of MOCK_FIELD_MAP.fields) {
            if (other.group_id === field.group_id && other.id !== id) values[other.id] = { v: false, seq: entry.seq, at };
          }
        }
        current[id] = values[id];
      }
      return { values_saved_at: at, required_remaining: 0, current };
    },
    async sign(input) {
      await wait(900);
      gate();
      const finalValues: Record<string, FieldValue> = {};
      for (const [id, entry] of Object.entries(input.values)) finalValues[id] = entry.v;
      const missing = MOCK_FIELD_MAP.fields.filter(
        (x) => x.signer_id === ME && x.required && !x.group_id && x.kind !== "date_signed" && x.kind !== "signature" && x.kind !== "initials" && (finalValues[x.id] === null || finalValues[x.id] === undefined || finalValues[x.id] === "" || finalValues[x.id] === false),
      );
      if (missing.length > 0) {
        throw new DoorRefusal("required_fields_missing", "Some required fields are still empty.", {
          missing: missing.map((x) => x.id),
        });
      }
      if (!marks.signature) throw new DoorRefusal("no_signature_adopted", "Add your signature before you finish.");
      signedAt = new Date().toISOString();
      return { signed_at: signedAt, everyone_signed: true, remaining: 0, final_values: finalValues };
    },
    async decline() {
      await wait(500);
      gate();
    },
    async delegate() {
      await wait(500);
      gate();
    },
    async acknowledge() {
      await wait(400);
      gate();
    },
    async download() {
      await wait(500);
      return [{ name: "Patient Services Agreement.pdf", mime_type: "application/pdf", bytes: bytes.slice() }];
    },
    async history() {
      await wait(300);
      const now = Date.now();
      return [
        { event: "sent", at: new Date(now - 86400000).toISOString(), label: "Sent by Maya Chen", mine: false },
        { event: "signed", at: new Date(now - 3600000).toISOString(), label: "Signed by Dr. Lena Ortiz", mine: false },
        { event: "opened", at: new Date(now - 60000).toISOString(), label: "You opened the document", mine: true },
        ...(consentedAt
          ? [{ event: "consented", at: consentedAt, label: "You agreed to sign electronically", mine: true }]
          : []),
      ];
    },
    async handoffStart() {
      await wait(300);
      return { handoff_id: "h-1", path: "/x/sign/phone#h=mock", secret: "mock", expires_at: new Date(Date.now() + 600000).toISOString() };
    },
    async handoffText() {
      await wait(300);
      return { last4: "2145" };
    },
    async handoffStatus() {
      await wait(200);
      return { status: "waiting" as const };
    },
    async handoffCancel() {
      await wait(100);
    },
  };
}
