/**
 * THE AUTO-VIEW's naming half (KD4).
 *
 * Arman's ruling: every enrolled noun "instantly has a view" — the prefix rule
 * gives it a renderer, and this gives it a NAME. A shape the frontend has never
 * heard of must still read as "Agent · Agents", never as the raw `agent` token
 * and never as a slug. The catalog is the authority for both (`label`,
 * `family`, `title_column`, `identity_fields` on `platform.entity_types`); the
 * client reads the mirrored slim table rather than inventing a second one.
 *
 * A noun the catalog does not carry (a Kind Action like `plan_tree`, or a noun
 * added server-side since the last mirror) degrades to a title-cased token —
 * legible, honestly derived, never blank and never an error.
 */

import {
  CATALOG_NOUNS,
  CATALOG_NOUN_DISPLAY,
} from "@/features/matrx-envelope/catalog-nouns.generated";

import type { DirectiveClass } from "./grammar";

export interface DirectiveDisplay {
  /** The noun's human name — "Agent", "Plan tree". */
  noun: string;
  /** The catalog family ("Agents"), or "" when the catalog has none. */
  family: string;
  /** What this directive DOES, in the user's words — "Create", "Reference". */
  action: string;
  /** One line: "Create Agent". */
  title: string;
}

/** `plan_node_patch` → `Plan node patch`. The honest last resort. */
function titleCase(token: string): string {
  const words = token.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : token;
}

/**
 * How a class reads to a human. `action` is deliberately "Run": a Kind Action
 * is a named procedure, and "Action Plan tree" reads like a noun phrase where a
 * verb belongs.
 */
const ACTION_BY_CLASS: Readonly<Record<DirectiveClass, string>> = {
  reference: "Reference",
  view: "View",
  create: "Create",
  update: "Update",
  delete: "Delete",
  action: "Run",
  validation: "Validate",
  secret: "Secret",
};

/** The catalog's label for a noun, or a title-cased fallback. */
export function nounLabel(noun: string): string {
  const label = CATALOG_NOUN_DISPLAY[noun]?.label;
  return label && label.length > 0 ? label : titleCase(noun);
}

/** The catalog's family for a noun, or "" when it has none. */
export function nounFamily(noun: string): string {
  return CATALOG_NOUN_DISPLAY[noun]?.family ?? "";
}

/**
 * The catalog's title column for a noun — which field of a fetched row names
 * it. Null for a noun the catalog does not carry with a plain `id` identity.
 */
export function nounTitleColumn(noun: string): string | null {
  return CATALOG_NOUNS[noun]?.title_column ?? null;
}

/** Everything a generic card needs to name a directive it cannot render. */
export function directiveDisplay(
  directiveClass: DirectiveClass,
  noun: string,
): DirectiveDisplay {
  const label = nounLabel(noun);
  const action = ACTION_BY_CLASS[directiveClass];
  return {
    noun: label,
    family: nounFamily(noun),
    action,
    title: `${action} ${label}`,
  };
}
