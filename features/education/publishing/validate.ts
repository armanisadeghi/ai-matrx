// features/education/publishing/validate.ts
//
// Runtime validation for authored `sections` JSON before it reaches the DB.
// The editor accepts raw JSON (so agent-drafted content pastes cleanly), so we
// guard the EduSection[] shape here rather than trusting the string. Returns a
// parsed value or a human-readable error — never throws.

import type { EduSection } from "../types";

const KINDS = new Set([
  "prose",
  "feature-grid",
  "steps",
  "status-cards",
  "stat-bar",
  "faq",
  "cta",
]);

export interface SectionsParseResult {
  ok: boolean;
  sections?: EduSection[];
  error?: string;
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
  if (!Array.isArray(value)) {
    return { ok: false, error: "Sections must be a JSON array." };
  }
  for (let i = 0; i < value.length; i++) {
    const s = value[i] as { kind?: unknown };
    if (!s || typeof s !== "object") {
      return { ok: false, error: `Section ${i + 1} is not an object.` };
    }
    if (typeof s.kind !== "string" || !KINDS.has(s.kind)) {
      return {
        ok: false,
        error: `Section ${i + 1} has an unknown kind "${String(s.kind)}". Allowed: ${[...KINDS].join(", ")}.`,
      };
    }
  }
  return { ok: true, sections: value as EduSection[] };
}

/** Parse the `related` cross-link JSON (tools/subjects/exams string arrays). */
export function parseRelatedJson(
  raw: string,
): { ok: boolean; related?: Record<string, string[]>; error?: string } {
  const text = raw.trim();
  if (!text) return { ok: true, related: {} };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Related must be a JSON object." };
  }
  return { ok: true, related: value as Record<string, string[]> };
}
