/**
 * Answer TEXT → ONE readable line, for a person's compact label (a card
 * subtitle, a rule name, a link-preview description, a list row). A kind is
 * never shown as raw JSON (Arman, 2026-09-30): a kind answer reads as
 * "<Kind> · <instance title>" (`deriveInstanceTitle`, the derivation saved
 * instances use); prose with a kind in it reads as the prose's first line;
 * a kind that never completed reads as its one-line broken note.
 * Kindless text is whitespace-collapsed and clipped, nothing else.
 *
 * Destination transform only — never call it on stored or machine-bound text.
 */

import { humanizeKind } from "../kinds/kind-markdown-utils";
import { deriveInstanceTitle } from "../instance-title";
import { hasKindKey } from "./json-kind-signal";
import { kindTextToMarkdown } from "./kind-text-to-markdown";

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}

function wholeKindLabel(text: string): string | null {
  let body = text.trim();
  const fence = body.match(/^(?:`{3,}|~{3,})[a-zA-Z0-9]*\s*\n([\s\S]*?)\n?(?:`{3,}|~{3,})$/);
  if (fence) body = fence[1]!.trim();
  if (!body.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.__kind !== "string" || !record.__kind.trim()) return null;
    const name = humanizeKind(record.__kind.trim());
    const title = deriveInstanceTitle(record);
    return title ? `${name} · ${title}` : name;
  } catch {
    return null;
  }
}

function firstReadableLine(markdown: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw
      .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, "")
      .replace(/[*_`]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line) return line;
  }
  return "";
}

/** One line, at most `max` characters, never containing a `__kind` key. */
export function kindTextLabel(text: string | null | undefined, max = 90): string {
  if (!text) return "";
  if (!hasKindKey(text)) return clip(text.replace(/\s+/g, " ").trim(), max);
  const whole = wholeKindLabel(text);
  if (whole) return clip(whole, max);
  return clip(firstReadableLine(kindTextToMarkdown(text)), max);
}
