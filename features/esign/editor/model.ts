// features/esign/editor/model.ts — the editor's vocabulary: field kinds, defaults, small pure helpers.
// Types come from the frozen contract (features/esign/contract); nothing here redefines them.

import {
  AtSign,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CheckSquare,
  CircleDot,
  Hash,
  ListChecks,
  PenLine,
  Signature,
  Type,
  User,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import type { DateFormat, FieldKindV2 } from "../contract/fieldModel";
import type {
  DraftField,
  DraftGroup,
  DraftRecipient,
  DraftSettings,
  EnvelopeDraftV1,
  RecipientRole,
} from "../contract/draft";

export interface KindSpec {
  kind: FieldKindV2;
  label: string;
  icon: LucideIcon;
  /** Default box as fractions of a US Letter page. */
  w: number;
  h: number;
  group: "Signing" | "Details" | "Inputs";
  /** Filled by the signer; false = automatic. */
  signerFills: boolean;
}

export const KIND_SPECS: readonly KindSpec[] = [
  { kind: "signature", label: "Signature", icon: Signature, w: 0.28, h: 0.06, group: "Signing", signerFills: true },
  { kind: "initials", label: "Initials", icon: PenLine, w: 0.12, h: 0.05, group: "Signing", signerFills: true },
  { kind: "date_signed", label: "Date signed", icon: CalendarCheck, w: 0.21, h: 0.035, group: "Signing", signerFills: false },
  { kind: "full_name", label: "Full name", icon: User, w: 0.25, h: 0.035, group: "Details", signerFills: true },
  { kind: "first_name", label: "First name", icon: UserRound, w: 0.2, h: 0.035, group: "Details", signerFills: true },
  { kind: "last_name", label: "Last name", icon: UserRound, w: 0.2, h: 0.035, group: "Details", signerFills: true },
  { kind: "email", label: "Email", icon: AtSign, w: 0.24, h: 0.035, group: "Details", signerFills: true },
  { kind: "company", label: "Company", icon: Building2, w: 0.24, h: 0.035, group: "Details", signerFills: true },
  { kind: "title", label: "Title", icon: Briefcase, w: 0.2, h: 0.035, group: "Details", signerFills: true },
  { kind: "text", label: "Text", icon: Type, w: 0.28, h: 0.035, group: "Inputs", signerFills: true },
  { kind: "number", label: "Number", icon: Hash, w: 0.18, h: 0.035, group: "Inputs", signerFills: true },
  { kind: "date", label: "Date", icon: Calendar, w: 0.18, h: 0.035, group: "Inputs", signerFills: true },
  { kind: "checkbox", label: "Checkbox", icon: CheckSquare, w: 0.025, h: 0.02, group: "Inputs", signerFills: true },
  { kind: "radio", label: "Radio", icon: CircleDot, w: 0.025, h: 0.02, group: "Inputs", signerFills: true },
  { kind: "dropdown", label: "Dropdown", icon: ListChecks, w: 0.24, h: 0.035, group: "Inputs", signerFills: true },
];

export function kindSpec(kind: FieldKindV2): KindSpec {
  return KIND_SPECS.find((k) => k.kind === kind) ?? KIND_SPECS[0];
}

export const DATE_FORMATS: readonly { value: DateFormat; label: string }[] = [
  { value: "MM/DD/YYYY", label: "10/07/2026" },
  { value: "MM/DD/YY", label: "10/07/26" },
  { value: "DD/MM/YYYY", label: "07/10/2026" },
  { value: "DD/MM/YY", label: "07/10/26" },
  { value: "YYYY-MM-DD", label: "2026-10-07" },
  { value: "MMM D, YYYY", label: "Oct 7, 2026" },
  { value: "D MMM YYYY", label: "7 Oct 2026" },
];

export const ROLE_LABEL: Record<RecipientRole, string> = {
  signer: "Signs",
  viewer: "Needs to view",
  cc_recipient: "Receives a copy",
};

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function defaultSettings(): DraftSettings {
  return {
    signing_order: "sequential",
    expires_in_days: 30,
    reminders: { enabled: true, cadence_days: [3, 7] },
    expiry_warning_days: 3,
    allow_delegation: true,
    allow_fill_all: true,
    form_view: "available",
    date_format_default: "MM/DD/YYYY",
    sender_time_zone: null,
  };
}

export function emptyDraft(title = ""): EnvelopeDraftV1 {
  return {
    schema_version: 1,
    title,
    email_subject: "",
    message: "",
    documents: [],
    recipients: [],
    fields: [],
    groups: [],
    settings: defaultSettings(),
  };
}

/** The subject the email carries: the sender's own words, else the server words it: "<sender> sent you <title> to sign". */
export function effectiveSubject(d: Pick<EnvelopeDraftV1, "email_subject" | "title">, senderName: string): string {
  const title = d.title.trim();
  if (d.email_subject.trim()) return d.email_subject.trim();
  if (!title) return "";
  return senderName ? `${senderName} sent you ${title} to sign` : `You have ${title} to sign`;
}

/** Lowest colour index no recipient holds; kept for life (paper.ts rule). */
export function nextColorIndex(recipients: readonly DraftRecipient[]): number {
  const used = new Set(recipients.map((r) => r.color_index));
  let i = 0;
  while (used.has(i)) i += 1;
  return i;
}

export function newRecipient(
  recipients: readonly DraftRecipient[],
  seed: Partial<DraftRecipient> & { full_name: string; email: string },
): DraftRecipient {
  const maxOrder = recipients.reduce((m, r) => Math.max(m, r.order), 0);
  return {
    key: newId(),
    role: "signer",
    order: maxOrder + 1,
    user_id: null,
    color_index: nextColorIndex(recipients),
    verification: "none",
    has_access_code: false,
    ...seed,
  };
}

export function clampBox<T extends { x: number; y: number; w: number; h: number }>(box: T): T {
  const w = Math.min(1, Math.max(0.015, box.w));
  const h = Math.min(1, Math.max(0.012, box.h));
  return { ...box, w, h, x: Math.min(1 - w, Math.max(0, box.x)), y: Math.min(1 - h, Math.max(0, box.y)) };
}

export function newField(
  kind: FieldKindV2,
  at: { document_key: string; recipient_key: string; page: number; cx: number; cy: number },
  existing: readonly DraftField[],
): DraftField {
  const spec = kindSpec(kind);
  const box = clampBox({ x: at.cx - spec.w / 2, y: at.cy - spec.h / 2, w: spec.w, h: spec.h });
  const sameKind = existing.filter((f) => f.kind === kind && f.recipient_key === at.recipient_key).length;
  return {
    id: newId(),
    kind,
    document_key: at.document_key,
    recipient_key: at.recipient_key,
    page: at.page,
    ...box,
    required: kind === "checkbox" ? false : true,
    label: `${spec.label} ${sameKind + 1}`,
    source: "placed",
    ...(kind === "dropdown" ? { options: ["Option 1", "Option 2"] } : {}),
    ...(kind === "date" || kind === "date_signed" ? { date_format: null } : {}),
    ...(kind === "text" ? { max_length: null, multiline: false } : {}),
  };
}

/** Recipients who must act (the ones fields can be assigned to). */
export function fieldRecipients(recipients: readonly DraftRecipient[]): DraftRecipient[] {
  return recipients.filter((r) => r.role === "signer");
}

export function groupFor(group_id: string | null | undefined, groups: readonly DraftGroup[]): DraftGroup | undefined {
  return group_id ? groups.find((g) => g.id === group_id) : undefined;
}

/** Soft warnings the sender sees before Send; none ever blocks. */
export function draftWarnings(d: EnvelopeDraftV1): string[] {
  const out: string[] = [];
  for (const r of d.recipients) {
    if (r.role !== "signer") continue;
    if (!d.fields.some((f) => f.recipient_key === r.key && (f.kind === "signature" || f.kind === "initials"))) {
      out.push(`${r.full_name || r.email || "A recipient"} has no signature field.`);
    }
  }
  return out;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function isEmail(s: string): boolean {
  return EMAIL.test(s.trim());
}

/**
 * The sender-set access code is a new refusal, offered only once the owner approves it (law 12;
 * CONTRACT §18 F1). Until then the server keeps it off and stores an email code instead.
 */
export const ACCESS_CODE_OFFERED = false;

/** What a composition's verification will actually be: an unoffered "access_code" is an email code (law 4). */
export function honestVerification(d: EnvelopeDraftV1): EnvelopeDraftV1 {
  if (ACCESS_CODE_OFFERED || !d.recipients.some((r) => r.verification === "access_code")) return d;
  return { ...d, recipients: d.recipients.map((r) => (r.verification === "access_code" ? { ...r, verification: "email_code" as const } : r)) };
}

/** What stops a Send (the server checks again). Empty = ready. */
export function sendBlockers(d: EnvelopeDraftV1): string[] {
  const out: string[] = [];
  if (d.documents.length === 0) out.push("Add a document.");
  if (!d.recipients.some((r) => r.role === "signer")) out.push("Add someone to sign.");
  for (const r of d.recipients) {
    if (!r.full_name.trim()) out.push("Every recipient needs a name.");
    if (!isEmail(r.email)) out.push(`${r.full_name || "A recipient"} needs a valid email.`);
    // verify A3: "Access code" is sent only with a code the sender set (a copy or template never
    // carries one) — so what is sent always matches what the sender chose.
    if (ACCESS_CODE_OFFERED && !r.user_id && r.verification === "access_code" && !r.has_access_code) {
      out.push(`Set an access code for ${r.full_name || r.email || "a recipient"}.`);
    }
  }
  return [...new Set(out)];
}
