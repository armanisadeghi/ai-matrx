/**
 * Reference picker — the user-grade "pick a thing, get its reference" contract.
 *
 * User-facing vocabulary (Arman, 2026-09-11: no "directive/noun/verb" anywhere
 * a user can see): the thing is a **reference**, the kind of thing is its
 * **type**, and what the reference does is its **action** — "Link to it" by
 * default. The wire stays the Kind Directive shell; only the words change.
 */

import type { DirectiveClass } from "@ai-matrx/content-ir";

/** How the picked reference leaves the picker. */
export type ReferenceDelivery = "insert" | "copy";

export interface ReferencePick {
  /** The canonical ```matrx fence carrying the minified one-line shell. */
  fence: string;
  /** The bare minified shell (what the fence wraps) — for "copy as plain JSON". */
  shell: string;
  /** Grammar class the fence carries — `reference` unless the user changed the action. */
  directiveClass: DirectiveClass;
  /** Reference type token on the wire (`conversation`, `note`, `file`, `url`, …). */
  type: string;
  /** Display title of the picked record (for toasts), when known. */
  title: string | null;
  delivery: ReferenceDelivery;
}

/**
 * The common tier — the types shown first, by the names users know — is an
 * ORG OPINION, so it is not in this file: it is the knob
 * `platform.reference_picker.common_types`, read through
 * `useCommonReferenceTypes()`. "All types" always exposes the whole DB-driven
 * pickable set, so the knob curates a shortcut and can never hide a type.
 */

/**
 * Friendly names for the common tier where the registry label is not the
 * word users use. Everything else falls through to `referenceTypeLabel`.
 */
export const FRIENDLY_REFERENCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  conversation: "Chat",
  udt_document: "Document",
  dataset: "Table",
  url: "Web link",
};

/**
 * Classes whose items are a WRITE PAYLOAD (the record's fields), not an
 * identity. Their items go on the wire verbatim.
 */
const PAYLOAD_CLASSES: ReadonlySet<DirectiveClass> = new Set<DirectiveClass>([
  "create",
  "update",
  "action",
]);

/**
 * The items exactly as they go on the wire.
 *
 * An IDENTITY item (link, delete) carries a `label` only as a display hint for
 * the picker; it is removed so the fence stays pure identity — the chip
 * resolves the live name itself, and a delete item's schema forbids extra
 * keys. A PAYLOAD item (create, update) is never touched: its `label` may be a
 * real column (a note's title column IS `label`), and dropping it would insert
 * a button that silently creates an untitled note.
 */
export function wireItems<T extends object>(
  directiveClass: DirectiveClass,
  items: readonly T[],
): Record<string, unknown>[] {
  if (PAYLOAD_CLASSES.has(directiveClass)) {
    return items.map((item) => ({ ...(item as Record<string, unknown>) }));
  }
  return items.map((item) => {
    const { label: _label, ...rest } = item as Record<string, unknown>;
    return rest;
  });
}

/**
 * Types whose "+ New" inline create is offered (picker-custom-entry law):
 * plain title-column rows the generic entity-row service can create.
 */
export const INLINE_CREATE_REFERENCE_TYPES: ReadonlySet<string> = new Set([
  "note",
  "task",
  "project",
]);

/**
 * The types a PERSON is offered — every reference-pickable type minus:
 *   - a component type (`is_component`: a child row of another record, e.g. a
 *     study plan block) — a registry fact;
 *   - the organization's `platform.reference_picker.hidden_types` knob
 *     (machinery a non-technical expert never links to) — an opinion.
 * Order is preserved. Pure, so the guard can prove it without React.
 */
export function visibleReferenceTypeTokens(
  tokens: readonly string[],
  hidden: readonly string[],
  isComponent: (token: string) => boolean,
): string[] {
  const hiddenSet = new Set(hidden);
  return tokens.filter((t) => !hiddenSet.has(t) && !isComponent(t));
}
