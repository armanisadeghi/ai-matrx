/**
 * Answer TEXT → the readable markdown a person meant, for DISPLAY and EXPORT
 * destinations only (a note, a task, a file, a print, a clipboard copy, the
 * speaker, a plain-text slot). Rule (Arman, 2026-09-30): a kind is never shown
 * as raw JSON — every `{"__kind":…}` region in the text (bare, or the whole
 * body of a ```json / unlabelled fence) becomes that kind's markdown through
 * the ONE kind → markdown converter (`kindValueToMarkdown`: the registry's
 * `toMarkdown` facet, else `genericKindMarkdown`).
 *
 * 🚨 Never call this on data that is STORED or PASSED to a machine: `__kind`
 * is part of the data. This is a destination transform, the same as
 * `unwrapKindEnvelopes`. Kindless text returns byte for byte.
 *
 * Regions come from the one embedded-kind region finder
 * (`findEmbeddedKindJsonRegions`); the signal is the one detector
 * (`hasKindKey`). Nobody writes a second one.
 */

import { kindValueToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";
import { findEmbeddedKindJsonRegions } from "./embedded-kind-json";
import { hasKindKey } from "./json-kind-signal";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKindObject(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.__kind === "string" &&
    value.__kind.trim().length > 0
  );
}

/**
 * A JSON text whose value is a kind (or a list of kinds) → markdown; null when
 * the text is not exactly that.
 */
function jsonKindValueMarkdown(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (isKindObject(parsed)) return kindValueToMarkdown(parsed);
  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isKindObject)) {
    return parsed.map((item) => kindValueToMarkdown(item)).join("\n\n");
  }
  return null;
}

/** A fence whose language is json-ish or absent, holding ONLY a kind value. */
const KIND_FENCE =
  /(^|\n)([ \t]*)(`{3,}|~{3,})[ \t]*(json5?|jsonc|JSON5?|JSONC|Json)?[ \t]*\n([\s\S]*?)\n[ \t]*\3[ \t]*(?=\n|$)/g;

export function kindTextToMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  if (!hasKindKey(text)) return text;

  // 1. The whole text is a kind value (a structured answer's stored JSON).
  const whole = jsonKindValueMarkdown(text);
  if (whole !== null) return whole;

  // 2. Fences whose entire body is a kind value.
  let out = text.replace(
    KIND_FENCE,
    (match, lead: string, _indent: string, _fence: string, _lang: string, body: string) => {
      const md = jsonKindValueMarkdown(body);
      return md === null ? match : `${lead}${md}`;
    },
  );

  // 3. Bare kind objects in prose (code fences and spans stay examples).
  if (!hasKindKey(out)) return out;
  const regions = findEmbeddedKindJsonRegions(out, {
    excludeLiteralContexts: true,
  });
  for (let i = regions.length - 1; i >= 0; i--) {
    const region = regions[i];
    const md = jsonKindValueMarkdown(region.content);
    if (md === null) continue;
    out = out.slice(0, region.start) + md + out.slice(region.end);
  }
  return out;
}
