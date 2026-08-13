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
  { listField: string; itemFields: readonly string[] } | { textFields: readonly string[] }
> = {
  prose: { textFields: ["body"] },
  "feature-grid": { listField: "items", itemFields: ["title", "description"] },
  steps: { listField: "steps", itemFields: ["number", "title", "description"] },
  "status-cards": { listField: "cards", itemFields: ["title", "status"] },
  "stat-bar": { listField: "stats", itemFields: ["value", "label"] },
  faq: { listField: "items", itemFields: ["q", "a"] },
  cta: { textFields: ["heading", "primary"] },
};

/** Human-readable contract per kind, for both the UI hint and agent errors. */
export function describeSectionKind(kind: string): string {
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
export function validateSectionFields(
  sections: readonly unknown[],
): { ok: boolean; error?: string } {
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i] as Record<string, unknown>;
    const kind = String(section.kind);
    const spec = SECTION_ITEM_FIELDS[kind];
    if (!spec) continue;
    const where = `Section ${i + 1} (kind "${kind}")`;

    if ("textFields" in spec) {
      for (const field of spec.textFields) {
        if (section[field] === undefined || section[field] === null) {
          return {
            ok: false,
            error: `${where} is missing "${field}". Expected ${describeSectionKind(kind)}.`,
          };
        }
      }
      continue;
    }

    const list = section[spec.listField];
    if (!Array.isArray(list)) {
      return {
        ok: false,
        error: `${where} is missing its "${spec.listField}" array. Expected ${describeSectionKind(kind)}.`,
      };
    }
    for (let j = 0; j < list.length; j++) {
      const item = list[j] as Record<string, unknown>;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return {
          ok: false,
          error: `${where}, ${spec.listField}[${j}] is not an object. Expected ${describeSectionKind(kind)}.`,
        };
      }
      const missing = spec.itemFields.filter(
        (f) => item[f] === undefined || item[f] === null,
      );
      if (missing.length > 0) {
        return {
          ok: false,
          error: `${where}, ${spec.listField}[${j}] is missing ${missing.map((m) => `"${m}"`).join(", ")} — it has ${Object.keys(item).map((k) => `"${k}"`).join(", ") || "no fields"}. Expected ${describeSectionKind(kind)}.`,
        };
      }
      if (kind === "status-cards" && !EDU_STATUSES.includes(item.status as never)) {
        return {
          ok: false,
          error: `${where}, cards[${j}] has status "${String(item.status)}". Allowed: ${EDU_STATUSES.join(", ")}.`,
        };
      }
    }
  }
  return { ok: true };
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
