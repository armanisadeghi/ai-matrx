/**
 * questionnaire kind → QuestionnaireRenderer bridge (+ compiled definitions).
 *
 * The successor to the `<questionnaire>` XML block and the ```questionnaire
 * fence. The kind family is derived from COMPONENT REALITY — the exact shape
 * QuestionnaireRenderer
 * (components/mardown-display/blocks/questionnaire/QuestionnaireRenderer.tsx)
 * consumes, via QuestionnaireArtifact's `serverData ?? data ?? parse(raw)`
 * resolution over `separatedMarkdownParser`:
 *
 *   { __kind:"questionnaire", title?, description?, questions: [
 *       { __kind:"questionnaire_question", question, type, description?,
 *         options?: [{ __kind:"questionnaire_option", name }],
 *         min?, max? } ] }
 *
 * THE ASYMMETRY THAT DEFINES THIS KIND: the component's own data shape is
 * `{ intro?: string, sections?: [{ title, intro?, items? }] }` — a TEXT
 * shape. Question type, slider range, and the question description are not
 * fields; they are DIRECTIVES encoded inside `section.intro` and decoded by
 * the component's regexes (`Type: X`, `Range: min - max`). So the canonical
 * kind is semantic and this bridge is the ONE place that re-encodes it into
 * the component's directive grammar. Every rule below is copied from the
 * component, never invented:
 *
 * - A section renders ONLY when `section.intro` contains the literal `Type:`
 *   (`sections.map` skip guard). Every emitted question therefore carries a
 *   `Type: <label>` directive.
 * - `Type:` labels are EXACTLY the seven tokens the live `form-questionnaire`
 *   content block already teaches (Input, Text, Radio, Checkbox, Dropdown,
 *   Slider, Toggle), so `encode(decode(wire))` is byte-identical to `wire`.
 *   Each resolves deterministically through the component's TYPE_PATTERNS
 *   (first-match order CHECKBOX, DROPDOWN, TOGGLE, RADIO, SLIDER, TEXT,
 *   INPUT); "Text" matches no pattern and lands on TEXT, the map's default —
 *   asserted, with a source-drift guard, in kind-questionnaire.test.ts.
 * - A question `description` is shown ONLY when `intro` does NOT start with
 *   "Type:" — and then the WHOLE intro (directives included) becomes the
 *   CardDescription. That leak is the component's existing behavior for text
 *   arrivals, so the bridge reproduces it byte-for-byte (description first,
 *   directives last) rather than inventing a cleaner shape the component
 *   cannot render. Omit `description` for a clean card.
 * - `Range: min - max` is read only when the intro contains the literal
 *   "Type: Slider" (`extractSliderRange`) and both bounds are whole numbers
 *   (`[-]?\d+`); otherwise the component defaults to 0-100. The bridge emits
 *   the directive only when both bounds are integers.
 * - Section titles double as the OPTIONS-LOOKUP KEY
 *   (`findOptionsForQuestion` → `sections.findIndex(s => s.title === t)`), so
 *   the bridge numbers them `Q{n}: ` exactly as `processQuestionTitle` does
 *   (preserving an authored `Q\d+:` prefix, stripping a `Question:` prefix).
 *   Duplicate titles collapse onto the FIRST section's options — the
 *   component's own failure mode, documented in the skill.
 * - "Other" is NOT authored: `normalizeOptions` strips any model-supplied
 *   "Other"/"other:*" option and appends a standardized one for CHECKBOX and
 *   DROPDOWN. Options ride through verbatim; the component normalizes.
 * - The header renders only when a description exists
 *   (`QuestionnaireHeader` returns null on empty description), so `title`
 *   alone is invisible — hence both root fields are optional and the skill
 *   tells agents to pair them.
 *
 * The component supports NO `required` flag, NO validation, and NO submit
 * button (answers persist continuously to `canvas_item_state` via
 * QuestionnaireArtifact and reach the agent as next-turn context). Those
 * fields are deliberately absent from the schema — a kind never promises what
 * its component cannot render.
 *
 * Complete-only (makeCompleteEnvelopeBridge): QuestionnaireRenderer seeds
 * per-question default answers from `data.sections` in an effect keyed on
 * `data`, so a partial payload would register half-built questions in the
 * form-state context. The type's loading visualization stands while streaming.
 */

import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

/**
 * The canonical question types — one per branch of QuestionnaireRenderer's
 * `QuestionComponent` switch (CHECKBOX / DROPDOWN / RADIO / TOGGLE / SLIDER /
 * TEXT / INPUT). Ordered as the live `form-questionnaire` content block
 * teaches them.
 */
export const QUESTIONNAIRE_QUESTION_TYPES = [
  "input",
  "text",
  "radio",
  "checkbox",
  "dropdown",
  "slider",
  "toggle",
] as const;

export type QuestionnaireQuestionType =
  (typeof QUESTIONNAIRE_QUESTION_TYPES)[number];

/**
 * canonical type → the `Type:` directive label the component's TYPE_PATTERNS
 * resolve. These are the tokens the live `form-questionnaire` content block
 * already teaches, so a decoded wire body re-encodes byte-identically.
 * "Slider" is load-bearing beyond pattern matching: `extractSliderRange` gates
 * on the LITERAL substring "Type: Slider".
 */
export const QUESTION_TYPE_LABEL: Record<QuestionnaireQuestionType, string> = {
  input: "Input",
  text: "Text",
  radio: "Radio",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
  slider: "Slider",
  toggle: "Toggle",
};

/**
 * The component's TYPE_PATTERNS, verbatim (QuestionnaireRenderer.tsx +
 * QuestionnaireContext.tsx declare the identical map twice). Iteration order
 * IS the resolution order — first match wins.
 */
const TYPE_PATTERNS: Array<[QuestionnaireQuestionType, RegExp[]]> = [
  ["checkbox", [/checkbox/i, /check.*box/i, /multiple.*choice/i]],
  ["dropdown", [/dropdown/i, /drop.*down/i, /select(?!\s+radio)/i]],
  ["toggle", [/toggle/i, /switch/i, /boolean/i]],
  ["radio", [/radio/i, /radio.*button/i]],
  ["slider", [/slider/i, /range/i, /scale/i]],
  ["text", [/text.*area/i, /long.*text/i, /paragraph/i]],
  ["input", [/input/i, /short.*text/i, /single.*line/i]],
];

/** The component's `extractType` — the first `Type:` run, up to a `)` or EOL. */
export function questionTypeStringFromIntro(intro: string): string {
  const match = intro.match(/Type:\s*([^)]+)(?:\s*\([^)]*\))?/);
  return match ? match[1].trim() : "";
}

/** The component's `getQuestionType` — first-pattern-wins, default TEXT. */
export function questionTypeFromTypeString(
  typeString: string,
): QuestionnaireQuestionType {
  for (const [type, patterns] of TYPE_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(typeString))) return type;
  }
  return "text";
}

/**
 * The component's `extractSliderRange` — gated on the LITERAL "Type: Slider"
 * substring, whole-number bounds only. Null means "the component will fall
 * back to 0-100".
 */
export function sliderRangeFromIntro(
  intro: string,
): { min: number; max: number } | null {
  if (!intro.includes("Type: Slider")) return null;
  const match = intro.match(
    /Range:\s*([-]?\d+)(?:\s*\([^)]*\))?\s*-\s*([-]?\d+)(?:\s*\([^)]*\))?/,
  );
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
  return { min: 0, max: 100 };
}

/** The component's skip-guard: a section renders only when it declares a type. */
export const TYPE_DIRECTIVE = "Type:";

/** Section titles the component treats as structure, never as questions. */
export const INTRO_SECTION_TITLE = "Introduction";
export const OPTIONS_SECTION_TITLE = "Options:";

// ---------------------------------------------------------------------------
// Schemas — the single source the storage rows (`data[]` + edges) and the
// emitted JSON Schemas are GENERATED from (kindSchemaToStorage /
// kindSchemaToJsonSchema), never hand-written twice.
// ---------------------------------------------------------------------------

export const questionnaireKindSchema: KindSchema = {
  kind: "questionnaire",
  fields: {
    // Both optional: the component's header renders only when a description
    // exists, and a text arrival carries neither by default.
    title: { type: "string" },
    description: { type: "string" },
    questions: {
      type: "array",
      itemKinds: ["questionnaire_question"],
      required: true,
    },
  },
};

export const questionnaireQuestionKindSchema: KindSchema = {
  kind: "questionnaire_question",
  fields: {
    question: { type: "string", required: true },
    type: { type: "enum", values: [...QUESTIONNAIRE_QUESTION_TYPES], required: true },
    description: { type: "string" },
    options: { type: "array", itemKinds: ["questionnaire_option"] },
    // Slider bounds. Whole numbers only — the component's Range regex reads
    // `[-]?\d+`, so a fractional bound silently degrades to the 0-100 default.
    min: { type: "number" },
    max: { type: "number" },
  },
};

export const questionnaireOptionKindSchema: KindSchema = {
  kind: "questionnaire_option",
  fields: {
    name: { type: "string", required: true },
  },
};

export const QUESTIONNAIRE_KIND_SCHEMAS: KindSchema[] = [
  questionnaireKindSchema,
  questionnaireQuestionKindSchema,
  questionnaireOptionKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — canonical value → the component's `{ intro, sections }`
// ---------------------------------------------------------------------------

const MAPPED_QUESTION_KEYS = new Set([
  "question",
  "type",
  "description",
  "options",
  "min",
  "max",
]);
const MAPPED_ROOT_KEYS = new Set(["title", "description", "questions"]);

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isQuestionType(value: unknown): value is QuestionnaireQuestionType {
  return (
    typeof value === "string" &&
    (QUESTIONNAIRE_QUESTION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Canonical `type` read. Exact enum first; anything else routes through the
 * component's OWN pattern matcher (so `"multiple choice"` or `"Drop-down"`
 * from a loose model still land on the right renderer) — never a silent TEXT.
 */
function readQuestionType(value: unknown): QuestionnaireQuestionType {
  if (isQuestionType(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    return questionTypeFromTypeString(value);
  }
  return "text";
}

/**
 * Options as the component reads them: `{ name }` records. A bare string
 * option (a very common loose-model emission) coerces rather than vanishing —
 * the component only ever reads `.name`.
 */
function readOptions(value: unknown): Array<{ name: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ name: string }> = [];
  for (const option of value) {
    if (typeof option === "string") {
      const name = nonEmptyString(option);
      if (name) out.push({ name });
      continue;
    }
    if (!isRecord(option)) continue;
    const name = nonEmptyString(option.name);
    if (name) out.push({ name });
  }
  return out;
}

/** `processQuestionTitle`, applied ahead of the component so titles are unique. */
function numberedTitle(question: string, index: number): string {
  if (/^Q(\d+):\s*/i.test(question)) return question;
  return `Q${index + 1}: ${question.replace(/^Question:\s*/i, "")}`;
}

/**
 * The `section.intro` directive line. Description FIRST (so the component's
 * `intro.startsWith("Type:")` check hides the directives when there is no
 * description), then `Type:`, then `Range:` for integral slider bounds.
 */
export function questionIntro(
  type: QuestionnaireQuestionType,
  description: string | null,
  min: unknown,
  max: unknown,
): string {
  const parts: string[] = [];
  if (description) parts.push(description);
  parts.push(`${TYPE_DIRECTIVE} ${QUESTION_TYPE_LABEL[type]}`);
  if (
    type === "slider" &&
    typeof min === "number" &&
    typeof max === "number" &&
    Number.isInteger(min) &&
    Number.isInteger(max)
  ) {
    parts.push(`Range: ${min} - ${max}`);
  }
  return parts.join(" ");
}

function mapQuestion(
  question: Record<string, unknown>,
  index: number,
): Record<string, unknown> | null {
  const text = nonEmptyString(question.question);
  // The component renders a Card per section and keys form state on the
  // title — a titleless question has nothing to render or key on.
  if (!text) return null;

  const type = readQuestionType(question.type);
  const description = nonEmptyString(question.description);

  const mapped: Record<string, unknown> = {
    title: numberedTitle(text, index),
    intro: questionIntro(type, description, question.min, question.max),
    items: readOptions(question.options),
  };

  // Zero data loss: schema-unknown extras ride along untouched (the component
  // reads only title/intro/items, so they are inert but never dropped).
  for (const [key, value] of Object.entries(question)) {
    if (MAPPED_QUESTION_KEYS.has(key) || key in mapped) continue;
    mapped[key] = value;
  }

  return mapped;
}

/**
 * The component's `extractQuestionnaireHeader` input: `# Title` on its own
 * line, description on the next. Emitted only when there is something to say
 * — an empty `intro` would make the header scan the first three sections for
 * a "Questionnaire"/"Planning" title (its documented fallback).
 */
function rootIntro(title: string | null, description: string | null): string {
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`);
  if (description) lines.push(description);
  return lines.join("\n");
}

export const questionnaireServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "questionnaire",
  (value) => {
    if (!Array.isArray(value.questions)) return undefined;

    const sections: Record<string, unknown>[] = [];
    for (const question of value.questions) {
      if (!isRecord(question)) continue;
      const mapped = mapQuestion(question, sections.length);
      if (mapped) sections.push(mapped);
    }
    // `QuestionnaireRenderer` guards on `data.sections`; a zero-question
    // payload would render "No questionnaire data available". Decline instead
    // — the raw-content parse path (and its loud handling) takes over.
    if (sections.length === 0) return undefined;

    const serverData: Record<string, unknown> = { sections };

    const intro = rootIntro(
      nonEmptyString(value.title),
      nonEmptyString(value.description),
    );
    if (intro) serverData.intro = intro;

    for (const [key, extra] of Object.entries(value)) {
      if (MAPPED_ROOT_KEYS.has(key) || key in serverData) continue;
      serverData[key] = extra;
    }

    return serverData;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — questionnaire → the block's own human-readable grammar.
//
// The export IS the wire format: `# Title`, a description paragraph, then one
// `## Q1: …` heading per question carrying its `Type:` (+ `Range:`) directive
// and a `-` bullet per option. Round-trips straight back through
// `questionnaire_legacy_text`. Unknown keys never silently vanish.
// ---------------------------------------------------------------------------

const MD_QUESTION_KNOWN_KEYS = [
  "question",
  "type",
  "description",
  "options",
  "min",
  "max",
];
const MD_ROOT_KNOWN_KEYS = ["title", "description", "questions"];

function questionMarkdown(
  question: Record<string, unknown>,
  index: number,
): string {
  const text = nonEmptyString(question.question) ?? "";
  const type = readQuestionType(question.type);
  const description = nonEmptyString(question.description);

  const blocks: Array<string | null> = [
    `## ${numberedTitle(text, index)}`,
    description,
    `${TYPE_DIRECTIVE} ${QUESTION_TYPE_LABEL[type]}`,
  ];

  if (
    type === "slider" &&
    typeof question.min === "number" &&
    typeof question.max === "number"
  ) {
    blocks.push(`Range: ${question.min} - ${question.max}`);
  }

  const options = readOptions(question.options);
  if (options.length > 0) {
    blocks.push(options.map((option) => `- ${option.name}`).join("\n"));
  }

  const extras = extrasList(collectExtras(question, MD_QUESTION_KNOWN_KEYS));
  if (extras) blocks.push(extras);

  // Directives and bullets are consecutive lines, not paragraphs — the
  // parser joins non-list intro lines with a space and stops at the list.
  return blocks
    .map((block) => (typeof block === "string" ? block.trim() : ""))
    .filter((block) => block.length > 0)
    .join("\n");
}

export function questionnaireMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title = nonEmptyString(value.title);
  const questions = Array.isArray(value.questions)
    ? value.questions.filter(isRecordValue)
    : [];

  return joinBlocks([
    title ? `# ${title}` : null,
    nonEmptyString(value.description),
    ...questions.map(questionMarkdown),
    additionalDetailsSection(collectExtras(value, MD_ROOT_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — NOT registered here. system-kinds.ts spreads these
// into the system registry; this module only exports them.
// ---------------------------------------------------------------------------

export const QUESTIONNAIRE_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "questionnaire",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "questionnaire",
    toLegacyServerData: questionnaireServerDataFromEnvelope,
    toMarkdown: questionnaireMarkdownFromValue,
    artifact: { canvasType: "questionnaire" },
    persistence: { persistStructured: true },
    schema: questionnaireKindSchema,
  },
  {
    kind: "questionnaire_question",
    schemaSource: "system",
    tier: "eager",
    schema: questionnaireQuestionKindSchema,
  },
  {
    kind: "questionnaire_option",
    schemaSource: "system",
    tier: "eager",
    schema: questionnaireOptionKindSchema,
  },
];
