// features/esign/signer/model.ts — THE SIGNER'S FIELDS, as plain data (esign-parity CONTRACT §1, §13.2).
//
// Pure functions only: no React, no transport. The surface reads the load answer through these, so
// what "N required fields remaining", Next, the missed-required recovery and the final values mean
// is decided in ONE place and tested here.
//
// Every document's map is read as v2. A v1 map (no `schema_version`) becomes v2 the way §1.3 says:
// every v1 field is required, its kind is one of four, and it gets a label from its kind.

import type {
  DateFormat,
  FieldDefinitionV2,
  FieldGroupV2,
  FieldKindV2,
  FieldPatch,
  FieldValue,
  FieldValues,
} from "../contract/fieldModel";
import { FIELD_KINDS_V2 } from "../contract/fieldModel";
import type { SignerLoadV2 } from "../contract/signerDoor";

/** One placed field, with the document it sits on. */
export interface SField extends FieldDefinitionV2 {
  documentId: string;
  /** Position of its document in the envelope (0-based), for reading order. */
  docIndex: number;
  /** One of the fields this signer fills (their own, or delegated to them). */
  mine: boolean;
}

export interface SGroup extends FieldGroupV2 {
  documentId: string;
  mine: boolean;
}

/** A thing the signer must do: one required field, or one required group. */
export interface RequiredUnit {
  key: string; // field id, or `group:<id>`
  /** The field Next moves to for this unit (a group's first option). */
  fieldId: string;
}

export const KIND_LABEL: Record<FieldKindV2, string> = {
  signature: "Signature",
  initials: "Initials",
  date_signed: "Date signed",
  full_name: "Full name",
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  company: "Company",
  title: "Title",
  text: "Text",
  number: "Number",
  date: "Date",
  checkbox: "Checkbox",
  radio: "Choice",
  dropdown: "Choose one",
};

/** The compact tag on an empty field (DocHub's "Initial Here", Docusign's "Sign"). */
export const KIND_TAG: Record<FieldKindV2, string> = {
  signature: "Sign here",
  initials: "Initial here",
  date_signed: "Date",
  full_name: "Full name",
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  company: "Company",
  title: "Title",
  text: "Text",
  number: "Number",
  date: "Date here",
  checkbox: "",
  radio: "",
  dropdown: "Choose",
};

const NAME_KINDS: ReadonlySet<FieldKindV2> = new Set([
  "full_name",
  "first_name",
  "last_name",
  "email",
  "company",
  "title",
]);

export function isNameKind(kind: FieldKindV2): boolean {
  return NAME_KINDS.has(kind);
}

export function isMarkKind(kind: FieldKindV2): kind is "signature" | "initials" {
  return kind === "signature" || kind === "initials";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fraction(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** A label as a person would say it: a pasted line of the page ("Initials: ______   Date: ____") becomes
 *  its first words, without the ruling and the colon. Empty after cleaning means no label. */
export function cleanLabel(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const head = raw.split(/_{2,}|\.{4,}/)[0] ?? "";
  const text = head.replace(/\s+/g, " ").replace(/[\s:;,\-]+$/, "").trim();
  return text ? (text.length > 40 ? `${text.slice(0, 39)}…` : text) : null;
}

function isKind(value: unknown): value is FieldKindV2 {
  return FIELD_KINDS_V2.some((k) => k === value);
}

/** Read one document's map (v1 or v2) into v2 fields and groups; a malformed field is dropped. */
export function readMap(fieldMap: unknown): { fields: FieldDefinitionV2[]; groups: FieldGroupV2[] } {
  if (!isRecord(fieldMap) || !Array.isArray(fieldMap.fields)) return { fields: [], groups: [] };
  const v2 = fieldMap.schema_version === 2;
  const fields: FieldDefinitionV2[] = [];
  const counts: Partial<Record<FieldKindV2, number>> = {};
  for (const raw of fieldMap.fields) {
    if (!isRecord(raw) || !isKind(raw.kind)) continue;
    const page = raw.page;
    const x = fraction(raw.x);
    const y = fraction(raw.y);
    const w = fraction(raw.w);
    const h = fraction(raw.h);
    const id = str(raw.id);
    const signerId = str(raw.signer_id);
    if (!id || !signerId || typeof page !== "number" || !Number.isInteger(page) || page < 1) continue;
    if (x === null || y === null || !w || !h) continue;
    const kind = raw.kind;
    counts[kind] = (counts[kind] ?? 0) + 1;
    const base: FieldDefinitionV2 = {
      id,
      kind,
      signer_id: signerId,
      page,
      x,
      y,
      w,
      h,
      required: v2 ? raw.required !== false : true,
      label: cleanLabel(raw.label) ?? `${KIND_LABEL[kind]} ${counts[kind]}`,
    };
    if (v2) {
      if (str(raw.tooltip)) base.tooltip = str(raw.tooltip);
      if (raw.read_only === true) base.read_only = true;
      if (typeof raw.prefill === "string" || typeof raw.prefill === "boolean") base.prefill = raw.prefill;
      if (str(raw.placeholder)) base.placeholder = str(raw.placeholder);
      if (typeof raw.max_length === "number") base.max_length = raw.max_length;
      if (raw.multiline === true) base.multiline = true;
      if (isRecord(raw.number)) {
        base.number = {
          min: typeof raw.number.min === "number" ? raw.number.min : null,
          max: typeof raw.number.max === "number" ? raw.number.max : null,
          decimals: typeof raw.number.decimals === "number" ? raw.number.decimals : 0,
        };
      }
      if (typeof raw.date_format === "string") base.date_format = raw.date_format as DateFormat;
      if (Array.isArray(raw.options)) base.options = raw.options.filter((o): o is string => typeof o === "string");
      if (str(raw.group_id)) base.group_id = str(raw.group_id);
      if (str(raw.option_value)) base.option_value = str(raw.option_value);
    }
    fields.push(base);
  }
  const groups: FieldGroupV2[] = [];
  if (v2 && Array.isArray(fieldMap.groups)) {
    for (const raw of fieldMap.groups) {
      if (!isRecord(raw) || (raw.kind !== "checkbox" && raw.kind !== "radio")) continue;
      const id = str(raw.id);
      const signerId = str(raw.signer_id);
      if (!id || !signerId) continue;
      groups.push({
        id,
        kind: raw.kind,
        signer_id: signerId,
        label: str(raw.label) ?? (raw.kind === "radio" ? "Choose one" : "Choose"),
        required: raw.required !== false,
        min: typeof raw.min === "number" ? raw.min : null,
        max: typeof raw.max === "number" ? raw.max : null,
      });
    }
  }
  return { fields, groups };
}

/** Every field and group of the envelope, in reading order: document, page, top to bottom, left. */
export function readEnvelope(load: Pick<SignerLoadV2, "documents" | "me">): { fields: SField[]; groups: SGroup[] } {
  const actsFor = new Set(load.me.acts_for.length > 0 ? load.me.acts_for : [load.me.id]);
  const docs = [...load.documents].sort((a, b) => a.position - b.position);
  const fields: SField[] = [];
  const groups: SGroup[] = [];
  docs.forEach((doc, docIndex) => {
    const map = readMap(doc.field_map);
    for (const f of map.fields) fields.push({ ...f, documentId: doc.id, docIndex, mine: actsFor.has(f.signer_id) });
    for (const g of map.groups) groups.push({ ...g, documentId: doc.id, mine: actsFor.has(g.signer_id) });
  });
  // Rows within ~1% of a page height count as one line, then left to right.
  fields.sort(
    (a, b) =>
      a.docIndex - b.docIndex || a.page - b.page || (Math.abs(a.y - b.y) > 0.01 ? a.y - b.y : a.x - b.x),
  );
  return { fields, groups };
}

/** What the recipient row says for a name kind (the server fills the same at Sign, §2.3). */
export function recipientValue(kind: FieldKindV2, me: Record<string, unknown>): string | null {
  const full = str(me.full_name) ?? "";
  const cut = full.lastIndexOf(" ");
  switch (kind) {
    case "full_name":
      return full || null;
    case "first_name":
      return (cut > 0 ? full.slice(0, cut) : full) || null;
    case "last_name":
      return cut > 0 ? full.slice(cut + 1) : null;
    case "email":
      return str(me.email);
    case "company":
      return str(me.company);
    case "title":
      return str(me.job_title);
    default:
      return null;
  }
}

/** The value a field SHOWS: what the signer entered, else the recipient's own, else the sender's prefill. */
export function shownValue(field: FieldDefinitionV2, values: Record<string, FieldValue>, me: Record<string, unknown>): FieldValue {
  if (field.read_only && field.prefill !== undefined && field.prefill !== null) return field.prefill;
  const entered = values[field.id];
  if (entered !== undefined) return entered;
  if (isNameKind(field.kind)) {
    const fromRecipient = recipientValue(field.kind, me);
    if (fromRecipient) return fromRecipient;
  }
  if (field.prefill !== undefined && field.prefill !== null) return field.prefill;
  return null;
}

/** A field holds something that counts as done. */
export function isFilled(field: FieldDefinitionV2, value: FieldValue): boolean {
  if (field.kind === "date_signed") return true; // automatic at Sign
  if (isMarkKind(field.kind)) return value === "applied";
  if (field.kind === "checkbox" || field.kind === "radio") return value === true;
  return typeof value === "string" && value.trim() !== "";
}

/** Required work still open, in reading order — what "N required fields remaining" counts. */
export function requiredUnits(
  fields: readonly SField[],
  groups: readonly SGroup[],
  values: Record<string, FieldValue>,
  me: Record<string, unknown>,
): { total: RequiredUnit[]; open: RequiredUnit[] } {
  const total: RequiredUnit[] = [];
  const open: RequiredUnit[] = [];
  const seenGroups = new Set<string>();
  const groupById = new Map(groups.map((g) => [g.id, g]));
  for (const f of fields) {
    if (!f.mine || f.kind === "date_signed" || f.read_only) continue;
    const group = f.group_id ? groupById.get(f.group_id) : undefined;
    if (group) {
      if (seenGroups.has(group.id)) continue;
      seenGroups.add(group.id);
      if (!group.required) continue;
      const members = fields.filter((m) => m.group_id === group.id);
      const chosen = members.filter((m) => shownValue(m, values, me) === true).length;
      const need = group.kind === "radio" ? 1 : Math.max(1, group.min ?? 1);
      const unit = { key: `group:${group.id}`, fieldId: members[0]?.id ?? f.id };
      total.push(unit);
      if (chosen < need) open.push(unit);
      continue;
    }
    if (!f.required) continue;
    const unit = { key: f.id, fieldId: f.id };
    total.push(unit);
    if (!isFilled(f, shownValue(f, values, me))) open.push(unit);
  }
  return { total, open };
}

/** The fields the signer moves through with Next (their own, minus automatic and locked ones). */
export function walkable(fields: readonly SField[]): SField[] {
  return fields.filter((f) => f.mine && f.kind !== "date_signed" && !f.read_only);
}

/** The next field after `fromId` in reading order that is still empty (wrapping). */
export function nextField(
  fields: readonly SField[],
  fromId: string | null,
  values: Record<string, FieldValue>,
  me: Record<string, unknown>,
  onlyRequired: ReadonlySet<string> | null = null,
): SField | null {
  const walk = walkable(fields);
  if (walk.length === 0) return null;
  const start = fromId ? walk.findIndex((f) => f.id === fromId) : -1;
  for (let step = 1; step <= walk.length; step += 1) {
    const f = walk[(start + step + walk.length) % walk.length];
    if (!f || f.id === fromId) continue;
    if (onlyRequired) {
      if (onlyRequired.has(f.id)) return f;
      continue;
    }
    if (!isFilled(f, shownValue(f, values, me))) return f;
  }
  return null;
}

// ── Dates ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A calendar date (local parts) in one of the contract's formats. */
export function formatDate(date: { y: number; m: number; d: number }, format: string): string {
  const dd = String(date.d).padStart(2, "0");
  const mm = String(date.m).padStart(2, "0");
  const yyyy = String(date.y);
  const yy = yyyy.slice(-2);
  switch (format as DateFormat) {
    case "MM/DD/YY":
      return `${mm}/${dd}/${yy}`;
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${yyyy}`;
    case "DD/MM/YY":
      return `${dd}/${mm}/${yy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "MMM D, YYYY":
      return `${MONTHS[date.m - 1]} ${date.d}, ${yyyy}`;
    case "D MMM YYYY":
      return `${date.d} ${MONTHS[date.m - 1]} ${yyyy}`;
    default:
      return `${mm}/${dd}/${yyyy}`;
  }
}

export function today(now: Date = new Date()): { y: number; m: number; d: number } {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

/** "2026-10-07" → the field's format; anything else is shown as typed. */
export function formatIsoDate(iso: string, format: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return formatDate({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }, format);
}

// ── Values ─────────────────────────────────────────────────────────────────

/** The stored entries as plain values. */
export function plainValues(values: FieldValues): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const [id, entry] of Object.entries(values)) out[id] = entry.v;
  return out;
}

/**
 * The complete map on the signer's screen, sent with Sign (§2.3): every field they fill, with the
 * value they see. Name kinds that show the recipient's own value are sent with it.
 */
export function screenPatch(
  fields: readonly SField[],
  values: Record<string, FieldValue>,
  me: Record<string, unknown>,
  seq: number,
): FieldPatch {
  const patch: FieldPatch = {};
  for (const f of walkable(fields)) {
    const v = shownValue(f, values, me);
    patch[f.id] = { v: v === undefined ? null : v, seq };
  }
  return patch;
}

/** What a field reads as in a list (the review step, the confirmation). */
export function describeValue(field: FieldDefinitionV2, value: FieldValue, dateFormat: string): string {
  if (field.kind === "date_signed") return formatDate(today(), field.date_format ?? dateFormat);
  if (isMarkKind(field.kind)) return value === "applied" ? (field.kind === "signature" ? "Signed" : "Initialed") : "—";
  if (field.kind === "checkbox" || field.kind === "radio") {
    if (value !== true) return "—";
    return field.kind === "radio" ? (field.option_value ?? "Chosen") : "Checked";
  }
  if (typeof value !== "string" || value === "") return "—";
  if (field.kind === "date") return formatIsoDate(value, field.date_format ?? dateFormat);
  return value;
}

/** "Mary Ann van Dyke" → "MAVD"; at most four letters. */
export function initialsOf(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
}

/** A value the field's own rules would refuse (§2.2), as one short sentence — or null. */
export function valueProblem(field: FieldDefinitionV2, value: FieldValue): string | null {
  if (value === null || value === "") return null;
  if (field.kind === "number" && typeof value === "string") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "Enter a number.";
    if (field.number?.min != null && n < field.number.min) return `At least ${field.number.min}.`;
    if (field.number?.max != null && n > field.number.max) return `At most ${field.number.max}.`;
  }
  if (field.kind === "email" && typeof value === "string" && !/^\S+@\S+\.\S+$/.test(value)) {
    return "Enter an email address.";
  }
  return null;
}
