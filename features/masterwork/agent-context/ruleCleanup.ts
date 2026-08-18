import type { RulebookDraftSnapshot } from "./rulebookSurfaceScope";

export const MASTERWORK_RULE_CLEANUP_MANDATE = "masterwork.rule_cleanup";

export interface RuleCleanupResult {
  name: string;
  statement: string;
  rationale: string;
  detection: string;
  quote: string;
  severity: RulebookDraftSnapshot["severity"];
  section: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(
  value: Record<string, unknown>,
  key: keyof RuleCleanupResult,
): string {
  const field = value[key];
  if (typeof field !== "string") {
    throw new Error(`AI cleanup returned an invalid ${key} field.`);
  }
  return field;
}

/**
 * Validate the structured result and mechanically protect the fields that are
 * evidence or Expert classifications. The Agent is instructed to preserve
 * them; this gate makes that promise enforceable even after a future rebind.
 */
export function coerceRuleCleanupResult(
  value: unknown,
  current: RulebookDraftSnapshot,
): RuleCleanupResult {
  if (!isRecord(value)) {
    throw new Error("AI cleanup did not return a rule.");
  }

  const severity = requireString(value, "severity");
  if (
    severity !== "critical" &&
    severity !== "major" &&
    severity !== "minor"
  ) {
    throw new Error("AI cleanup returned an invalid severity field.");
  }

  const result: RuleCleanupResult = {
    name: requireString(value, "name"),
    statement: requireString(value, "statement"),
    rationale: requireString(value, "rationale"),
    detection: requireString(value, "detection"),
    quote: requireString(value, "quote"),
    severity,
    section: requireString(value, "section"),
  };

  if (!result.name.trim() || !result.statement.trim()) {
    throw new Error("AI cleanup removed the rule name or rule statement.");
  }
  if (result.quote !== current.quote) {
    throw new Error("AI cleanup tried to change the verbatim source quote.");
  }
  if (result.severity !== current.severity) {
    throw new Error("AI cleanup tried to change the Expert's severity.");
  }
  if (result.section !== current.section) {
    throw new Error("AI cleanup tried to move the rule to another section.");
  }

  return result;
}

export function applyRuleCleanup(
  current: RulebookDraftSnapshot,
  result: RuleCleanupResult,
): RulebookDraftSnapshot {
  return {
    ...current,
    name: result.name,
    statement: result.statement,
    rationale: result.rationale,
    detection: result.detection,
    quote: result.quote,
    severity: result.severity,
    section: result.section,
  };
}

export function readRuleEditorDraft(
  value: unknown,
  expected: {
    rulebookVersion: number;
    mode: RulebookDraftSnapshot["mode"];
    ruleId: string | null;
  },
): {
  fields: RulebookDraftSnapshot;
  beforeCleanup: RulebookDraftSnapshot | null;
} | null {
  if (!isRecord(value) || value.baseVersion !== expected.rulebookVersion) {
    return null;
  }

  const readSnapshot = (candidate: unknown): RulebookDraftSnapshot | null => {
    if (!isRecord(candidate)) return null;
    const mode = candidate.mode;
    const ruleId = candidate.rule_id;
    const severity = candidate.severity;
    if (
      (mode !== "new" && mode !== "edit") ||
      mode !== expected.mode ||
      (ruleId !== null && typeof ruleId !== "string") ||
      ruleId !== expected.ruleId ||
      typeof candidate.name !== "string" ||
      typeof candidate.statement !== "string" ||
      typeof candidate.rationale !== "string" ||
      typeof candidate.detection !== "string" ||
      typeof candidate.quote !== "string" ||
      (severity !== "critical" && severity !== "major" && severity !== "minor") ||
      typeof candidate.section !== "string"
    ) {
      return null;
    }
    return {
      mode,
      rule_id: ruleId,
      name: candidate.name,
      statement: candidate.statement,
      rationale: candidate.rationale,
      detection: candidate.detection,
      quote: candidate.quote,
      severity,
      section: candidate.section,
    };
  };

  const fields = readSnapshot(value.fields);
  if (!fields) return null;
  return {
    fields,
    beforeCleanup: readSnapshot(value.beforeCleanup),
  };
}
