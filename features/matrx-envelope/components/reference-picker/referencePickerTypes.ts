import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
/**
 * Reference picker — the user-grade "pick a thing, get its reference" contract.
 *
 * User-facing vocabulary (Arman, 2026-09-11: no "directive/noun/verb" anywhere
 * a user can see): the thing is a **reference**, the kind of thing is its
 * **type**, and what the reference does is its **action** — "Link to it" by
 * default. The wire stays the Kind Directive shell; only the words change.
 */

import type { DirectiveClass } from "@ai-matrx/content-ir";
import { GENERIC_PARTY_WORDS } from "@/features/crm/party-words";
import { referenceTypeLabel } from "@/features/scopes/utils/referenceCell";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { titleCaseGroupLabel } from "@/features/scopes/utils/referenceTypeGroups";
import { isEntityTypeToken } from "@ai-matrx/associations";
import {
  CATALOG_ALIASES,
  CATALOG_NOUN_DISPLAY,
} from "@/features/matrx-envelope/catalog-nouns.generated";

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
 * The product's own word where the registry label is a storage word. Every
 * name here already ships elsewhere — nothing is coined:
 *   - `party` → the CRM's generic word for a person or company record
 *     (`features/crm/party-words.ts`), never the registry's "Entity";
 * `scope` keeps its registry label, **Scope** — the on-screen word (vocabulary
 * § "The word Context", Arman, 2026-10-02). It used to read "Record", the
 * Doctrine's word for ANY row, which named nothing in a list of record types
 * (G6B review).
 * Everything else falls through to `referenceTypeLabel`.
 */
const FRIENDLY_REFERENCE_TYPE_WORDS: Readonly<Record<string, { singular: string; plural: string }>> = {
  conversation: { singular: "Chat", plural: "Chats" },
  udt_document: { singular: "Document", plural: "Documents" },
  dataset: { singular: "Table", plural: "Tables" },
  url: { singular: "Web link", plural: "Web links" },
  party: GENERIC_PARTY_WORDS,
};

export const FRIENDLY_REFERENCE_TYPE_LABELS: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(FRIENDLY_REFERENCE_TYPE_WORDS).map(([token, words]) => [token, words.singular]),
  );

/**
 * THE name of a record type, everywhere a person sees one: the type chooser,
 * an action card ("Update Chat"), its confirm and its tally (the directive host's
 * noun catalog answers this). ONE record type, ONE name (G6A follow-up,
 * 2026-10-02: a card said "Conversation" where the picker said "Chat").
 *
 * The product word first; then the registry's label; then the server catalog's
 * label (a type the registry does not carry — "Settings Profile", never the
 * token's "Ai Setting Profile"); the token last. In Title Case like its group
 * headings — the registry mixes "Careers portal" with "Agent Template", and one
 * list must read one way. An alias reads as its canonical type.
 */
/**
 * The canonical token for a type. An alias reads as its canonical type — but a
 * real type never reads as an alias: the catalog both lists `document`
 * (content.document, the Markdown document) AND aliases `document` →
 * `udt_document`, and alias-first printed the Markdown document as "Document",
 * the Univer document's name (G11A review, 2026-10-07: two "Document"s).
 */
function canonicalTypeToken(type: string): string {
  if (isEntityTypeToken(type) || CATALOG_NOUN_DISPLAY[type]) return type;
  return (CATALOG_ALIASES as Record<string, string>)[type] ?? type;
}

export function referenceTypeDisplayLabel(type: string): string {
  const token = canonicalTypeToken(type);
  const known = referenceTypeLabel(token);
  const fromToken = humanizeIdentifier(token) || token;
  const catalog = CATALOG_NOUN_DISPLAY[token]?.label?.trim() ?? "";
  const raw =
    FRIENDLY_REFERENCE_TYPE_LABELS[token] ?? (known !== fromToken ? known : catalog || known);
  return raw
    .split(/\s+/)
    .map((word) => (word.includes("-") ? word : titleCaseGroupLabel(word)))
    .join(" ");
}

/**
 * THE plural of a record type ("Search chats…", "No chats available", "Show
 * more chats"), from the same rule as `referenceTypeDisplayLabel` — one type,
 * one name, singular or plural (G8B review, 2026-10-02: the Chat search said
 * "Search conversations…"). The product word's own plural first; then, when
 * the display label IS the registry's singular, the registry's plural;
 * otherwise the display label plus "s".
 */
export function referenceTypeDisplayPlural(type: string): string {
  const token = canonicalTypeToken(type);
  const friendly = FRIENDLY_REFERENCE_TYPE_WORDS[token];
  if (friendly) return friendly.plural;
  const display = referenceTypeDisplayLabel(token);
  const registryPlural = tryGetEntityInfo(token)?.labelPlural?.trim();
  if (registryPlural && display.toLowerCase() === referenceTypeLabel(token).toLowerCase()) {
    return registryPlural;
  }
  return /s$/i.test(display) ? display : `${display}s`;
}

/**
 * The "All types" toggle. The count appears only once the hidden-types knob
 * has answered — a number that drops from 114 to 88 a beat later is a number
 * that lied (G5 review, 2026-10-02).
 */
export function allTypesToggleLabel(count: number, settled: boolean): string {
  return settled ? `All types (${count})` : "All types";
}

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
