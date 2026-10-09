// components/mardown-display/blocks/json/structured-answer-text.ts
//
// What a person reads in an agent's structured JSON answer, as one pure
// projection — the SAME selection `StructuredAgentAnswerBlock` draws (prose,
// status, next step, string-list chips, small tables). The block renders from
// these helpers; Copy / Save / Send (contentForDestination) takes the text
// from `structuredAnswerMarkdown`, so a copied answer is what was on screen,
// never its `{"summary": …}` payload.

import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { isJsonObject } from "@/types/json";
import { valueCarriesKind } from "@/features/content-ir/surfaces/json-kind-signal";
import { kindTextLabel } from "@/features/content-ir/surfaces/kind-text-label";
import { kindOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { outputSchemaKeys } from "@ai-matrx/chat/mandates/output-contract";

export type StructuredValue = Record<string, unknown>;

const PROSE_KEYS = ["answer", "summary", "text", "message"] as const;
const NEXT_STEP_KEYS = ["next_step", "next_steps", "next_action"] as const;
const MIN_FALLBACK_PROSE_LENGTH = 40;

export function readableLabel(key: string): string {
  return humanizeIdentifier(key) || key;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function selectProse(value: StructuredValue): { key: string; text: string } | null {
  for (const key of PROSE_KEYS) {
    const text = nonEmptyString(value[key]);
    if (text) return { key, text };
  }
  for (const [key, candidate] of Object.entries(value)) {
    const text = nonEmptyString(candidate);
    if (text && text.length >= MIN_FALLBACK_PROSE_LENGTH) return { key, text };
  }
  return null;
}

export function selectStatus(value: StructuredValue): { key: string; text: string } | null {
  for (const key of ["state", "status"] as const) {
    const text = nonEmptyString(value[key]);
    if (text) return { key, text };
  }
  return null;
}

export function selectNextStep(value: StructuredValue): { key: string; text: string } | null {
  for (const key of NEXT_STEP_KEYS) {
    const candidate = value[key];
    const text = nonEmptyString(candidate);
    if (text) return { key, text };
    if (Array.isArray(candidate)) {
      const steps = candidate.map(nonEmptyString).filter((step): step is string => Boolean(step));
      if (steps.length) return { key, text: steps.join("\n") };
    }
  }
  return null;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string");
}

export function isSmallObjectArray(value: unknown): value is StructuredValue[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 12 && value.every((item) => isJsonObject(item));
}

export function isRenderableStructuredAgentAnswer(value: StructuredValue): boolean {
  return (
    Boolean(selectProse(value) || selectStatus(value) || selectNextStep(value)) ||
    Object.values(value).some((item) => isStringArray(item) || isSmallObjectArray(item))
  );
}

/**
 * A cell or chip value as a person reads it: a kind (object, or JSON text in
 * any spelling) is its one-line label, never its JSON.
 */
export function cellText(cell: unknown): string {
  if (valueCarriesKind(cell)) {
    return typeof cell === "string" ? kindTextLabel(cell) : kindOneLine(cell, { plain: true });
  }
  return typeof cell === "string" ? cell : JSON.stringify(cell ?? "");
}

/** The keys the block draws as chips or a table, in order, after prose / status / next step. */
export function listedEntries(value: StructuredValue): Array<[string, string[] | StructuredValue[]]> {
  const prose = selectProse(value);
  const status = selectStatus(value);
  const nextStep = selectNextStep(value);
  const out: Array<[string, string[] | StructuredValue[]]> = [];
  for (const [key, item] of Object.entries(value)) {
    if (key === KIND_KEY || key === prose?.key || key === status?.key || key === nextStep?.key) continue;
    if (isStringArray(item) || isSmallObjectArray(item)) out.push([key, item]);
  }
  return out;
}

export function tableColumns(rows: readonly StructuredValue[]): string[] {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 6);
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The answer as markdown, exactly the parts the block draws, in its order. */
export function structuredAnswerMarkdown(value: StructuredValue): string {
  const parts: string[] = [];
  const prose = selectProse(value);
  const status = selectStatus(value);
  const nextStep = selectNextStep(value);
  if (prose) parts.push(prose.text);
  if (status) parts.push(`**${readableLabel(status.text)}**`);
  if (nextStep) parts.push(`**Next step**\n\n${nextStep.text}`);
  for (const [key, item] of listedEntries(value)) {
    if (isStringArray(item)) {
      parts.push(`**${readableLabel(key)}**\n\n${item.map((entry) => `- ${cellText(entry)}`).join("\n")}`);
    } else {
      const columns = tableColumns(item);
      const head = `| ${columns.map((c) => cell(readableLabel(c))).join(" | ")} |`;
      const rule = `| ${columns.map(() => "---").join(" | ")} |`;
      const rows = item.map((row) => `| ${columns.map((c) => cell(cellText(row[c]))).join(" | ")} |`);
      parts.push(`**${readableLabel(key)}**\n\n${[head, rule, ...rows].join("\n")}`);
    }
  }
  return parts.join("\n\n");
}

/**
 * THE decision between the structured block and the JSON code block — the
 * renderer (`app-bindings` → `StructuredAgentAnswerBlock`) and copy both call
 * it, so the screen and the clipboard cannot disagree. The JSON-code floor may
 * only claim a settled object when the bound agent's output schema declares
 * every key; registered `__kind` payloads stay with the kind route.
 */
export function parseStructuredAgentAnswer(content: string, outputSchema: unknown): StructuredValue | null {
  const declaredKeys = outputSchemaKeys(outputSchema);
  if (declaredKeys.size === 0) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isJsonObject(parsed) || KIND_KEY in parsed) return null;
    return Object.keys(parsed).every((key) => declaredKeys.has(key)) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A whole answer as it is drawn, for a destination (Copy, Save, Send):
 *   • the structured block (schema-bound, renderable) → its readable markdown;
 *   • a bare JSON value the screen draws as a code block → that JSON, fenced
 *     (plain-text copy strips the fence and gives the raw JSON);
 *   • anything else (including `__kind`, which has its own converter) → unchanged.
 */
export function structuredAnswerTextOf(content: string, outputSchema: unknown = null): string {
  const trimmed = content.trim();
  const bare = (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!bare) return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return content;
  }
  if (isJsonObject(parsed) && KIND_KEY in parsed) return content;
  const structured = parseStructuredAgentAnswer(trimmed, outputSchema);
  if (structured && isRenderableStructuredAgentAnswer(structured)) return structuredAnswerMarkdown(structured) || content;
  return "```json\n" + trimmed + "\n```";
}
