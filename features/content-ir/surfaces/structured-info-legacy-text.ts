/**
 * `structured_info_legacy_text` — the named parser strategy behind the
 * ```structured_info fence surface (kind_surface: fence_lang/structured_info
 * → structured_info).
 *
 * The legacy renderable has NO standalone parser module: the fence body is
 * markdown that StructuredPlanBlock hands straight to BasicMarkdownContent,
 * and the only structure the component itself reads is its stat counters
 * (components/mardown-display/blocks/plan/StructuredPlanViewer.tsx):
 * sections = `**bold**` runs; bullet points = asterisk-led lines (`^\s*\*`).
 * This strategy converges a completed fence body onto the canonical
 * structured_info value using EXACTLY that grammar (plus the `- ` bullet
 * alias and the "Label: value" bullet convention the fence skill teaches) —
 * it names the structure the counters already imply, never a new grammar.
 *
 * Convergence honesty: a body with NO whole-line bold heading carries no
 * recognizable structure — the strategy returns null and the caller leaves
 * legacy rendering untouched (raw markdown renders fine; nothing is
 * fabricated). Everything that isn't a heading or a bullet rides VERBATIM in
 * `description` / section `body`, so the value stays zero-loss for the
 * markdown projection on the way back out.
 *
 * Title: the structured_info schema REQUIRES `title`. The fence grammar's
 * convention (see the live `structured-info-blocks` skill) is a leading bold
 * line; when the body opens with one, it is the title — otherwise the
 * component's own fixed header label "Structured Information" fills it (the
 * same default `structuredInfoMarkdownFromValue` uses), so the converged
 * value is schema-valid, not just bridge-tolerated.
 */

import { KIND_KEY } from "../core/kind-schema.types";
import { STRUCTURED_INFO_DEFAULT_TITLE } from "../kinds/structured-info";

export const STRUCTURED_INFO_LEGACY_TEXT_STRATEGY =
  "structured_info_legacy_text";

/** Whole-line bold run — the component's "section" unit, line-anchored. */
const HEADING_RE = /^\s*\*\*([^*]+)\*\*[:\s]*$/;

/** Bullet line — the component counts `*`; `- ` is the markdown alias. */
const BULLET_RE = /^\s*[*-]\s+(.*)$/;

/** Bold-labelled bullet: `**Backend:** Priya` / `**Backend**: Priya`. */
const BOLD_LABEL_RE = /^\*\*([^*]+?):?\*\*:?\s+(.+)$/;

/**
 * Plain key-value bullet: `Backend: Priya`. Conservative — one short label
 * with no markdown/table/colon characters, so prose colons don't split.
 */
const PLAIN_LABEL_RE = /^([^:`*_|[\]]{1,60}?):\s+(.+)$/;

/** Fence framing (accumulator region text may include the literal fence). */
const OPENING_FENCE_RE = /^\s*```[ \t]*structured_info[^\n]*\n/i;
const CLOSING_FENCE_RE = /\n?```\s*$/;

interface MutableSection {
  heading: string;
  bodyLines: string[];
  items: Array<Record<string, unknown>>;
}

function itemFromBulletText(text: string): Record<string, unknown> {
  const bold = BOLD_LABEL_RE.exec(text);
  if (bold) {
    return {
      [KIND_KEY]: "structured_info_item",
      label: bold[1].trim(),
      text: bold[2].trim(),
    };
  }
  const plain = PLAIN_LABEL_RE.exec(text);
  if (plain && !plain[2].includes(": ")) {
    return {
      [KIND_KEY]: "structured_info_item",
      label: plain[1].trim(),
      text: plain[2].trim(),
    };
  }
  return { [KIND_KEY]: "structured_info_item", text: text.trim() };
}

function finishSection(
  section: MutableSection | null,
  sections: Array<Record<string, unknown>>,
): void {
  if (!section) return;
  const out: Record<string, unknown> = {
    [KIND_KEY]: "structured_info_section",
    heading: section.heading,
  };
  const body = section.bodyLines.join("\n").trim();
  if (body !== "") out.body = body;
  if (section.items.length > 0) out.items = section.items;
  sections.push(out);
}

/**
 * Completed ```structured_info fence body → canonical structured_info value,
 * or null when the body carries no recognizable structure (the caller treats
 * null as parse failure: loud, legacy rendering untouched).
 *
 * Accepts BOTH host framings — region text with the literal fence lines and
 * inner-only body. This strategy only runs for COMPLETED regions (the hosts
 * gate on fence close), so no completion sentinel is needed.
 */
export function structuredInfoLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  const inner = regionText
    .replace(OPENING_FENCE_RE, "")
    .replace(CLOSING_FENCE_RE, "");
  if (inner.trim() === "") return null;

  const lines = inner.split("\n");

  let title: string | null = null;
  const descriptionLines: string[] = [];
  const sections: Array<Record<string, unknown>> = [];
  let current: MutableSection | null = null;
  let sawContent = false;

  for (const line of lines) {
    if (line.trim() === "") {
      if (current) current.bodyLines.push("");
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const text = heading[1].trim();
      // A leading bold line (before any other content) is the document
      // title — the fence grammar's convention. Later bold lines open
      // sections.
      if (title === null && !sawContent && current === null) {
        title = text;
      } else {
        finishSection(current, sections);
        current = { heading: text, bodyLines: [], items: [] };
      }
      sawContent = true;
      continue;
    }

    sawContent = true;
    const bullet = BULLET_RE.exec(line);
    if (bullet && current) {
      current.items.push(itemFromBulletText(bullet[1]));
      continue;
    }

    // Paragraphs (and pre-section bullets) ride verbatim — zero loss.
    if (current) current.bodyLines.push(line);
    else descriptionLines.push(line);
  }
  finishSection(current, sections);

  // No whole-line bold heading anywhere → no recognizable structure. Decline;
  // the legacy fence path renders the raw markdown exactly as today.
  if (title === null && sections.length === 0) return null;

  const value: Record<string, unknown> = {
    [KIND_KEY]: "structured_info",
    title: title ?? STRUCTURED_INFO_DEFAULT_TITLE,
    sections,
  };
  const description = descriptionLines.join("\n").trim();
  if (description !== "") value.description = description;

  return value;
}
