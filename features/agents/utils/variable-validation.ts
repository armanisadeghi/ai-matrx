/**
 * Pure validator for a single variable definition.
 * Returns an array of issues (possibly empty). No side effects.
 */

import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { getComponentTypeMeta } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import { sanitizeVariableName } from "./variable-utils";
import { readOptions, readMin, readMax } from "./variable-customcomponent";

export type VariableValidationIssue =
  | { field: "name"; code: "empty" | "invalid" | "duplicate" }
  | { field: "options"; code: "empty" | "duplicate" }
  | { field: "range"; code: "min-gte-max" }
  | { field: "youtube"; code: "invalid-url" };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_URL =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/**
 * Validate a variable against invariants:
 *   • name must sanitize to non-empty and be unique among otherNames
 *   • option-requiring types must have at least one (deduped) option
 *   • slider / number with min >= max is invalid
 *
 * `otherNames` are the names of *other* variables (excluding this one), used
 * only for duplicate detection.
 */
export function validateVariable(
  v: VariableDefinition,
  otherNames: string[],
): VariableValidationIssue[] {
  const issues: VariableValidationIssue[] = [];

  // ── Name ──────────────────────────────────────────────────────────────────
  const sanitized = v.name.trim() ? sanitizeVariableName(v.name) : "";
  if (!sanitized) {
    issues.push({ field: "name", code: "empty" });
  } else if (sanitized !== v.name) {
    issues.push({ field: "name", code: "invalid" });
  }
  if (sanitized && otherNames.includes(sanitized)) {
    issues.push({ field: "name", code: "duplicate" });
  }

  // ── Options ───────────────────────────────────────────────────────────────
  const cc = v.customComponent;
  if (cc) {
    const meta = getComponentTypeMeta(cc.type);
    if (meta.requiresOptions) {
      const opts = readOptions(cc);
      if (opts.length === 0) {
        issues.push({ field: "options", code: "empty" });
      }
      const seen = new Set<string>();
      let dupFound = false;
      for (const o of opts) {
        if (seen.has(o)) {
          dupFound = true;
          break;
        }
        seen.add(o);
      }
      if (dupFound) issues.push({ field: "options", code: "duplicate" });
    }

    // ── Range ───────────────────────────────────────────────────────────────
    if (meta.requiresMinMax || cc.type === "number") {
      const min = readMin(cc);
      const max = readMax(cc);
      if (min !== undefined && max !== undefined && min >= max) {
        issues.push({ field: "range", code: "min-gte-max" });
      }
    }

    // ── YouTube — when a default value is set, it must look like a YT URL ──
    if (cc.type === "youtube") {
      const def = v.defaultValue;
      let candidate = "";
      if (typeof def === "string") candidate = def;
      else if (def && typeof def === "object") {
        const o = def as Record<string, unknown>;
        if (typeof o.url === "string") candidate = o.url;
      }
      if (
        candidate.trim() &&
        !YOUTUBE_ID.test(candidate.trim()) &&
        !YOUTUBE_URL.test(candidate.trim())
      ) {
        issues.push({ field: "youtube", code: "invalid-url" });
      }
    }
  }

  return issues;
}
