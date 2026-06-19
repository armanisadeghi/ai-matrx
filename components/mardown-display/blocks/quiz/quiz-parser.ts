/**
 * Quiz Parser and Hash Utilities
 * Handles parsing quiz JSON with content hashing
 */

import type { OriginalQuestion } from "./quiz-types";

export type QuizData = {
  questions: OriginalQuestion[];
  title: string;
  category?: string;
  contentHash: string;
};

type QuizQuestionJSON = {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
};

export type RawQuizJSON = {
  quizTitle: string;
  category?: string;
  multipleChoice: QuizQuestionJSON[];
};

/** Legacy LLM / skill output uses snake_case root keys. */
type LegacyRawQuizJSON = {
  quiz_title: string;
  category?: string;
  multiple_choice: QuizQuestionJSON[];
};

/**
 * Normalise quiz JSON from either canonical camelCase (Python server) or legacy
 * snake_case (raw LLM markdown fences). Wave B unified rendering dropped the
 * per-case normalisation that lived in BlockRenderer — this is the single path.
 */
export function normalizeRawQuizJSON(data: unknown): RawQuizJSON | null {
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const quizTitle =
    typeof record.quizTitle === "string"
      ? record.quizTitle
      : typeof record.quiz_title === "string"
        ? record.quiz_title
        : null;
  const multipleChoice = (record.multipleChoice ?? record.multiple_choice) as
    | QuizQuestionJSON[]
    | undefined;
  const category =
    typeof record.category === "string" ? record.category : undefined;

  if (
    !quizTitle ||
    !Array.isArray(multipleChoice) ||
    multipleChoice.length === 0
  ) {
    return null;
  }

  return { quizTitle, category, multipleChoice };
}

/**
 * Generate a stable hash from quiz content
 * Uses only questions to create hash (ignoring metadata like title)
 */
export async function generateQuizHash(
  questions: OriginalQuestion[],
): Promise<string> {
  // Create a stable string representation of questions
  // Sort by ID to ensure consistency
  const sortedQuestions = [...questions].sort((a, b) => a.id - b.id);

  const contentString = JSON.stringify(
    sortedQuestions.map((q) => ({
      question: q.question.trim().toLowerCase(),
      options: q.options.map((o) => o.trim().toLowerCase()).sort(),
      correctAnswer: q.correctAnswer,
    })),
  );

  // Generate SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(contentString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}

/**
 * Parse quiz JSON (accepts camelCase or legacy snake_case).
 */
export async function parseQuizJSON(
  jsonData: RawQuizJSON | LegacyRawQuizJSON | unknown,
): Promise<QuizData> {
  const normalized = normalizeRawQuizJSON(jsonData);
  if (!normalized) {
    throw new Error(
      "Invalid quiz data: quizTitle and multipleChoice are required",
    );
  }

  const questions = [...normalized.multipleChoice];
  questions.sort((a, b) => a.id - b.id);
  const contentHash = await generateQuizHash(questions);
  return {
    questions,
    title: normalized.quizTitle,
    category: normalized.category,
    contentHash,
  };
}

/**
 * Parse quiz from string (convenience wrapper)
 */
export async function parseQuizString(jsonString: string): Promise<QuizData> {
  const parsed = JSON.parse(jsonString);
  return parseQuizJSON(parsed);
}

/**
 * Check if two quiz hashes match
 */
export function quizHashesMatch(hash1: string, hash2: string): boolean {
  return hash1.toLowerCase() === hash2.toLowerCase();
}

/**
 * Validate quiz data has required fields
 */
export function isValidQuizData(data: unknown): data is RawQuizJSON {
  const normalized = normalizeRawQuizJSON(data);
  if (!normalized) return false;
  return normalized.multipleChoice.every(
    (q) =>
      typeof q.id === "number" &&
      typeof q.question === "string" &&
      Array.isArray(q.options) &&
      q.options.length > 0 &&
      typeof q.correctAnswer === "number" &&
      typeof q.explanation === "string",
  );
}
