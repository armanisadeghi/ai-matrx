// features/esign/contract/fieldModel.ts — STEP 0, FROZEN (e-sign parity CONTRACT.md §1.2, verbatim).
// Only the owning session amends this file (CONTRACT.md §21). Every lane imports from here.

export type FieldKindV2 =
  | "signature" | "initials" | "date_signed"
  | "full_name" | "first_name" | "last_name" | "email" | "company" | "title"
  | "text" | "number" | "date" | "checkbox" | "radio" | "dropdown";

export const FIELD_KINDS_V2: readonly FieldKindV2[] = [
  "signature", "initials", "date_signed", "full_name", "first_name", "last_name", "email",
  "company", "title", "text", "number", "date", "checkbox", "radio", "dropdown",
];

export type DateFormat =
  | "MM/DD/YYYY" | "MM/DD/YY" | "DD/MM/YYYY" | "DD/MM/YY" | "YYYY-MM-DD" | "MMM D, YYYY" | "D MMM YYYY";

/** Fractions of the page, top-left origin, page 1-based (unchanged from v1). */
export interface FieldBox { page: number; x: number; y: number; w: number; h: number }

export interface FieldDefinitionV2 extends FieldBox {
  id: string;                 // uuid minted by the sender's browser; stable draft → frozen map
  kind: FieldKindV2;
  signer_id: string;          // frozen map. (In a draft the same field carries recipient_key instead.)
  required: boolean;
  label: string;              // the data label the callout shows ("Signature 1"); ≤ 60 chars
  tooltip?: string | null;    // ≤ 140 chars
  read_only?: boolean;        // true only with a prefill: the sender's value, locked
  prefill?: string | boolean | null; // D6.1 — sender's value; replaces the label on the page
  placeholder?: string | null;
  max_length?: number | null; // text; 1..4000
  multiline?: boolean;        // text
  number?: { min?: number | null; max?: number | null; decimals?: number } | null;
  date_format?: DateFormat | null;   // date and date_signed; null = envelope default
  options?: string[] | null;         // dropdown; 1..50 non-blank, unique
  group_id?: string | null;          // radio (required) / checkbox (optional)
  option_value?: string | null;      // radio (required, unique in group) / checkbox in a group
  source?: "placed" | "detected";    // detected = came from auto-placement (D4.2)
}

export interface FieldGroupV2 {
  id: string;
  kind: "checkbox" | "radio";
  signer_id: string;
  label: string;
  required: boolean;          // radio: one must be chosen; checkbox: at least `min` (default 1)
  min?: number | null;        // checkbox only
  max?: number | null;        // checkbox only
}

export interface FieldMapV2 { schema_version: 2; fields: FieldDefinitionV2[]; groups: FieldGroupV2[] }

export type FieldValue = string | boolean | null;
/** `seq` orders writes per field (§2.1); `at` is the server's save time. */
export interface FieldValueEntry { v: FieldValue; seq: number; at: string }
export type FieldValues = Record<string, FieldValueEntry>;          // keyed by field id
/** What the browser sends: per field, the value and its sequence. */
export type FieldPatch = Record<string, { v: FieldValue; seq: number }>;
