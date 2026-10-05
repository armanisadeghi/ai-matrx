/**
 * Real `<questionnaire>` XML from the live walk of 2026-10-04 (chat
 * 9ed2ce2a…, position 7) must produce the canonical questionnaire value
 * through the REAL streaming host and the REAL splitter — before the fix the
 * strategy logged "produced no canonical value" and the region stayed raw.
 */
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { IR_ENVELOPE_KEY, isCanonicalBlockIR } from "@ai-matrx/content-ir";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { QUESTIONNAIRE_XML } from "@/components/mardown-display/blocks/inline-decision/__tests__/real-model-output.fixtures";
import { questionnaireLegacyTextToKindValue } from "../surfaces/questionnaire-legacy-text";

type Q = { question: string; type: string; options?: Array<{ name: string }> };

describe("questionnaire XML body", () => {
  it("strategy yields title, 5 questions, types and options", () => {
    const v = questionnaireLegacyTextToKindValue(QUESTIONNAIRE_XML) as {
      title: string;
      questions: Q[];
    } | null;
    expect(v?.title).toBe("Product Launch Strategy & Readiness");
    expect(v?.questions.map((q) => q.type)).toEqual(["text", "radio", "radio", "radio", "text"]);
    expect(v?.questions[1].question).toMatch(/^What is your single most important/);
    expect(v?.questions[1].options?.map((o) => o.name)).toEqual([
      "Qualitative feedback & product-market fit signals",
      "User acquisition / volume of active accounts",
      "Direct revenue / paid customer conversion",
      "Strategic partnerships & industry visibility",
    ]);
  });

  it("checkbox / dropdown / slider words map", () => {
    const v = questionnaireLegacyTextToKindValue(
      `<questionnaire>\n<question type="multiple" prompt="A?"><option>x</option></question>\n<question type="select" prompt="B?"><option>y</option></question>\n<question type="scale" min="1" max="5" prompt="C?" />\n</questionnaire>`,
    ) as { questions: Array<Q & { min?: number; max?: number }> };
    expect(v.questions.map((q) => q.type)).toEqual(["checkbox", "dropdown", "slider"]);
    expect([v.questions[2].min, v.questions[2].max]).toEqual([1, 5]);
  });

  it("the splitter stamps a canonical envelope on the XML region", () => {
    const block = splitContentIntoBlocksV2(`Here.\n\n${QUESTIONNAIRE_XML}\n`).find(
      (b) => b.type === "questionnaire",
    );
    const env = (block?.metadata as Record<string, unknown>)?.[IR_ENVELOPE_KEY];
    expect(isCanonicalBlockIR(env)).toBe(true);
    const root = (env as { root: { value: { title?: string; questions: unknown[] } } }).root;
    expect(root.value.title).toBe("Product Launch Strategy & Readiness");
    expect(root.value.questions).toHaveLength(5);
  });

  it("the accumulator (streamed) completes with a canonical envelope", () => {
    const ups: Array<{ block: { type: string; status?: string; metadata?: Record<string, unknown> | null } }> = [];
    const acc = new StreamBlockAccumulator("req-q-xml", (p) => {
      ups.push(p as never);
      return { type: "t", payload: p };
    });
    const dispatch = (a: unknown) => a;
    const stream = `Here.\n\n${QUESTIONNAIRE_XML}\n`;
    for (let i = 0; i < stream.length; i += 11) acc.ingest(stream.slice(i, i + 11), dispatch);
    acc.finalize(dispatch);
    const done = [...ups].reverse().find((u) => u.block.type === "questionnaire" && u.block.status === "complete");
    const env = done?.block.metadata?.[IR_ENVELOPE_KEY];
    expect(isCanonicalBlockIR(env)).toBe(true);
    const root = (env as { root: { value: { title?: string; questions: unknown[] } } }).root;
    expect(root.value.title).toBe("Product Launch Strategy & Readiness");
    expect(root.value.questions).toHaveLength(5);
  });
});
