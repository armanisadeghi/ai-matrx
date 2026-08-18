// features/education/publishing/validate.ts
//
// Runtime validation for authored `sections` JSON before it reaches the DB.
// The editor accepts raw JSON (so agent-drafted content pastes cleanly), so we
// guard the EduSection[] shape here rather than trusting the string. Returns a
// parsed value or a human-readable error — never throws.

import { EDU_STATUSES } from "../types";
import type { EduSection } from "../types";

/**
 * THE section-kind vocabulary — the single source of truth for what the
 * authoring surface accepts. Exported because the surface write handlers in
 * `components/LearnDocAdmin.tsx` validate agent-supplied sections against this
 * same set: an enum re-typed in a second place is an enum that drifts.
 */
export const EDU_SECTION_KINDS = [
  "prose",
  "feature-grid",
  "steps",
  "status-cards",
  "stat-bar",
  "faq",
  "cta",
] as const;

const KINDS: ReadonlySet<string> = new Set(EDU_SECTION_KINDS);

export interface SectionsParseResult {
  ok: boolean;
  sections?: EduSection[];
  error?: string;
}

/**
 * The keys `LearnDoc["related"]` actually renders — the conversion bridge from
 * an article to app tools / subject hubs / exam hubs.
 *
 * `validateRelatedValue` deliberately does NOT enforce this: the admin's
 * textarea has always accepted any object, and narrowing it now would reject
 * rows that already exist. The surface write target IS narrowed to these keys
 * (an agent writing a key nothing renders is a silent no-op), so the handler in
 * `components/LearnDocAdmin.tsx` checks against this constant.
 */
export const LEARN_DOC_RELATED_KEYS = ["tools", "subjects", "exams"] as const;

export interface RelatedParseResult {
  ok: boolean;
  related?: Record<string, string[]>;
  error?: string;
}

/**
 * Shape-check an ALREADY-PARSED sections value.
 *
 * Split out from `parseSectionsJson` so the caller that holds a real value
 * rather than a string — the surface write handlers, which receive an array
 * already parsed by the inline-tool layer — enforces the exact same shape and
 * reports the exact same errors as the human's textarea.
 */
export function validateSectionsValue(value: unknown): SectionsParseResult {
  if (!Array.isArray(value)) {
    return { ok: false, error: "Sections must be a JSON array." };
  }
  for (let i = 0; i < value.length; i++) {
    const s = value[i] as { kind?: unknown };
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      return { ok: false, error: `Section ${i + 1} is not an object.` };
    }
    if (typeof s.kind !== "string" || !KINDS.has(s.kind)) {
      return {
        ok: false,
        error: `Section ${i + 1} has an unknown kind "${String(s.kind)}". Allowed: ${EDU_SECTION_KINDS.join(", ")}.`,
      };
    }
  }
  return { ok: true, sections: value as EduSection[] };
}

/**
 * The fields `SectionRenderer` actually reads for each section kind, as
 * `[field, itemShape?]` — used to check AGENT-supplied sections.
 *
 * `validateSectionsValue` deliberately stops at `kind`, because the admin's
 * textarea has always accepted anything past it and tightening that now would
 * reject guides that already exist. An agent has no such history and no way to
 * see the renderer, so it guesses field names — a real run produced FAQ items
 * keyed `{ question, answer }` instead of `{ q, a }`, which parses, saves, and
 * renders BLANK. That failure is silent in exactly the way the writeback seam
 * exists to prevent, so the write handlers run this stricter pass.
 */
const SECTION_ITEM_FIELDS: Record<
  string,
  | { listField: string; itemFields: readonly string[] }
  | { textFields: readonly string[] }
> = {
  prose: { textFields: ["body"] },
  "feature-grid": { listField: "items", itemFields: ["title", "description"] },
  steps: { listField: "steps", itemFields: ["number", "title", "description"] },
  "status-cards": { listField: "cards", itemFields: ["title", "status"] },
  "stat-bar": { listField: "stats", itemFields: ["value", "label"] },
  faq: { listField: "items", itemFields: ["q", "a"] },
  cta: { textFields: ["heading"] },
};

const OPTIONAL_TEXT_FIELDS: Partial<Record<string, readonly string[]>> = {
  prose: ["heading"],
  "feature-grid": ["heading", "subheading"],
  steps: ["heading", "subheading"],
  "status-cards": ["heading", "subheading"],
  faq: ["heading"],
  cta: ["body"],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireStringField(
  record: Record<string, unknown>,
  field: string,
  where: string,
): string | null {
  const value = record[field];
  if (typeof value !== "string") {
    return `${where} needs a text "${field}" field.`;
  }
  return null;
}

function validateLink(value: unknown, where: string): string | null {
  if (!isPlainObject(value))
    return `${where} must be an object with "label" and "href".`;
  return (
    requireStringField(value, "label", where) ??
    requireStringField(value, "href", where)
  );
}

/** Human-readable contract per kind, for both the UI hint and agent errors. */
export function describeSectionKind(kind: string): string {
  if (kind === "cta") {
    return "cta { heading, primary: { label, href }, secondary?: { label, href } }";
  }
  const spec = SECTION_ITEM_FIELDS[kind];
  if (!spec) return kind;
  if ("textFields" in spec) return `${kind} { ${spec.textFields.join(", ")} }`;
  return `${kind} { ${spec.listField}: [{ ${spec.itemFields.join(", ")} }] }`;
}

/** Every kind's contract, one line — used in write-target errors. */
export function describeAllSectionKinds(): string {
  return EDU_SECTION_KINDS.map(describeSectionKind).join(" · ");
}

/**
 * Stricter, AGENT-ONLY pass: after `validateSectionsValue` has confirmed the
 * kinds, confirm each section carries the fields its renderer reads.
 */
export function validateSectionFields(sections: readonly unknown[]): {
  ok: boolean;
  error?: string;
} {
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!isPlainObject(section)) {
      return { ok: false, error: `Section ${i + 1} is not an object.` };
    }
    const kind = String(section.kind);
    const spec = SECTION_ITEM_FIELDS[kind];
    if (!spec) continue;
    const where = `Section ${i + 1} (kind "${kind}")`;

    if ("textFields" in spec) {
      for (const field of spec.textFields) {
        const error = requireStringField(section, field, where);
        if (error) {
          return {
            ok: false,
            error: `${error} Expected ${describeSectionKind(kind)}.`,
          };
        }
      }
    } else {
      const list = section[spec.listField];
      if (!Array.isArray(list)) {
        return {
          ok: false,
          error: `${where} is missing its "${spec.listField}" array. Expected ${describeSectionKind(kind)}.`,
        };
      }
      for (let j = 0; j < list.length; j++) {
        const item = list[j];
        if (!isPlainObject(item)) {
          return {
            ok: false,
            error: `${where}, ${spec.listField}[${j}] is not an object. Expected ${describeSectionKind(kind)}.`,
          };
        }
        const invalid = spec.itemFields.find(
          (field) => typeof item[field] !== "string",
        );
        if (invalid) {
          return {
            ok: false,
            error: `${where}, ${spec.listField}[${j}] needs a text "${invalid}" field — it has ${
              Object.keys(item)
                .map((key) => `"${key}"`)
                .join(", ") || "no fields"
            }. Expected ${describeSectionKind(kind)}.`,
          };
        }
        if (kind === "status-cards") {
          if (
            typeof item.status !== "string" ||
            !EDU_STATUSES.some((status) => status === item.status)
          ) {
            return {
              ok: false,
              error: `${where}, cards[${j}] has status "${String(item.status)}". Allowed: ${EDU_STATUSES.join(", ")}.`,
            };
          }
          if (
            item.bullets !== undefined &&
            (!Array.isArray(item.bullets) ||
              item.bullets.some((bullet) => typeof bullet !== "string"))
          ) {
            return {
              ok: false,
              error: `${where}, cards[${j}].bullets must be a list of text.`,
            };
          }
        }
      }
    }

    for (const field of OPTIONAL_TEXT_FIELDS[kind] ?? []) {
      if (section[field] !== undefined && typeof section[field] !== "string") {
        return {
          ok: false,
          error: `${where} has a non-text "${field}" field.`,
        };
      }
    }
    if (
      kind === "feature-grid" &&
      section.columns !== undefined &&
      section.columns !== 2 &&
      section.columns !== 3
    ) {
      return { ok: false, error: `${where}.columns must be 2 or 3.` };
    }
    if (kind === "cta") {
      const primaryError = validateLink(section.primary, `${where}.primary`);
      if (primaryError) return { ok: false, error: primaryError };
      if (section.secondary !== undefined) {
        const secondaryError = validateLink(
          section.secondary,
          `${where}.secondary`,
        );
        if (secondaryError) return { ok: false, error: secondaryError };
      }
    }
  }
  return { ok: true };
}

/** Full save/publish gate: kind vocabulary plus every renderer-consumed field. */
export function validateAuthoredSections(value: unknown): SectionsParseResult {
  const kinds = validateSectionsValue(value);
  if (!kinds.ok) return kinds;
  const sections = kinds.sections ?? [];
  const fields = validateSectionFields(sections);
  if (!fields.ok) return { ok: false, error: fields.error };
  return { ok: true, sections };
}

/** Shape-check an ALREADY-PARSED `related` value. */
export function validateRelatedValue(value: unknown): RelatedParseResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Related must be a JSON object." };
  }
  return { ok: true, related: value as Record<string, string[]> };
}

/** Parse + shape-check a sections JSON string. */
export function parseSectionsJson(raw: string): SectionsParseResult {
  const text = raw.trim();
  if (!text) return { ok: true, sections: [] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  return validateSectionsValue(value);
}

/** Parse the `related` cross-link JSON (tools/subjects/exams string arrays). */
export function parseRelatedJson(raw: string): RelatedParseResult {
  const text = raw.trim();
  if (!text) return { ok: true, related: {} };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  return validateRelatedValue(value);
}
