/**
 * quiz_set kind → MultipleChoiceQuiz bridge.
 *
 * The successor to the legacy `{ quiz_title, multiple_choice }` root-key
 * detection. The kind's authored shape (flexible_data Block Schemas rows
 * `quiz_set` / `quiz_question`) is:
 *
 *   { __kind:"quiz_set", title, description?, questions: [
 *       { __kind:"quiz_question", type, question, options?, correct_answer,
 *         explanation? } ] }
 *
 * The bridge derives the CANONICAL camelCase quiz payload
 * (`{ quizTitle, multipleChoice: [{ id, question, options, correctAnswer,
 * explanation }] }`) that `parseQuizJSON` / `normalizeRawQuizJSON` already
 * accept — QuizArtifact passes serverData straight through to
 * MultipleChoiceQuiz, zero component changes.
 *
 * Mapping notes:
 * - `correct_answer` is authored as a STRING (the correct option's text);
 *   the component needs the option INDEX. Resolution order: exact option
 *   match → trimmed case-insensitive match → in-range integer (0-based) →
 *   0. The original `correct_answer` string rides along on the mapped
 *   question (zero data loss).
 * - `type:"true_false"` questions without options get ["True","False"]
 *   synthesized. Questions with no options at all can't render in a
 *   multiple-choice component and are skipped.
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

const MAPPED_QUESTION_KEYS = new Set(["question", "options", "explanation"]);
const MAPPED_SET_KEYS = new Set(["title", "questions"]);

function resolveCorrectIndex(options: string[], correct: unknown): number {
  if (
    typeof correct === "number" &&
    Number.isInteger(correct) &&
    correct >= 0 &&
    correct < options.length
  ) {
    return correct;
  }

  if (typeof correct === "string") {
    const exact = options.indexOf(correct);
    if (exact !== -1) return exact;

    const normalized = correct.trim().toLowerCase();
    const loose = options.findIndex(
      (option) => option.trim().toLowerCase() === normalized,
    );
    if (loose !== -1) return loose;

    const asNumber = Number(normalized);
    if (
      Number.isInteger(asNumber) &&
      asNumber >= 0 &&
      asNumber < options.length
    ) {
      return asNumber;
    }
  }

  return 0;
}

function isTrueFalse(type: unknown): boolean {
  return (
    typeof type === "string" &&
    type.trim().toLowerCase().replace(/[\s-]+/g, "_") === "true_false"
  );
}

function mapQuestion(
  question: Record<string, unknown>,
  index: number,
): Record<string, unknown> | null {
  const text = typeof question.question === "string" ? question.question : "";
  if (!text) return null;

  let options = Array.isArray(question.options)
    ? question.options.filter(
        (option): option is string => typeof option === "string",
      )
    : [];
  if (options.length === 0 && isTrueFalse(question.type)) {
    options = ["True", "False"];
  }
  if (options.length === 0) return null;

  const mapped: Record<string, unknown> = {
    id: index + 1,
    question: text,
    options,
    correctAnswer: resolveCorrectIndex(options, question.correct_answer),
    explanation:
      typeof question.explanation === "string" ? question.explanation : "",
  };

  // Zero data loss: type, the original correct_answer string, and any
  // schema-unknown extras ride along untouched.
  for (const [key, value] of Object.entries(question)) {
    if (MAPPED_QUESTION_KEYS.has(key) || key in mapped) continue;
    mapped[key] = value;
  }

  return mapped;
}

export const quizServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "quiz_set",
  (value) => {
    const title = typeof value.title === "string" ? value.title : "";
    if (!title || !Array.isArray(value.questions)) return undefined;

    const multipleChoice: Record<string, unknown>[] = [];
    for (const question of value.questions) {
      if (!isRecord(question)) continue;
      const mapped = mapQuestion(question, multipleChoice.length);
      if (mapped) multipleChoice.push(mapped);
    }
    if (multipleChoice.length === 0) return undefined;

    const serverData: Record<string, unknown> = {
      quizTitle: title,
      multipleChoice,
    };
    for (const [key, extra] of Object.entries(value)) {
      if (MAPPED_SET_KEYS.has(key)) continue;
      serverData[key] = extra;
    }

    return serverData;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — quiz_set → human-readable Q&A markdown.
//
// One heading per question, numbered options, the correct answer spelled out
// (never just an index), explanation as a labeled paragraph. Unknown keys
// (question-level inline; set-level under "Additional details") never
// silently vanish.
// ---------------------------------------------------------------------------

const MD_QUESTION_KNOWN_KEYS = [
  "type",
  "question",
  "options",
  "correct_answer",
  "explanation",
];

const MD_SET_KNOWN_KEYS = ["title", "description", "questions"];

function questionMarkdown(
  question: Record<string, unknown>,
  index: number,
): string {
  const blocks: Array<string | null> = [`## Question ${index + 1}`];

  if (typeof question.question === "string" && question.question !== "") {
    blocks.push(question.question);
  }

  const options = Array.isArray(question.options)
    ? question.options.filter(
        (option): option is string => typeof option === "string",
      )
    : [];
  if (options.length > 0) {
    blocks.push(options.map((option, i) => `${i + 1}. ${option}`).join("\n"));
  }

  if (question.correct_answer !== undefined && question.correct_answer !== null) {
    blocks.push(`**Answer:** ${formatInlineValue(question.correct_answer)}`);
  }
  if (typeof question.explanation === "string" && question.explanation !== "") {
    blocks.push(`**Explanation:** ${question.explanation}`);
  }

  const extras = extrasList(collectExtras(question, MD_QUESTION_KNOWN_KEYS));
  if (extras) blocks.push(extras);

  return joinBlocks(blocks);
}

export function quizMarkdownFromValue(value: Record<string, unknown>): string {
  const title = typeof value.title === "string" && value.title !== ""
    ? value.title
    : "Quiz";
  const questions = Array.isArray(value.questions)
    ? value.questions.filter(isRecordValue)
    : [];

  return joinBlocks([
    `# ${title}`,
    typeof value.description === "string" ? value.description : null,
    ...questions.map(questionMarkdown),
    additionalDetailsSection(collectExtras(value, MD_SET_KNOWN_KEYS)),
  ]);
}
