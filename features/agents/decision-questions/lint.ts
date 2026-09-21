/**
 * The "split this question" lint.
 *
 * A decision holder returns ONE typed answer per question. An instruction
 * that asks two things gets one answer that silently covers whichever half
 * the model latched onto, and the probability attached to it is meaningless —
 * the single most common authoring mistake in the decision literature and the
 * one the editor can catch by reading the sentence.
 *
 * The lint is advisory: it flags with a one-sentence reason and never blocks
 * a save. Authors write legitimate compound instructions ("marketing and
 * sales collateral" is one category, not two questions) and a lint that
 * refuses them would be worse than one that is occasionally ignored.
 */

import type { DecisionQuestionSpec } from "./types";

export interface QuestionLint {
  /** Word or mark that triggered it — shown so the flag is never mysterious. */
  trigger: string;
  reason: string;
}

/** `and`/`or` between two clauses, a semicolon, or a second question mark. */
const CONJUNCTION = /\b(and|or)\b/i;

function clauseCount(text: string): number {
  // A clause boundary worth counting: a comma or semicolon followed by
  // something with a verb-ish word, or an explicit sentence break.
  return text
    .split(/[;]|(?:\?\s+)|(?:\.\s+)/)
    .map((piece) => piece.trim())
    .filter(Boolean).length;
}

export function lintQuestion(
  question: DecisionQuestionSpec,
): QuestionLint | null {
  const text = (question.instructions ?? "").trim();
  if (!text) return null;

  const questionMarks = (text.match(/\?/g) ?? []).length;
  if (questionMarks > 1) {
    return {
      trigger: "?",
      reason:
        "This asks more than one question, and only one answer comes back — split it so each answer carries its own probability.",
    };
  }

  const clauses = clauseCount(text);
  if (clauses > 1) {
    return {
      trigger: clauses > 2 ? "multiple clauses" : "two clauses",
      reason:
        "This reads as more than one instruction, and only one answer comes back — split it so each answer carries its own probability.",
    };
  }

  const conjunction = CONJUNCTION.exec(text);
  if (conjunction) {
    const word = conjunction[1].toLowerCase();
    // "and"/"or" joining two short noun phrases is normal English, not two
    // questions. Only flag when there is real sentence on both sides.
    const [before, after] = [
      text.slice(0, conjunction.index),
      text.slice(conjunction.index + conjunction[1].length),
    ];
    const wordsBefore = before.trim().split(/\s+/).filter(Boolean).length;
    const wordsAfter = after.trim().split(/\s+/).filter(Boolean).length;
    if (wordsBefore >= 4 && wordsAfter >= 4) {
      return {
        trigger: word,
        reason: `"${word}" joins two things this question is asking at once, and only one answer comes back — split it so each answer carries its own probability.`,
      };
    }
  }

  return null;
}
