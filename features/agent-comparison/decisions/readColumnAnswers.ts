/**
 * Finding a `decision_answers` payload in a battle column's latest turn.
 *
 * A decision reaches the client one of two ways: as a typed part on the
 * message, or as `__kind` JSON inside the assistant's text (the shape
 * system's native arrival form). Both are read here so the comparison table
 * never depends on which route a given model took — a table that only
 * understood one of them would show one agent's answers and an empty column
 * for the other, which reads as "that agent said nothing."
 */

import { DECISION_ANSWERS_KIND } from "@ai-matrx/agents/presentation/decision-answers";
import {
  readDecisionAnswers,
  type DecisionAnswersView,
} from "@ai-matrx/agents/presentation/decision-answers";

const KIND_MARKER = `"${DECISION_ANSWERS_KIND}"`;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Every balanced `{...}` run in the text that mentions the kind marker.
 * One left-to-right pass with a string-aware depth counter, so a `{` inside
 * a criterion's prose never opens a phantom object.
 */
function candidateObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const slice = text.slice(start, i + 1);
        if (slice.includes(KIND_MARKER)) out.push(slice);
        start = -1;
      }
    }
  }
  return out;
}

function fromText(text: string): DecisionAnswersView | null {
  if (!text.includes(KIND_MARKER)) return null;
  for (const candidate of candidateObjects(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const asRecord = record(parsed);
      if (asRecord?.__kind !== DECISION_ANSWERS_KIND) continue;
      const view = readDecisionAnswers(asRecord);
      if (view) return view;
    } catch {
      // A candidate that does not parse is not an answer payload. The next
      // one might be; a throw here would blank the whole column.
    }
  }
  return null;
}

/** The decision answers in one message's content, or null. */
export function readAnswersFromContent(
  content: unknown,
): DecisionAnswersView | null {
  const parts = Array.isArray(content) ? content : [];
  for (const part of parts) {
    const asRecord = record(part);
    if (!asRecord) continue;
    if (asRecord.__kind === DECISION_ANSWERS_KIND) {
      const view = readDecisionAnswers(asRecord);
      if (view) return view;
      continue;
    }
    const text = asRecord.text;
    if (typeof text === "string") {
      const view = fromText(text);
      if (view) return view;
    }
  }
  if (typeof content === "string") return fromText(content);
  return null;
}
