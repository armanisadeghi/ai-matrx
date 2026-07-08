/**
 * questionnaire kind — schema, examples, bridge, and DUAL-surface convergence.
 *
 * `questionnaire` is one of the few block types the platform detects in two
 * framings today: `SIMPLE_XML_TAGS` (stream-block-accumulator) and
 * `SPECIAL_CODE_LANGUAGES` (content-splitter-v2). Both carry the same body and
 * both route to QuestionnaireArtifact → QuestionnaireRenderer, so both get a
 * `kind_surface` row and both are driven here through the REAL hosts.
 *
 * Four legs, per the Shape System activation law:
 *   (a) both kind_example payloads (mirrored byte-for-byte from the applied
 *       content_ir.kind_example rows) pass the REAL structural gate
 *       (validateStructuralLeg) against the emitted_json_schema produced by
 *       the REAL converter (kindSchemaToJsonSchema, strict) — the same
 *       artifacts the migration stored;
 *   (b) the legacy bridge derives serverData the REAL component contract
 *       accepts: QuestionnaireArtifact hands serverData straight to
 *       QuestionnaireRenderer, whose `{ intro?, sections? }` shape AND its
 *       directive decoding (`Type:` / `Range:` / options lookup / skip guard)
 *       are asserted here against a faithful test double — itself pinned to
 *       the component source by a drift guard, since the renderer exports none
 *       of these helpers;
 *   (c) the `questionnaire_legacy_text` strategy converts a REAL sample of
 *       today's wire format (the body the live `form-questionnaire` content
 *       block teaches agents to emit, verbatim) into a schema-passing
 *       canonical value whose bridged serverData RENDERS IDENTICALLY to what
 *       the component's own parser produces — the keystone parity at unit
 *       level;
 *   (d) the REAL StreamBlockAccumulator (XML framing) and the REAL
 *       splitContentIntoBlocksV2 (fence framing) both stamp `metadata.__ir`
 *       with root kind `questionnaire` and the correct discriminator.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { separatedMarkdownParser } from "@/components/mardown-display/markdown-classification/processors/custom/parser-separated";

import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import { envelopeFromCompleteValue, isCanonicalBlockIR } from "../core/normalize";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import {
  runKindDualGate,
  validateStructuralLeg,
} from "../registry/kind-dual-gate";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import {
  QUESTIONNAIRE_KIND_DEFINITIONS,
  QUESTIONNAIRE_KIND_SCHEMAS,
  QUESTION_TYPE_LABEL,
  QUESTIONNAIRE_QUESTION_TYPES,
  questionnaireKindSchema,
  questionnaireQuestionKindSchema,
  questionnaireOptionKindSchema,
  questionnaireServerDataFromEnvelope,
  questionnaireMarkdownFromValue,
} from "../kinds/questionnaire";
import { questionnaireLegacyTextToKindValue } from "../surfaces/questionnaire-legacy-text";
import { chunkText } from "./seeded-random";

const resolve = (kind: string): KindSchema | undefined =>
  QUESTIONNAIRE_KIND_SCHEMAS.find((schema) => schema.kind === kind);

/** The exact emitted_json_schema the migration materialized (strict, no __kind). */
const emitted = kindSchemaToJsonSchema("questionnaire", resolve, {
  strict: true,
  injectKind: false,
});
if (!emitted) throw new Error("converter declined the questionnaire kind");
const EMITTED_JSON_SCHEMA = emitted.schema;

// ---------------------------------------------------------------------------
// Fixtures — byte-for-byte mirrors of the applied kind_example rows
// (migrations/kind_questionnaire_full.sql).
// ---------------------------------------------------------------------------

const RICH_EXAMPLE: Record<string, unknown> = {
  __kind: "questionnaire",
  title: "Onboarding Survey",
  description:
    "A few questions so we can tailor your workspace. Your answers come straight back to the assistant.",
  questions: [
    {
      __kind: "questionnaire_question",
      question: "What should we call you?",
      type: "input",
    },
    {
      __kind: "questionnaire_question",
      question: "Which features do you use?",
      type: "checkbox",
      options: [
        { __kind: "questionnaire_option", name: "Dashboards" },
        { __kind: "questionnaire_option", name: "Reports" },
        { __kind: "questionnaire_option", name: "Automations" },
      ],
    },
    {
      __kind: "questionnaire_question",
      question: "Primary role",
      type: "dropdown",
      options: [
        { __kind: "questionnaire_option", name: "Engineering" },
        { __kind: "questionnaire_option", name: "Design" },
        { __kind: "questionnaire_option", name: "Operations" },
      ],
    },
    {
      __kind: "questionnaire_question",
      question: "How do you prefer to be contacted?",
      type: "radio",
      options: [
        { __kind: "questionnaire_option", name: "Email" },
        { __kind: "questionnaire_option", name: "In-app" },
        { __kind: "questionnaire_option", name: "Never" },
      ],
    },
    {
      __kind: "questionnaire_question",
      question: "How satisfied are you today?",
      type: "slider",
      min: 1,
      max: 5,
    },
    {
      __kind: "questionnaire_question",
      question: "Enable weekly digest emails",
      type: "toggle",
      options: [{ __kind: "questionnaire_option", name: "Send the digest" }],
    },
    {
      __kind: "questionnaire_question",
      question: "Anything else we should know?",
      description: "Optional — share context about your team or workflow.",
      type: "text",
    },
  ],
};

const SIMPLE_EXAMPLE: Record<string, unknown> = {
  __kind: "questionnaire",
  questions: [
    {
      __kind: "questionnaire_question",
      question: "What should we call you?",
      type: "input",
    },
    {
      __kind: "questionnaire_question",
      question: "Which features do you use?",
      type: "checkbox",
      options: [
        { __kind: "questionnaire_option", name: "Dashboards" },
        { __kind: "questionnaire_option", name: "Reports" },
        { __kind: "questionnaire_option", name: "Automations" },
      ],
    },
    {
      __kind: "questionnaire_question",
      question: "How satisfied are you?",
      type: "slider",
      min: 1,
      max: 5,
    },
  ],
};

/**
 * A REAL sample of today's wire format: the exact body the live
 * `public.content_blocks` row `form-questionnaire` teaches every agent to
 * emit, verbatim (note the `Range: 1-5` spacing it uses), plus the
 * description-bearing and old-format `Options:` shapes the parser also
 * produces in the wild.
 */
const WIRE_BODY = [
  "## Q1: What should we call you?",
  "Type: Input",
  "",
  "## Q2: Which features do you use?",
  "Type: Checkbox",
  "- Dashboards",
  "- Reports",
  "- Automations",
  "",
  "## Q3: How satisfied are you?",
  "Type: Slider",
  "Range: 1-5",
].join("\n");

/** The same body wrapped in the XML framing (the accumulator's region text). */
const WIRE_XML = `<questionnaire>\n${WIRE_BODY}\n</questionnaire>`;

/** A harder body: description leak, the old `Options:` carrier, toggle label. */
const WIRE_BODY_ADVANCED = [
  "## Q1: Pick your plan",
  "Type: Dropdown",
  "",
  "## Options:",
  "- Starter",
  "- Growth",
  "",
  "## Q2: Anything else?",
  "Tell us about your workflow.",
  "Type: Text",
  "",
  "## Q3: Send weekly digests",
  "Type: Toggle",
  "- Send the digest",
].join("\n");

// ---------------------------------------------------------------------------
// The component contract — a faithful double of QuestionnaireRenderer's
// consumption of `data`. The renderer exports none of these helpers, so the
// double is pinned to the component SOURCE by the drift guard below.
// ---------------------------------------------------------------------------

const RENDERER_PATH = path.join(
  process.cwd(),
  "components/mardown-display/blocks/questionnaire/QuestionnaireRenderer.tsx",
);
const RENDERER_SOURCE = readFileSync(RENDERER_PATH, "utf8");

type ComponentOption = { name: string };
type ComponentSection = {
  title: string;
  intro?: string;
  items?: ComponentOption[];
};
type ComponentData = { intro?: string; sections?: ComponentSection[] };

/** QuestionnaireRenderer.TYPE_PATTERNS, copied verbatim (order = resolution). */
const TYPE_PATTERNS: Record<string, RegExp[]> = {
  CHECKBOX: [/checkbox/i, /check.*box/i, /multiple.*choice/i],
  DROPDOWN: [/dropdown/i, /drop.*down/i, /select(?!\s+radio)/i],
  TOGGLE: [/toggle/i, /switch/i, /boolean/i],
  RADIO: [/radio/i, /radio.*button/i],
  SLIDER: [/slider/i, /range/i, /scale/i],
  TEXT: [/text.*area/i, /long.*text/i, /paragraph/i],
  INPUT: [/input/i, /short.*text/i, /single.*line/i],
};

const extractType = (intro = ""): string => {
  const match = intro.match(/Type:\s*([^)]+)(?:\s*\([^)]*\))?/);
  return match ? match[1].trim() : "";
};

const getQuestionType = (typeString = ""): string => {
  for (const [type, patterns] of Object.entries(TYPE_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(typeString))) return type;
  }
  return "TEXT";
};

const extractSliderRange = (
  intro: string,
): { min: number; max: number } | null => {
  if (!intro.includes("Type: Slider")) return null;
  const match = intro.match(
    /Range:\s*([-]?\d+)(?:\s*\([^)]*\))?\s*-\s*([-]?\d+)(?:\s*\([^)]*\))?/,
  );
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
  return { min: 0, max: 100 };
};

const isOtherOption = (option: unknown): boolean => {
  if (!option || typeof option !== "object") return false;
  const name = (option as ComponentOption).name;
  if (!name || typeof name !== "string") return false;
  const lower = name.toLowerCase();
  return lower === "other" || lower.startsWith("other:");
};

const normalizeOptions = (
  options: ComponentOption[] = [],
  intro = "",
): ComponentOption[] => {
  if (options.length === 0) return [];
  const filtered = options.filter((option) => !isOtherOption(option));
  const normalized = getQuestionType(extractType(intro));
  if (normalized === "CHECKBOX" || normalized === "DROPDOWN") {
    filtered.push({ name: "Other" });
  }
  return filtered;
};

const findOptionsForQuestion = (
  sections: ComponentSection[],
  questionTitle: string,
): ComponentOption[] => {
  const index = sections.findIndex((s) => s.title === questionTitle);
  if (index === -1) return [];
  const current = sections[index];
  if (current.items && current.items.length > 0) return current.items;
  const next = sections[index + 1];
  if (next?.title === "Options:") return next.items ?? [];
  return [];
};

const processQuestionTitle = (title: string, questionIndex: number): string => {
  if (/^Q(\d+):\s*/i.test(title)) return title;
  return `Q${questionIndex + 1}: ${title.replace(/^Question:\s*/i, "")}`;
};

const extractQuestionnaireHeader = (data: ComponentData) => {
  let title = "";
  let description = "";
  if (data.intro) {
    for (const line of data.intro.split("\n").filter((l) => l.trim())) {
      const trimmed = line.trim();
      if (trimmed.startsWith("# ")) title = trimmed.replace(/^#\s+/, "");
      else if (!trimmed.startsWith("##") && !trimmed.match(/^Introduction$/i)) {
        description += (description ? " " : "") + trimmed;
      }
    }
  }
  if (data.sections && data.sections.length > 0) {
    const first = data.sections[0];
    if (first.title === "Introduction" && first.intro) description = first.intro;
    if (!title) {
      for (const section of data.sections.slice(0, 3)) {
        if (
          section.title.includes("Questionnaire") ||
          section.title.includes("Planning")
        ) {
          title = section.title.replace(/^#+\s*/, "");
          break;
        }
      }
    }
  }
  return { title, description };
};

/** Everything QuestionnaireRenderer actually puts on screen, per `data`. */
interface RenderProjection {
  header: { title: string; description: string };
  questions: Array<{
    title: string;
    type: string;
    description: string;
    options: string[];
    range: { min: number; max: number } | null;
    toggleLabel: string | null;
  }>;
}

function renderProjection(data: ComponentData): RenderProjection {
  const sections = data.sections ?? [];
  const questions: RenderProjection["questions"] = [];

  sections.forEach((section, index) => {
    if (
      section.title === "Introduction" ||
      section.title === "Options:" ||
      !section.intro?.includes("Type:")
    ) {
      return;
    }
    let questionIndex = 0;
    for (let i = 0; i < index; i++) {
      if (sections[i].intro?.includes("Type:")) questionIndex++;
    }
    const intro = section.intro;
    const options = normalizeOptions(
      findOptionsForQuestion(sections, section.title),
      intro,
    );
    const type = getQuestionType(extractType(intro));
    questions.push({
      title: processQuestionTitle(section.title, questionIndex),
      type,
      description: intro.startsWith("Type:") ? "" : intro,
      options: options.map((option) => option.name),
      range: type === "SLIDER" ? extractSliderRange(intro) : null,
      toggleLabel: type === "TOGGLE" ? (options[0]?.name ?? "Yes/No") : null,
    });
  });

  return { header: extractQuestionnaireHeader(data), questions };
}

/** The renderer's hard guard: no `sections` ⇒ "No questionnaire data available". */
function assertComponentAcceptsServerData(
  serverData: Record<string, unknown> | undefined,
): asserts serverData is Record<string, unknown> & ComponentData {
  expect(serverData).toBeDefined();
  if (!serverData) throw new Error("unreachable");

  expect(Array.isArray(serverData.sections)).toBe(true);
  expect((serverData.sections as unknown[]).length).toBeGreaterThan(0);
  if (serverData.intro !== undefined) {
    expect(typeof serverData.intro).toBe("string");
  }

  for (const section of serverData.sections as ComponentSection[]) {
    expect(typeof section.title).toBe("string");
    expect(section.title.length).toBeGreaterThan(0);
    // Every emitted section MUST declare a type or the renderer skips it.
    expect(typeof section.intro).toBe("string");
    expect(section.intro).toContain("Type:");
    expect(Array.isArray(section.items)).toBe(true);
    for (const item of section.items ?? []) {
      expect(typeof item.name).toBe("string");
    }
  }

  // Titles double as the options-lookup key — collisions silently steal options.
  const titles = (serverData.sections as ComponentSection[]).map(
    (section) => section.title,
  );
  expect(new Set(titles).size).toBe(titles.length);
}

// ---------------------------------------------------------------------------
// Drift guard — the test double above is only meaningful while it mirrors the
// component. Pin each load-bearing literal to the renderer's source.
// ---------------------------------------------------------------------------

describe("questionnaire kind — component-source drift guard", () => {
  it("the renderer still declares the TYPE_PATTERNS this double copies", () => {
    for (const literal of [
      "CHECKBOX: [/checkbox/i, /check.*box/i, /multiple.*choice/i]",
      "DROPDOWN: [/dropdown/i, /drop.*down/i, /select(?!\\s+radio)/i]",
      "TOGGLE: [/toggle/i, /switch/i, /boolean/i]",
      "RADIO: [/radio/i, /radio.*button/i]",
      "SLIDER: [/slider/i, /range/i, /scale/i]",
      "TEXT: [/text.*area/i, /long.*text/i, /paragraph/i]",
      "INPUT: [/input/i, /short.*text/i, /single.*line/i]",
    ]) {
      expect(RENDERER_SOURCE).toContain(literal);
    }
  });

  it("the renderer still decodes the directives the bridge encodes", () => {
    // extractType, extractSliderRange's literal gate + regex, and the skip guard.
    expect(RENDERER_SOURCE).toContain(
      "intro.match(/Type:\\s*([^)]+)(?:\\s*\\([^)]*\\))?/)",
    );
    expect(RENDERER_SOURCE).toContain('!intro.includes("Type: Slider")');
    expect(RENDERER_SOURCE).toContain(
      "/Range:\\s*([-]?\\d+)(?:\\s*\\([^)]*\\))?\\s*-\\s*([-]?\\d+)(?:\\s*\\([^)]*\\))?/",
    );
    expect(RENDERER_SOURCE).toContain('!section.intro?.includes("Type:")');
    // The options lookup keyed on the RAW section title.
    expect(RENDERER_SOURCE).toContain(
      "(section) => section.title === questionTitle,",
    );
    // "Other" is appended by the renderer, never authored.
    expect(RENDERER_SOURCE).toContain('filteredOptions.push({ name: "Other" })');
    // The header hides itself without a description.
    expect(RENDERER_SOURCE).toContain("if (!description) return null;");
  });

  it("every canonical type label resolves to its own renderer branch", () => {
    const expected: Record<string, string> = {
      input: "INPUT",
      text: "TEXT",
      radio: "RADIO",
      checkbox: "CHECKBOX",
      dropdown: "DROPDOWN",
      slider: "SLIDER",
      toggle: "TOGGLE",
    };
    for (const type of QUESTIONNAIRE_QUESTION_TYPES) {
      expect(getQuestionType(QUESTION_TYPE_LABEL[type])).toBe(expected[type]);
    }
    // "Slider" is doubly load-bearing: extractSliderRange gates on the literal.
    expect(`Type: ${QUESTION_TYPE_LABEL.slider}`).toBe("Type: Slider");
  });
});

// ---------------------------------------------------------------------------
// (a) Examples pass the structural gate against the converter-emitted schema
// ---------------------------------------------------------------------------

describe("questionnaire kind — structural gate (the applied kind_example rows)", () => {
  it("the canonical (rich) example passes validateStructuralLeg", () => {
    expect(validateStructuralLeg(RICH_EXAMPLE, EMITTED_JSON_SCHEMA)).toEqual({
      ok: true,
    });
  });

  it("the simple example passes validateStructuralLeg", () => {
    expect(validateStructuralLeg(SIMPLE_EXAMPLE, EMITTED_JSON_SCHEMA)).toEqual({
      ok: true,
    });
  });

  it("the FULL dual gate (structural + render) passes on the canonical example", () => {
    const [rootDefinition] = QUESTIONNAIRE_KIND_DEFINITIONS;
    const result = runKindDualGate({
      kind: "questionnaire",
      sample: RICH_EXAMPLE,
      emittedJsonSchema: EMITTED_JSON_SCHEMA,
      definition: rootDefinition,
    });
    expect(result.structural).toEqual({ ok: true });
    expect(result.render).toEqual({ ok: true });
    expect(result.isActive).toBe(true);
  });

  it("storage rows round-trip losslessly (data[] + edges ⇄ KindSchema)", () => {
    for (const schema of [
      questionnaireKindSchema,
      questionnaireQuestionKindSchema,
      questionnaireOptionKindSchema,
    ]) {
      expect(
        storageToKindSchema(schema.kind, kindSchemaToStorage(schema)),
      ).toEqual(schema);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) The bridge derives serverData the REAL component accepts
// ---------------------------------------------------------------------------

describe("questionnaire kind — legacy bridge (toLegacyServerData)", () => {
  const serverData = questionnaireServerDataFromEnvelope(
    envelopeFromCompleteValue(RICH_EXAMPLE, "questionnaire"),
  );

  it("rich example → the exact `{ intro, sections }` shape the component consumes", () => {
    assertComponentAcceptsServerData(serverData);

    expect(serverData).toEqual({
      intro:
        "# Onboarding Survey\nA few questions so we can tailor your workspace. Your answers come straight back to the assistant.",
      sections: [
        { title: "Q1: What should we call you?", intro: "Type: Input", items: [] },
        {
          title: "Q2: Which features do you use?",
          intro: "Type: Checkbox",
          items: [
            { name: "Dashboards" },
            { name: "Reports" },
            { name: "Automations" },
          ],
        },
        {
          title: "Q3: Primary role",
          intro: "Type: Dropdown",
          items: [
            { name: "Engineering" },
            { name: "Design" },
            { name: "Operations" },
          ],
        },
        {
          title: "Q4: How do you prefer to be contacted?",
          intro: "Type: Radio",
          items: [{ name: "Email" }, { name: "In-app" }, { name: "Never" }],
        },
        {
          title: "Q5: How satisfied are you today?",
          intro: "Type: Slider Range: 1 - 5",
          items: [],
        },
        {
          title: "Q6: Enable weekly digest emails",
          intro: "Type: Toggle",
          items: [{ name: "Send the digest" }],
        },
        {
          title: "Q7: Anything else we should know?",
          intro: "Optional — share context about your team or workflow. Type: Text",
          items: [],
        },
      ],
    });
  });

  it("the component decodes every directive back to the authored semantics", () => {
    assertComponentAcceptsServerData(serverData);
    const projection = renderProjection(serverData);

    expect(projection.header).toEqual({
      title: "Onboarding Survey",
      description:
        "A few questions so we can tailor your workspace. Your answers come straight back to the assistant.",
    });

    expect(projection.questions.map((q) => q.type)).toEqual([
      "INPUT",
      "CHECKBOX",
      "DROPDOWN",
      "RADIO",
      "SLIDER",
      "TOGGLE",
      "TEXT",
    ]);

    // Checkbox/dropdown get the renderer's own "Other"; radio/toggle do not.
    expect(projection.questions[1].options).toEqual([
      "Dashboards",
      "Reports",
      "Automations",
      "Other",
    ]);
    expect(projection.questions[2].options).toEqual([
      "Engineering",
      "Design",
      "Operations",
      "Other",
    ]);
    expect(projection.questions[3].options).toEqual([
      "Email",
      "In-app",
      "Never",
    ]);

    expect(projection.questions[4].range).toEqual({ min: 1, max: 5 });
    expect(projection.questions[5].toggleLabel).toBe("Send the digest");

    // A question WITHOUT a description shows none…
    expect(projection.questions[0].description).toBe("");
    // …and one WITH a description shows it, directive tail included — the
    // component's existing leak for text arrivals, reproduced exactly.
    expect(projection.questions[6].description).toBe(
      "Optional — share context about your team or workflow. Type: Text",
    );
  });

  it("simple example (no title/description) omits `intro` entirely", () => {
    const simple = questionnaireServerDataFromEnvelope(
      envelopeFromCompleteValue(SIMPLE_EXAMPLE, "questionnaire"),
    );
    assertComponentAcceptsServerData(simple);
    expect(simple.intro).toBeUndefined();
    expect(renderProjection(simple).questions.map((q) => q.type)).toEqual([
      "INPUT",
      "CHECKBOX",
      "SLIDER",
    ]);
  });

  it("declines a payload with no renderable question (raw path takes over)", () => {
    expect(
      questionnaireServerDataFromEnvelope(
        envelopeFromCompleteValue(
          { __kind: "questionnaire", questions: [] },
          "questionnaire",
        ),
      ),
    ).toBeUndefined();
  });

  it("toMarkdown exports the block's own wire grammar", () => {
    const markdown = questionnaireMarkdownFromValue(SIMPLE_EXAMPLE);
    expect(markdown).toBe(
      [
        "## Q1: What should we call you?",
        "Type: Input",
        "",
        "## Q2: Which features do you use?",
        "Type: Checkbox",
        "- Dashboards",
        "- Reports",
        "- Automations",
        "",
        "## Q3: How satisfied are you?",
        "Type: Slider",
        "Range: 1 - 5",
      ].join("\n"),
    );
  });
});

// ---------------------------------------------------------------------------
// (c) The strategy converts today's REAL wire format into a canonical value
// ---------------------------------------------------------------------------

describe("questionnaire_legacy_text — the wire format converges", () => {
  it("the live `form-questionnaire` body → a schema-passing canonical value", () => {
    const value = questionnaireLegacyTextToKindValue(WIRE_XML);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");

    expect(value).toEqual({
      __kind: "questionnaire",
      questions: [
        {
          __kind: "questionnaire_question",
          question: "Q1: What should we call you?",
          type: "input",
        },
        {
          __kind: "questionnaire_question",
          question: "Q2: Which features do you use?",
          type: "checkbox",
          options: [
            { __kind: "questionnaire_option", name: "Dashboards" },
            { __kind: "questionnaire_option", name: "Reports" },
            { __kind: "questionnaire_option", name: "Automations" },
          ],
        },
        {
          __kind: "questionnaire_question",
          question: "Q3: How satisfied are you?",
          type: "slider",
          min: 1,
          max: 5,
        },
      ],
    });

    expect(validateStructuralLeg(value, EMITTED_JSON_SCHEMA)).toEqual({
      ok: true,
    });
  });

  it("both host framings (tagged region text, inner-only body) yield one value", () => {
    expect(questionnaireLegacyTextToKindValue(WIRE_BODY)).toEqual(
      questionnaireLegacyTextToKindValue(WIRE_XML),
    );
  });

  it("KEYSTONE: bridged serverData renders IDENTICALLY to the component's own parse", () => {
    for (const body of [WIRE_BODY, WIRE_BODY_ADVANCED]) {
      const legacy = separatedMarkdownParser(body) as ComponentData;
      const value = questionnaireLegacyTextToKindValue(body);
      expect(value).not.toBeNull();
      if (!value) throw new Error("unreachable");

      const bridged = questionnaireServerDataFromEnvelope(
        envelopeFromCompleteValue(value, "questionnaire"),
      );
      assertComponentAcceptsServerData(bridged);

      expect(renderProjection(bridged)).toEqual(renderProjection(legacy));
    }
  });

  it("the advanced body decodes the old `Options:` carrier, the leak, and the toggle label", () => {
    const value = questionnaireLegacyTextToKindValue(WIRE_BODY_ADVANCED);
    expect(value).toEqual({
      __kind: "questionnaire",
      questions: [
        {
          __kind: "questionnaire_question",
          question: "Q1: Pick your plan",
          type: "dropdown",
          options: [
            { __kind: "questionnaire_option", name: "Starter" },
            { __kind: "questionnaire_option", name: "Growth" },
          ],
        },
        {
          __kind: "questionnaire_question",
          question: "Q2: Anything else?",
          type: "text",
          description: "Tell us about your workflow.",
        },
        {
          __kind: "questionnaire_question",
          question: "Q3: Send weekly digests",
          type: "toggle",
          options: [{ __kind: "questionnaire_option", name: "Send the digest" }],
        },
      ],
    });
    expect(validateStructuralLeg(value, EMITTED_JSON_SCHEMA)).toEqual({
      ok: true,
    });
  });

  it("a body with no `Type:` directive declines (loud fail-open, legacy stands)", () => {
    expect(
      questionnaireLegacyTextToKindValue(
        "<questionnaire>\n## Just a heading\nSome prose.\n</questionnaire>",
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (d) The REAL hosts stamp `metadata.__ir` — XML tag AND fence language
// ---------------------------------------------------------------------------

type Upsert = { requestId: string; block: RenderBlockPayload };

function runAccumulator(stream: string, requestId: string, seed: number) {
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const chunk of chunkText(stream, seed, 9)) {
    accumulator.ingest(chunk, dispatch);
  }
  accumulator.finalize(dispatch);
  return upserts;
}

function envelopeOf(
  metadata: Record<string, unknown> | null | undefined,
): CanonicalBlockIR | null {
  const candidate = metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

function finalQuestionnaireBlock(upserts: Upsert[]): RenderBlockPayload {
  for (let i = upserts.length - 1; i >= 0; i--) {
    const block = upserts[i].block;
    if (block.type === "questionnaire" && block.status === "complete") {
      return block;
    }
  }
  throw new Error("no complete questionnaire block emitted");
}

const FENCE_WIRE = ["```questionnaire", WIRE_BODY, "```"].join("\n");

describe("questionnaire surfaces — the REAL hosts converge", () => {
  it("accumulator: a completed ```questionnaire fence carries the fence-discriminated envelope", () => {
    const upserts = runAccumulator(
      `Let's get set up.\n\n${FENCE_WIRE}\n\nThanks!\n`,
      "req-questionnaire-fence",
      3,
    );
    const block = finalQuestionnaireBlock(upserts);
    const envelope = envelopeOf(block.metadata);
    expect(envelope).not.toBeNull();
    if (!envelope) throw new Error("unreachable");

    expect(envelope.root.kind).toBe("questionnaire");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.root.kindState).toBe("resolved");
    expect(envelope.root.discriminator).toEqual({
      format: "fence",
      language: "questionnaire",
    });
    expect(envelope.root.value).toEqual(
      questionnaireLegacyTextToKindValue(WIRE_BODY),
    );

    // Complete-only law: no streaming emit carried an envelope.
    const streaming = upserts.filter(
      ({ block: b }) => b.blockId === block.blockId && b.status === "streaming",
    );
    expect(streaming.length).toBeGreaterThan(0);
    for (const { block: b } of streaming) {
      expect(envelopeOf(b.metadata)).toBeNull();
    }
  });

  it("accumulator: chunking never changes the envelope (4 seeds)", () => {
    const envelopes: CanonicalBlockIR[] = [];
    for (let seed = 1; seed <= 4; seed++) {
      const envelope = envelopeOf(
        finalQuestionnaireBlock(
          runAccumulator(
            `Intro.\n${FENCE_WIRE}\nOutro.\n`,
            `req-q-${seed}`,
            seed,
          ),
        ).metadata,
      );
      expect(envelope).not.toBeNull();
      if (envelope) envelopes.push(envelope);
    }
    for (const envelope of envelopes.slice(1)) {
      expect(envelope).toEqual(envelopes[0]);
    }
  });

  it("splitter: a completed <questionnaire> region carries the XML-discriminated envelope", () => {
    const source = `Let's get set up.\n\n${WIRE_XML}\n\nThanks!\n`;
    const block = splitContentIntoBlocksV2(source).find(
      (b) => b.type === "questionnaire",
    );
    expect(block).toBeDefined();

    const envelope = envelopeOf(block?.metadata);
    expect(envelope).not.toBeNull();
    if (!envelope) throw new Error("unreachable");

    expect(envelope.root.kind).toBe("questionnaire");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.root.kindState).toBe("resolved");
    expect(envelope.root.discriminator).toEqual({
      format: "xml",
      tag: "questionnaire",
    });
    expect(envelope.root.value).toEqual(
      questionnaireLegacyTextToKindValue(WIRE_XML),
    );
  });

  it("splitter: the ```questionnaire FENCE carries the fence-discriminated envelope", () => {
    const source = `Here you go:\n\n${FENCE_WIRE}\n`;
    const block = splitContentIntoBlocksV2(source).find(
      (b) => b.type === "questionnaire",
    );
    expect(block).toBeDefined();

    const envelope = envelopeOf(block?.metadata);
    expect(envelope).not.toBeNull();
    if (!envelope) throw new Error("unreachable");

    expect(envelope.root.discriminator).toEqual({
      format: "fence",
      language: "questionnaire",
    });
    expect(envelope.root.value).toEqual(
      questionnaireLegacyTextToKindValue(WIRE_BODY),
    );
  });

  it("stream ≡ static: the accumulator's fence envelope is byte-identical to the splitter's", () => {
    const source = `Here you go:\n\n${FENCE_WIRE}\n`;
    const fromStream = envelopeOf(
      finalQuestionnaireBlock(runAccumulator(source, "req-q-parity", 2))
        .metadata,
    );
    const fromSplitter = envelopeOf(
      splitContentIntoBlocksV2(source).find((b) => b.type === "questionnaire")
        ?.metadata,
    );
    expect(fromStream).not.toBeNull();
    expect(fromSplitter).not.toBeNull();
    expect(fromSplitter).toEqual(fromStream);
  });

  it("accumulator: a completed <questionnaire> region carries the XML-discriminated envelope", () => {
    const upserts = runAccumulator(
      `Let's get set up.\n\n${WIRE_XML}\n\nThanks!\n`,
      "req-questionnaire-xml",
      4,
    );
    const block = finalQuestionnaireBlock(upserts);
    const envelope = envelopeOf(block.metadata);
    expect(envelope).not.toBeNull();
    if (!envelope) throw new Error("unreachable");

    expect(envelope.root.kind).toBe("questionnaire");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.root.kindState).toBe("resolved");
    expect(envelope.root.discriminator).toEqual({
      format: "xml",
      tag: "questionnaire",
    });
    expect(envelope.root.value).toEqual(
      questionnaireLegacyTextToKindValue(WIRE_XML),
    );

    // Today's XML metadata contract survives alongside the envelope.
    expect(block.metadata?.isComplete).toBe(true);
  });

  /**
   * The accumulator strips a simple-XML block's literal tags out of its
   * content, so region completion is the state machine's `xmlClosedCleanly`
   * fact — never a scan of `currentBlockContent` for the closing tag. That
   * exact confusion silently killed XML convergence for every `xml_tag`
   * surface once (commit e4edc0c7e, repaired in this cycle). A truncated
   * region must still fall back to legacy rendering, envelope-free.
   */
  it("accumulator: an UNCLOSED <questionnaire> region gets no envelope (stream death → legacy)", () => {
    const upserts = runAccumulator(
      `<questionnaire>\n${WIRE_BODY}\n`,
      "req-q-truncated",
      6,
    );
    const block = upserts
      .map(({ block: b }) => b)
      .reverse()
      .find((b) => b.type === "questionnaire");
    expect(block).toBeDefined();
    expect(envelopeOf(block?.metadata)).toBeNull();
  });

  it("stream ≡ static: the accumulator's XML envelope is byte-identical to the splitter's", () => {
    const source = `Let's get set up.\n\n${WIRE_XML}\n\nThanks!\n`;
    const fromStream = envelopeOf(
      finalQuestionnaireBlock(runAccumulator(source, "req-q-xml-parity", 2))
        .metadata,
    );
    const fromSplitter = envelopeOf(
      splitContentIntoBlocksV2(source).find((b) => b.type === "questionnaire")
        ?.metadata,
    );
    expect(fromStream).not.toBeNull();
    expect(fromSplitter).not.toBeNull();
    expect(fromSplitter).toEqual(fromStream);
  });
});
