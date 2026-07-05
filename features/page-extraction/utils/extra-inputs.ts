/**
 * features/page-extraction/utils/extra-inputs.ts
 *
 * Helpers for template extra inputs — template result rows, literal values,
 * and inline literal wiring on agent variables.
 */

import type { ExtraExtractionInput } from "@/features/page-extraction/types";

/** Legacy surface key prefix — migrated to agent-var name on save. */
export const LITERAL_WIRING_PREFIX = "__literal__:";

export function literalWiringKey(agentVar: string): string {
  return `${LITERAL_WIRING_PREFIX}${agentVar}`;
}

export function isLiteralWiringKey(key: string): boolean {
  return key.startsWith(LITERAL_WIRING_PREFIX);
}

export function agentVarFromLiteralWiringKey(key: string): string {
  return key.slice(LITERAL_WIRING_PREFIX.length);
}

/** Resolve a literal extra-input row to the agent variable it feeds. */
export function literalExtraAgentVar(
  entry: ExtraExtractionInput,
): string | null {
  if (!isLiteralExtraInput(entry)) return null;
  const name = entry.name.trim();
  if (!name) return null;
  if (isLiteralWiringKey(name)) return agentVarFromLiteralWiringKey(name);
  return name;
}

export function isTemplateExtraInput(
  entry: ExtraExtractionInput,
): entry is ExtraExtractionInput & { source_job_id: string } {
  return (
    typeof entry.source_job_id === "string" &&
    entry.source_job_id.trim() !== "" &&
    entry.value === undefined
  );
}

export function isLiteralExtraInput(
  entry: ExtraExtractionInput,
): entry is ExtraExtractionInput & { value: string | number } {
  return entry.value !== undefined && entry.value !== null;
}

/** Coerce a JSONB row from the DB into the typed union. */
export function normalizeExtraInput(raw: {
  name?: string;
  source_job_id?: string;
  source_run_id?: string | null;
  value?: string | number;
}): ExtraExtractionInput {
  const name = (raw.name ?? "").trim();
  if (
    raw.value !== undefined &&
    raw.value !== null &&
    !(raw.source_job_id && raw.source_job_id.trim())
  ) {
    return { name, value: raw.value };
  }
  return {
    name,
    source_job_id: raw.source_job_id ?? "",
    source_run_id: raw.source_run_id ?? null,
  };
}

export function normalizeExtraInputs(raw: unknown): ExtraExtractionInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) =>
    normalizeExtraInput(
      typeof row === "object" && row !== null
        ? (row as Record<string, unknown>)
        : {},
    ),
  );
}

export function literalValueForAgentVar(
  agentVar: string,
  extraInputs: ExtraExtractionInput[],
): string {
  const legacyKey = literalWiringKey(agentVar);
  const entry = extraInputs.find(
    (e) =>
      isLiteralExtraInput(e) && (e.name === agentVar || e.name === legacyKey),
  );
  if (!entry) return "";
  return String(entry.value);
}

/** True when this agent variable is wired to a fixed literal value. */
export function isAgentVarLiteralWiring(
  agentVar: string,
  mapping: Record<string, string>,
  extraInputs: ExtraExtractionInput[],
): boolean {
  const legacyKey = literalWiringKey(agentVar);
  const entry = extraInputs.find(
    (e) =>
      isLiteralExtraInput(e) && (e.name === agentVar || e.name === legacyKey),
  );
  if (!entry) return false;
  const surfaceKey = mapping[agentVar] ? agentVar : legacyKey;
  return mapping[surfaceKey] === agentVar || mapping[legacyKey] === agentVar;
}

/**
 * Canonical shape persisted to the DB:
 * - Inline literals use the agent variable name as `name` (not __literal__:)
 * - Legacy __literal__: rows are migrated
 * - Empty literal values are dropped
 */
export function sanitizeExtraInputsForSave(
  extraInputs: ExtraExtractionInput[],
  mapping: Record<string, string>,
): ExtraExtractionInput[] {
  const out: ExtraExtractionInput[] = [];

  for (const entry of extraInputs) {
    if (isLiteralExtraInput(entry)) {
      const agentVar = literalExtraAgentVar(entry);
      if (!agentVar) continue;
      const value = String(entry.value ?? "").trim();
      if (value === "") continue;
      out.push({ name: agentVar, value: entry.value });
      continue;
    }
    if (isTemplateExtraInput(entry)) {
      const name = entry.name.trim();
      const source_job_id = entry.source_job_id.trim();
      if (!name || !source_job_id) continue;
      out.push({
        name,
        source_job_id,
        ...(entry.source_run_id ? { source_run_id: entry.source_run_id } : {}),
      });
    }
  }

  // Ensure every persisted inline literal has `{ [agentVar]: agentVar }` mapping.
  for (const entry of out) {
    if (!isLiteralExtraInput(entry)) continue;
    const agentVar = entry.name;
    if (mapping[agentVar] !== agentVar) {
      // Caller merges mapping separately — see buildMappingWithLiterals.
    }
  }

  return out;
}

/** Merge literal wiring keys into variable_mapping for save/run. */
export function buildMappingWithLiterals(
  mapping: Record<string, string>,
  extraInputs: ExtraExtractionInput[],
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(mapping)) {
    if (!isLiteralWiringKey(k)) next[k] = v;
  }
  for (const entry of extraInputs) {
    if (!isLiteralExtraInput(entry)) continue;
    const agentVar = literalExtraAgentVar(entry);
    if (!agentVar) continue;
    if (String(entry.value ?? "").trim() === "") continue;
    next[agentVar] = agentVar;
  }
  return next;
}

export function partitionExtraInputs(
  extraInputs: ExtraExtractionInput[],
  mapping: Record<string, string>,
): {
  inlineLiterals: ExtraExtractionInput[];
  manual: ExtraExtractionInput[];
} {
  const inlineLiterals: ExtraExtractionInput[] = [];
  const manual: ExtraExtractionInput[] = [];
  for (const entry of extraInputs) {
    if (isLiteralWiringKey(entry.name)) continue;
    const agentVar = literalExtraAgentVar(entry);
    if (
      agentVar &&
      isLiteralExtraInput(entry) &&
      mapping[agentVar] === agentVar
    ) {
      inlineLiterals.push(entry);
      continue;
    }
    manual.push(entry);
  }
  return { inlineLiterals, manual };
}

export function extraInputsEqual(
  a: ExtraExtractionInput[],
  b: ExtraExtractionInput[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    if (isLiteralExtraInput(a[i]) && isLiteralExtraInput(b[i])) {
      if (a[i].value !== b[i].value) return false;
      continue;
    }
    if (isTemplateExtraInput(a[i]) && isTemplateExtraInput(b[i])) {
      if (a[i].source_job_id !== b[i].source_job_id) return false;
      if ((a[i].source_run_id ?? null) !== (b[i].source_run_id ?? null))
        return false;
      continue;
    }
    return false;
  }
  return true;
}
