/**
 * `questionnaire_legacy_text` — the named parser strategy behind BOTH
 * questionnaire surfaces (kind_surface: xml_tag/questionnaire AND
 * fence_lang/questionnaire → questionnaire). `questionnaire` is one of the
 * few block types the platform detects in two framings today
 * (SIMPLE_XML_TAGS in stream-block-accumulator.ts and SPECIAL_CODE_LANGUAGES
 * in content-splitter-v2.ts); both carry the SAME body grammar and both route
 * to QuestionnaireArtifact, so one strategy serves both rows.
 *
 * WRAPS the one existing parser — `separatedMarkdownParser`, the exact code
 * QuestionnaireArtifact renders `<questionnaire>` bodies through today
 * (`resolveMarkdownPayload({ …, parse: separatedMarkdownParser })`). It NEVER
 * re-implements that grammar (`##` headings → sections, non-list text lines →
 * `section.intro` joined with a space, `-`/`*`/`1.` bullets → `section.items`).
 *
 * What it DOES do is decode the component's own semantic layer, because the
 * parser's output is only half the story: question type, slider range, and the
 * question description live as DIRECTIVES inside `section.intro`, and the
 * component decodes them with `extractType` / `getQuestionType` /
 * `extractSliderRange`. Those functions are not exported from the renderer, so
 * their single canonical implementation lives in `kinds/questionnaire.ts` and
 * is imported here — the encode (bridge) and decode (this strategy) legs share
 * one map, one pattern list, one range regex.
 *
 * Faithful to the component's COMPLETE reading of a parsed body:
 * - a section is a question iff its `intro` contains `Type:`; the
 *   `Introduction` and `Options:` sections are structure, never questions
 *   (the renderer's own skip guard).
 * - options come from the section's own `items` (new format) or, failing that,
 *   from an immediately-following `Options:` section (old format) —
 *   `findOptionsForQuestion`, reproduced exactly.
 * - the question `description` is the intro text BEFORE the first `Type:`
 *   directive (the component shows exactly this text, plus the directive tail
 *   it cannot strip — the bridge re-encodes it identically).
 * - the header (`title` / `description`) follows `extractQuestionnaireHeader`:
 *   an `Introduction` first section's intro wins as the description, and the
 *   title falls back to a "Questionnaire"/"Planning"-bearing section title
 *   among the first three.
 * - `Other` options are NOT stripped here: `normalizeOptions` filters
 *   model-supplied "Other" and appends its own for CHECKBOX/DROPDOWN at render
 *   time, so carrying them verbatim is both lossless and render-identical.
 *
 * Accepts BOTH host framings — the accumulator's region text includes the
 * literal tags (attribute-tolerant strip here), the splitter's and the fence
 * hook's are inner-only. Returns null when the body yields no question (the
 * component's "nothing renders" state) — the caller treats null as parse
 * failure: loud, legacy rendering untouched.
 */

import { separatedMarkdownParser } from "@/components/mardown-display/markdown-classification/processors/custom/parser-separated";
import type {
  ListItem,
  Section,
} from "@/components/mardown-display/markdown-classification/processors/custom/parser-separated";
import { KIND_KEY } from "../core/kind-schema.types";
import {
  INTRO_SECTION_TITLE,
  OPTIONS_SECTION_TITLE,
  TYPE_DIRECTIVE,
  questionTypeFromTypeString,
  questionTypeStringFromIntro,
  sliderRangeFromIntro,
} from "../kinds/questionnaire";

/** Opening tag with optional attributes, e.g. `<questionnaire>` — host framing. */
const OPENING_TAG_RE = /^\s*<questionnaire(?:\s[^>]*)?>/i;
const CLOSING_TAG = "</questionnaire>";

/** `findOptionsForQuestion` — the section's own items, else a trailing `Options:`. */
function optionsForSection(sections: Section[], index: number): ListItem[] {
  const current = sections[index];
  if (current.items && current.items.length > 0) return current.items;

  const next = sections[index + 1];
  if (next?.title === OPTIONS_SECTION_TITLE) return next.items ?? [];

  return [];
}

/**
 * The intro text before the first `Type:` directive. The component renders the
 * WHOLE intro as the CardDescription whenever it does not start with `Type:`,
 * so this is the only part an author actually wrote.
 */
function descriptionFromIntro(intro: string): string | undefined {
  const index = intro.indexOf(TYPE_DIRECTIVE);
  if (index <= 0) return undefined;
  const description = intro.slice(0, index).trim();
  return description === "" ? undefined : description;
}

/** `extractQuestionnaireHeader`, reproduced over the parser's own output. */
function headerFromParsed(
  intro: string,
  sections: Section[],
): { title?: string; description?: string } {
  let title = "";
  let description = "";

  if (intro) {
    for (const line of intro.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      if (trimmed.startsWith("# ")) {
        title = trimmed.replace(/^#\s+/, "");
      } else if (!trimmed.startsWith("##") && !/^Introduction$/i.test(trimmed)) {
        description += (description ? " " : "") + trimmed;
      }
    }
  }

  const first = sections[0];
  if (first?.title === INTRO_SECTION_TITLE && first.intro) {
    description = first.intro;
  }

  if (!title) {
    for (const section of sections.slice(0, 3)) {
      if (
        section.title.includes("Questionnaire") ||
        section.title.includes("Planning")
      ) {
        title = section.title.replace(/^#+\s*/, "");
        break;
      }
    }
  }

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  };
}

/**
 * Completed `<questionnaire>` / ```questionnaire region text → canonical
 * questionnaire value, or null when the body declares no question (the caller
 * falls back to legacy rendering, loudly).
 */
export function questionnaireLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  let inner = regionText.replace(OPENING_TAG_RE, "");
  const closeIdx = inner.toLowerCase().indexOf(CLOSING_TAG);
  if (closeIdx !== -1) inner = inner.slice(0, closeIdx);

  const parsed = separatedMarkdownParser(inner);

  const questions: Record<string, unknown>[] = [];
  parsed.sections.forEach((section, index) => {
    // The renderer's exact skip guard.
    if (section.title === INTRO_SECTION_TITLE) return;
    if (section.title === OPTIONS_SECTION_TITLE) return;
    if (!section.intro?.includes(TYPE_DIRECTIVE)) return;

    const type = questionTypeFromTypeString(
      questionTypeStringFromIntro(section.intro),
    );
    const description = descriptionFromIntro(section.intro);
    const options = optionsForSection(parsed.sections, index);

    const question: Record<string, unknown> = {
      [KIND_KEY]: "questionnaire_question",
      question: section.title,
      type,
      // Include the key only when real, so the canonical value (and its
      // fingerprint) is identical to what a __kind JSON arrival would carry.
      ...(description ? { description } : {}),
    };

    if (options.length > 0) {
      question.options = options.map((option) => ({
        [KIND_KEY]: "questionnaire_option",
        name: option.name,
      }));
    }

    if (type === "slider") {
      // Null only when the body wrote the directive in a spelling the
      // component's literal "Type: Slider" check misses — it then falls back
      // to 0-100 at render, exactly as an omitted min/max does here.
      const range = sliderRangeFromIntro(section.intro);
      if (range) {
        question.min = range.min;
        question.max = range.max;
      }
    }

    questions.push(question);
  });

  if (questions.length === 0) return null;

  return {
    [KIND_KEY]: "questionnaire",
    ...headerFromParsed(parsed.intro, parsed.sections),
    questions,
  };
}
