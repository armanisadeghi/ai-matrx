/**
 * math_problem kind → MathProblemBlock / MathProblem bridge.
 *
 * Successor to the legacy `{ math_problem: { ... } }` root-key detection.
 * The kind's authored shape is FLAT (the inner object's fields, plus child
 * kinds for the arrays-of-objects):
 *
 *   { __kind:"math_problem", title, problem_statement: { text, equation,
 *     instruction }, solutions: [ { __kind:"math_solution", task, steps: [
 *       { __kind:"math_solution_step", title, equation, ... } ],
 *       solutionAnswer, ... } ], hint?, resources?, ... }
 *
 * MathProblemArtifact consumes the WRAPPED payload (`payload.math_problem`
 * spread in canvas mode; `problemData={payload}` inline), so the bridge
 * re-wraps the reconstructed zero-loss value under the legacy root key.
 * No legacy parser exists for this type — the artifact uses a plain JSON
 * parse — so the wrap is the whole bridge.
 */

import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  formatInlineValue,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

export const mathProblemServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "math_problem",
  (value) => {
    if (!isRecord(value.problem_statement) || !Array.isArray(value.solutions)) {
      return undefined;
    }
    return { math_problem: value };
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — math_problem → worked-solution markdown.
//
// Problem statement (text, equation as a code span, instruction), then one
// section per solution with per-step subsections and a bold final answer.
// Course/topic/module render as a context line; unknown keys never silently
// vanish (step/solution-level inline; problem-level under "Additional
// details").
// ---------------------------------------------------------------------------

const MD_STEP_KNOWN_KEYS = ["title", "equation", "explanation", "simplified"];
const MD_SOLUTION_KNOWN_KEYS = [
  "task",
  "steps",
  "solutionAnswer",
  "transitionText",
];
const MD_PROBLEM_KNOWN_KEYS = [
  "title",
  "course_name",
  "topic_name",
  "module_name",
  "description",
  "intro_text",
  "final_statement",
  "problem_statement",
  "solutions",
  "hint",
  "resources",
  "difficulty_level",
  "related_content",
];

function stepMarkdown(step: Record<string, unknown>, index: number): string {
  const heading =
    typeof step.title === "string" && step.title !== ""
      ? `### Step ${index + 1}: ${step.title}`
      : `### Step ${index + 1}`;
  const blocks: Array<string | null> = [heading];

  if (typeof step.equation === "string" && step.equation !== "") {
    blocks.push(`\`${step.equation}\``);
  }
  if (typeof step.explanation === "string" && step.explanation !== "") {
    blocks.push(step.explanation);
  }
  if (typeof step.simplified === "string" && step.simplified !== "") {
    blocks.push(`*Simplified:* \`${step.simplified}\``);
  }

  const extras = extrasList(collectExtras(step, MD_STEP_KNOWN_KEYS));
  if (extras) blocks.push(extras);

  return joinBlocks(blocks);
}

function solutionMarkdown(
  solution: Record<string, unknown>,
  index: number,
): string {
  const heading =
    typeof solution.task === "string" && solution.task !== ""
      ? `## Solution ${index + 1}: ${solution.task}`
      : `## Solution ${index + 1}`;
  const blocks: Array<string | null> = [heading];

  const steps = Array.isArray(solution.steps)
    ? solution.steps.filter(isRecordValue)
    : [];
  blocks.push(...steps.map(stepMarkdown));

  if (
    typeof solution.solutionAnswer === "string" &&
    solution.solutionAnswer !== ""
  ) {
    blocks.push(`**Answer:** ${solution.solutionAnswer}`);
  }
  if (
    typeof solution.transitionText === "string" &&
    solution.transitionText !== ""
  ) {
    blocks.push(solution.transitionText);
  }

  const extras = extrasList(collectExtras(solution, MD_SOLUTION_KNOWN_KEYS));
  if (extras) blocks.push(extras);

  return joinBlocks(blocks);
}

export function mathProblemMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Math problem";

  const context = ["course_name", "topic_name", "module_name"]
    .map((key) => value[key])
    .filter(
      (part): part is string => typeof part === "string" && part !== "",
    );

  const statement = isRecordValue(value.problem_statement)
    ? value.problem_statement
    : null;
  const statementBlocks: Array<string | null> = statement
    ? [
        "## Problem",
        typeof statement.text === "string" ? statement.text : null,
        typeof statement.equation === "string" && statement.equation !== ""
          ? `\`${statement.equation}\``
          : null,
        typeof statement.instruction === "string" ? statement.instruction : null,
        extrasList(
          collectExtras(statement, ["text", "equation", "instruction"]),
        ),
      ]
    : [];

  const solutions = Array.isArray(value.solutions)
    ? value.solutions.filter(isRecordValue)
    : [];

  const resources = Array.isArray(value.resources)
    ? value.resources.map((resource) => `- ${formatInlineValue(resource)}`)
    : [];
  const related = Array.isArray(value.related_content)
    ? value.related_content.map((item) => `- ${formatInlineValue(item)}`)
    : [];

  return joinBlocks([
    `# ${title}`,
    context.length > 0 ? `*${context.join(" · ")}*` : null,
    typeof value.difficulty_level === "string" &&
    value.difficulty_level !== ""
      ? `**Difficulty:** ${value.difficulty_level}`
      : null,
    typeof value.intro_text === "string" ? value.intro_text : null,
    typeof value.description === "string" ? value.description : null,
    ...statementBlocks,
    typeof value.hint === "string" && value.hint !== ""
      ? `**Hint:** ${value.hint}`
      : null,
    ...solutions.map(solutionMarkdown),
    typeof value.final_statement === "string" ? value.final_statement : null,
    resources.length > 0 ? `**Resources:**\n\n${resources.join("\n")}` : null,
    related.length > 0
      ? `**Related content:**\n\n${related.join("\n")}`
      : null,
    additionalDetailsSection(collectExtras(value, MD_PROBLEM_KNOWN_KEYS)),
  ]);
}
