// components/mardown-display/blocks/questionnaire/questionnaire-answers.ts
//
// The person's questionnaire answers as question/answer pairs — what the
// questionnaire's Submit stages as ONE `answers` remark (Turn References
// ruling 6) so they ride along with the next message. Pure.

import type { AnswersRemark } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";

const NOT_SELECTED = "Not Selected";

/** One stored form value as words, or null when it holds no answer. */
export function answerText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const parts = value.map(answerText).filter((v): v is string => !!v);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    // Checkbox / dropdown shape: { [option]: "Selected" | "Not Selected", Other: text | "Not Selected" }
    const picked: string[] = [];
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === "Other") {
        if (typeof v === "string" && v.trim() && v !== NOT_SELECTED) picked.push(`Other: ${v.trim()}`);
      } else if (v === "Selected") {
        picked.push(key);
      }
    }
    return picked.length ? picked.join(", ") : null;
  }
  return null;
}

/** "Q2: Budget" → "Budget". */
export function cleanQuestion(title: string): string {
  return title.replace(/^Q\d*:\s*|^Question:\s*/i, "").trim();
}

/** Answered questions, in order; unanswered ones are left out. */
export function questionnaireAnswers(
  questionTitles: readonly string[],
  formState: Record<string, unknown>,
): AnswersRemark["answers"] {
  return questionTitles.flatMap((title) => {
    const answer = answerText(formState[title]);
    return answer ? [{ question: cleanQuestion(title), answer }] : [];
  });
}
