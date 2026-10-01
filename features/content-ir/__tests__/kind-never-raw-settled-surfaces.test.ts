/**
 * A KIND IS NEVER DRAWN AS RAW JSON — settled answers outside the chat
 * pipeline (U2, U3, U4 of features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md,
 * Arman 2026-09-30).
 *
 * Each surface below printed a structured value as JSON text: research
 * synthesis/consolidation cut `result_structured` at 20,000 chars inside a
 * ```json fence; the content-plan step rail and AI-runs view dumped artifacts
 * and results into a <pre>; the transcript-studio module column stringified a
 * payload into markdown. Each now hands the VALUE to `AnswerValueView` (kind →
 * its component, data → the structured floor). Deliberate raw views (the
 * request a model was asked, an error body, an explicit edit box) stay.
 *
 * Source assertions on purpose: the leak is the shape of the call site. RED
 * BEFORE GREEN: every case failed on the pre-fix files.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const CASES: {
  file: string;
  forbidden: RegExp[];
  required: RegExp[];
}[] = [
  {
    file: "features/research/components/synthesis/SynthesisList.tsx",
    forbidden: [/content=\{structuredToMarkdown\(/],
    required: [/<AnswerValueView value=\{synthesis\.result_structured\}/],
  },
  {
    file: "features/research/components/consolidation/ConsolidationView.tsx",
    forbidden: [/structuredToMarkdown/, /\.slice\(0, 20000\)/],
    required: [/<AnswerValueView value=\{consolidation\.result_structured\}/],
  },
  {
    file: "features/marketing/content-plan/components/NodeStepRail.tsx",
    forbidden: [
      /JSON\.stringify\(artifact\.content/,
      /JSON\.stringify\(current\.content/,
    ],
    required: [
      /<AnswerValueView value=\{artifact\.content\}/,
      /<AnswerValueView value=\{current\.content\}/,
    ],
  },
  {
    file: "features/marketing/content-plan/components/PlanAiRunsView.tsx",
    forbidden: [/JSON\.stringify\(detail\.data\.result/],
    required: [/<AnswerValueView value=\{detail\.data\.result\}/],
  },
  {
    file: "features/transcript-studio/components/columns/ModuleColumn.tsx",
    forbidden: [],
    required: [/<AnswerValueView value=\{segment\.payload\}/],
  },
];

describe("settled structured answers go through AnswerValueView", () => {
  it.each(CASES)("$file", ({ file, forbidden, required }) => {
    const source = read(file);
    for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    for (const pattern of required) expect(source).toMatch(pattern);
  });
});
