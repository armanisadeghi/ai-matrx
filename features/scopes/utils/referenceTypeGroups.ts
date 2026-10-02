/**
 * THE GROUP a reference type is shown under in every type chooser — the
 * "Add a reference" picker's "All types" and the reference-config editor's
 * paired selects. Derived from the registry, never from a hand list:
 *
 *   1. an admin-assigned chooser bucket (`platform.entity_types.reference_category`,
 *      shown by `platform.reference_categories`) wins when it is active;
 *   2. else the type's schema, by the schema's display name
 *      (`platform.schemas`, generated as `SCHEMA_DISPLAY`);
 *   3. else the schema name itself, Title Cased (a short one is an acronym:
 *      `hr` → "HR", `seo` → "SEO").
 *
 * Every label leaves here in Title Case, so one admin-typed lowercase bucket
 * (`documentation`, `seo` — live 2026-10-02) can never print as-is beside
 * "Workspace". Before this module the picker grouped by the catalogue's
 * `family` (null for ~90 of 116 types → one "Other" bucket) while the config
 * editor grouped by schema with the raw slug as a fallback label: two
 * groupings of one set. Guard: `__tests__/referenceTypeGroups.test.ts`.
 */

import {
  ENTITY_TYPE_METADATA,
  REFERENCE_CATEGORY_DISPLAY,
  SCHEMA_DISPLAY,
  isEntityTypeToken,
} from "@ai-matrx/associations";

/** Types with no `platform.entity_types` row (`url` has no Matrx-owned id). */
export const BASICS_GROUP = "__basics__";

/** Schemas this short are acronyms when they have no display name. */
const ACRONYM_MAX = 3;

/**
 * Schemas a person thinks of as ONE group, folded into the schema whose
 * display name they read. Storage splits these for engineering reasons; a
 * person does not (G5 review, 2026-10-02):
 *   - `workbench` → `workspace`: a Note sat under "Workbench" while its Task
 *     sat under "Workspace";
 *   - `marketing` → `web`: "Marketing" and "Marketing & Web" were two groups.
 * An admin-assigned chooser bucket (`reference_category`) still wins over this.
 */
const PERSON_GROUP_SCHEMA: Readonly<Record<string, string>> = {
  workbench: "workspace",
  marketing: "web",
};

/** The five entities a registry label can carry; a label is text, never HTML. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** Decode HTML entities a stored label picked up ("Marketing &amp; Web"). */
export function decodeLabelEntities(raw: string): string {
  return raw.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => HTML_ENTITIES[m] ?? m);
}

/**
 * Title Case for a group label: every word starts upper-case; a word that is
 * already upper-case (AI, CRM, PDF) is kept; joiners ("&", "and") stay.
 */
export function titleCaseGroupLabel(raw: string): string {
  return decodeLabelEntities(raw)
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word === "&") return word;
      if (word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** The stable key of a type's group (use it to bucket). */
export function referenceTypeGroupKey(token: string): string {
  if (!isEntityTypeToken(token)) return BASICS_GROUP;
  const meta = ENTITY_TYPE_METADATA[token];
  const category = meta.referenceCategory;
  if (category && REFERENCE_CATEGORY_DISPLAY[category]?.isActive) {
    return `cat:${category}`;
  }
  return `schema:${PERSON_GROUP_SCHEMA[meta.schema] ?? meta.schema}`;
}

/** The human label of a group key, always Title Case. */
export function referenceTypeGroupLabel(key: string): string {
  if (key === BASICS_GROUP) return "Links";
  if (key.startsWith("cat:")) {
    const slug = key.slice("cat:".length);
    return titleCaseGroupLabel(REFERENCE_CATEGORY_DISPLAY[slug]?.label ?? slug);
  }
  const schema = key.slice("schema:".length);
  const display = SCHEMA_DISPLAY[schema]?.label;
  if (display) return titleCaseGroupLabel(display);
  return schema.length <= ACRONYM_MAX
    ? schema.toUpperCase()
    : titleCaseGroupLabel(schema);
}

/** Convenience: the label of the group a type belongs to. */
export function referenceTypeGroup(token: string): string {
  return referenceTypeGroupLabel(referenceTypeGroupKey(token));
}
