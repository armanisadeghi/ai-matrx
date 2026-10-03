/**
 * One table row as someone outside its organization sees it — the server-safe half.
 *
 * ACCESS LADDER T-40. The database decides what leaves the store
 * (`custom._record_outside_projection`): the row's own fields at viewer, never a
 * Confidential, Restricted, protected or relation field. Three doors hand the same
 * shape here: the public page `/p/e/record/<id>` (`public.record_public_view`), an
 * Anyone link (`resolve_share_token` → `children.kind = "record_fields"`) and a
 * person share (the same public page, signed in). This module only reads the shape
 * and words the values — it never decides what may be shown.
 */

export interface SharedRecordField {
  key: string;
  label: string;
  type: string | null;
  unit: string | null;
  format: string | null;
  value: unknown;
}

export interface SharedRecord {
  id: string;
  title: string;
  tableName: string;
  labelSingular: string;
  fields: SharedRecordField[];
  updatedAt: string | null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Read the projection the database returned; null when it is not that shape. */
export function readSharedRecord(raw: unknown): SharedRecord | null {
  const r = obj(raw);
  if (!r || typeof r.id !== "string") return null;
  const table = obj(r.table) ?? {};
  const fields = Array.isArray(r.fields) ? r.fields : [];
  return {
    id: r.id,
    title: text(r.title) ?? text(table.label_singular) ?? "Record",
    tableName: text(table.name) ?? "Table",
    labelSingular: text(table.label_singular) ?? "Record",
    fields: fields
      .map(obj)
      .filter((f): f is Record<string, unknown> => !!f && typeof f.key === "string")
      .map((f) => ({
        key: f.key as string,
        label: text(f.label) ?? (f.key as string),
        type: text(f.type),
        unit: text(f.unit),
        format: text(f.format),
        value: f.value,
      })),
    updatedAt: text(r.updated_at),
  };
}

/** An Anyone link's children for a table row (`platform.share_link_children`). */
export function readSharedRecordChildren(
  children: Record<string, unknown> | null | undefined,
): SharedRecord | null {
  if (!children || children.kind !== "record_fields") return null;
  return readSharedRecord(children.record);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A stored date or date-time, worded from the string itself: the day and the clock time the
 * row was written with, never shifted into the server's or the visitor's zone, so the server
 * render and the browser agree to the character (no hydration mismatch, no day-early dates).
 */
export function wordDateValue(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  const month = MONTHS[Number(mo) - 1];
  if (!month) return null;
  const day = `${month} ${Number(d)}, ${y}`;
  if (hh === undefined || mm === undefined) return day;
  const h = Number(hh);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${day}, ${h12}:${mm} ${suffix}`;
}

function wordOne(value: unknown, field: SharedRecordField): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    const n = value.toLocaleString("en-US");
    return field.unit ? `${n} ${field.unit}` : n;
  }
  if (typeof value === "string") {
    if (field.type === "range" || field.format === "date" || field.format === "datetime") {
      const worded = wordDateValue(value);
      if (worded) return worded;
    }
    return field.unit && /^-?\d+(\.\d+)?$/.test(value) ? `${value} ${field.unit}` : value;
  }
  if (Array.isArray(value)) return value.map((v) => wordOne(v, field)).filter(Boolean).join(", ");
  return JSON.stringify(value);
}

/** One field's value in words, as the page shows it. */
export function wordFieldValue(field: SharedRecordField): string {
  return wordOne(field.value, field);
}
