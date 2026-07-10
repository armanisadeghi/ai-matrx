// features/education/assessment/data/serializeAssessment.ts
//
// The ONE mapping from an assessment (+ its items) to the markdown a converter
// generator narrates/reads — the assessment counterpart of media/audioBrief's
// serializeDeck. Used when an assessment is a convert SOURCE (quiz → deck / notes
// / summary …), so a student can turn a quiz they were given into other study
// artifacts. Questions, options, the correct answer, and any explanation are
// included so a downstream generator has the full graded content to ground on.

import type { AssessmentItemRow, AssessmentRow } from "./types";

const MAX_ITEMS = 100;

/** Serialize an assessment (+ up to MAX_ITEMS questions) to grounding markdown. */
export function serializeAssessment(
  assessment: Pick<AssessmentRow, "title" | "topic" | "description">,
  items: AssessmentItemRow[],
): { markdown: string; truncated: boolean } {
  const truncated = items.length > MAX_ITEMS;
  const included = truncated ? items.slice(0, MAX_ITEMS) : items;

  const header = [
    `# ${assessment.title}`,
    assessment.topic ? `Topic: ${assessment.topic}` : null,
    assessment.description || null,
  ]
    .filter(Boolean)
    .join("\n");

  const body = included
    .map((item, i) => {
      const lines = [`## Question ${i + 1}`, item.prompt];
      const options = Array.isArray(item.options)
        ? (item.options as unknown[]).filter(
            (o): o is string => typeof o === "string" && o.trim().length > 0,
          )
        : [];
      if (options.length > 0) {
        lines.push(...options.map((o) => `- ${o}`));
      }
      if (item.correct_answer) lines.push(`Answer: ${item.correct_answer}`);
      if (item.explanation) lines.push(`Explanation: ${item.explanation}`);
      return lines.join("\n");
    })
    .join("\n\n");

  return { markdown: `${header}\n\n${body}`, truncated };
}
