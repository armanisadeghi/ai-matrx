import "server-only";

// features/portals/shown.ts — WHAT A SCREEN IS ALLOWED TO PUT ON THE PAGE.
//
// Two facts come from two different doors and neither one alone is enough:
//
//   · `custom.portal_me()` says WHICH field keys this portal shows
//     (`visible_fields`) and which of them she may change (`editable_fields`).
//     It is the access decision and it is the only one.
//   · `custom.applicable_fields` says what each key is CALLED and in what order
//     the Table itself lists its Fields. It is the vocabulary, and it knows
//     about fields this portal never opened.
//
// 🚨 THE INTERSECTION IS THE SCREEN, AND IT IS TAKEN HERE, ONCE. Two things make
// this necessary rather than decorative:
//
//   1. A masked field is NOT absent from the record. `custom.read_records`
//      returns it as a NULL key beside a `_hidden` block that names it and says
//      why. Rendering "whatever the document has" would therefore print
//      `internal_margin` — the key and, via the Field definitions, its label —
//      onto a page built for somebody outside the business. The portal's own
//      `visible_fields` is the list that does not contain it.
//   2. `visible_fields` arrives alphabetical, which is not an order anybody
//      would choose to read ("Client notes, Scheduled for, Stage, Job"). The
//      Table's own Field order is, so the keys are sorted into it.
//
// This is not the app second-guessing the door. Both lists come FROM the doors;
// nothing here adds a key, and nothing here can widen what she sees.

import { portalFields, type PortalTable } from "./service";

export interface ShownField {
  key: string;
  label: string;
  type: string;
  editable: boolean;
}

/**
 * The fields one Table shows this client, in the Table's own order, each with
 * its real label and whether the portal opened it for editing.
 */
export async function shownFields(
  organizationId: string,
  table: PortalTable,
): Promise<ShownField[]> {
  const defined = await portalFields(organizationId, table.table_id);
  const order = new Map(defined.map((f, index) => [f.key, index]));
  const labels = new Map(defined.map((f) => [f.key, f]));
  const editable = new Set(table.editable_fields ?? []);

  return (table.visible_fields ?? [])
    .slice()
    .sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER))
    .map((key) => {
      const field = labels.get(key);
      return {
        key,
        label: field?.label ?? key,
        type: field?.type ?? "text",
        editable: editable.has(key),
      };
    });
}

/**
 * One value as a person reads it. A value the record does not carry is an empty
 * string, never the word "null" and never a key name — the caller decides how
 * an empty one looks.
 */
export function readable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join(", ");
  return "";
}
