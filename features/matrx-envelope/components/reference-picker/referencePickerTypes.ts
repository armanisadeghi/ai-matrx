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
 * The common tier — the types shown first, by the names users know. This is
 * an opinion, so it is the CODE DEFAULT of an org knob (feature-knobs), not a
 * ceiling: "All types" always exposes the whole DB-driven pickable set.
 * Order is display order. Tokens the registry cannot list are skipped at
 * render time, never shown broken.
 */
export const COMMON_REFERENCE_TYPES: readonly string[] = [
  "conversation",
  "note",
  "task",
  "project",
  "file",
  "udt_document",
  "agent",
  "dataset",
  "workbook",
  "transcript",
  "url",
];

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
 * Types whose "+ New" inline create is offered (picker-custom-entry law):
 * plain title-column rows the generic entity-row service can create.
 */
export const INLINE_CREATE_REFERENCE_TYPES: ReadonlySet<string> = new Set([
  "note",
  "task",
  "project",
]);
