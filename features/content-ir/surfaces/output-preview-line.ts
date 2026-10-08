/**
 * THE ONE-LINE PREVIEW of a stored output — what a table cell, a list row or a
 * caption shows for a run's / tool's / message's output text. Human words only,
 * never JSON:
 *
 *   - a kind (`{"__kind":"agent_definition","name":"Supplier Invoice Checker",…}`)
 *     → "Agent definition: Supplier Invoice Checker" (the kind's name alone when
 *     it carries no title);
 *   - a directive batch (`directive_v1_action_create_agent_definition` with
 *     `items`) reads as its first item, else as the action ("Create agent definition");
 *   - kindless JSON → its title/name field, else "Structured output";
 *   - text → its first non-empty line.
 *
 * Previews are usually CUT (the run history keeps 300 characters), so a kind is
 * read from the text by pattern when it does not parse — a cut kind still names
 * itself. Display transform only; never call it on stored text.
 */

import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

const KIND_AT = /"__kind"\s*:\s*"([A-Za-z0-9_.-]+)"/g;
const TITLE_AT = /"(title|name|label|heading|subject)"\s*:\s*"((?:[^"\\]|\\.){1,200})"/;
const DIRECTIVE = /^directive_v\d+_(?:action_)?(.+)$/;
const STRUCTURED = "Structured output";

/** `agent_definition` → "Agent definition" (sentence case; acronyms kept). */
export function kindWords(slug: string): string {
  const words = (humanizeIdentifier(slug) || slug).split(/\s+/);
  return words
    .map((word, index) => (index === 0 || /^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase()))
    .join(" ");
}

function unescapeJsonString(text: string): string {
  try {
    return JSON.parse(`"${text}"`) as string;
  } catch {
    return text.replace(/\\"/g, '"');
  }
}

function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function titleOf(value: Record<string, unknown>): string | null {
  for (const key of ["title", "name", "label", "heading", "subject"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return firstLine(candidate);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinKind(kind: string, title: string | null): string {
  return title ? `${kindWords(kind)}: ${title}` : kindWords(kind);
}

/** A parsed value → its line. */
function valueLine(value: unknown): string {
  if (Array.isArray(value)) {
    const first = value.find(isRecord);
    return first ? valueLine(first) : STRUCTURED;
  }
  if (!isRecord(value)) return typeof value === "string" ? firstLine(value) || STRUCTURED : STRUCTURED;
  const kind = typeof value.__kind === "string" ? value.__kind : null;
  if (kind) {
    const directive = DIRECTIVE.exec(kind);
    if (directive) {
      const items = Array.isArray(value.items) ? value.items : [];
      const first = items.find(isRecord);
      if (first) return valueLine(first);
      return kindWords(directive[1]!);
    }
    return joinKind(kind, titleOf(value));
  }
  return titleOf(value) ?? STRUCTURED;
}

/** Cut JSON (does not parse) → its line, read by pattern. */
function cutJsonLine(text: string): string {
  const kinds = [...text.matchAll(KIND_AT)];
  // A directive batch reads as its first item's kind; a lone directive as its action.
  const item = kinds.find((match) => !DIRECTIVE.test(match[1]!));
  if (item) {
    const title = TITLE_AT.exec(text.slice(item.index! + item[0].length));
    return joinKind(item[1]!, title ? firstLine(unescapeJsonString(title[2]!)) : null);
  }
  const directive = kinds[0] ? DIRECTIVE.exec(kinds[0][1]!) : null;
  if (directive) return kindWords(directive[1]!);
  const title = TITLE_AT.exec(text);
  return title ? firstLine(unescapeJsonString(title[2]!)) : STRUCTURED;
}

export function outputPreviewLine(text: string | null | undefined): string {
  if (!text) return "";
  // A fenced answer (```json … ```) reads as what is inside the fence.
  const trimmed = text.trim().replace(/^```[^\n]*(?:\n|$)/, "").replace(/\n?```\s*$/, "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return valueLine(JSON.parse(trimmed));
    } catch {
      return cutJsonLine(trimmed);
    }
  }
  // Prose that carries a kind somewhere (a fenced block, an inline object).
  if (KIND_AT.test(trimmed)) {
    KIND_AT.lastIndex = 0;
    const before = firstLine(trimmed.slice(0, trimmed.search(/[{[]\s*"__kind"/)));
    return before || cutJsonLine(trimmed);
  }
  return firstLine(trimmed);
}
