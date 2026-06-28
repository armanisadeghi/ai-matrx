import type { Json } from "@/types/database.types";
import type {
  OriginalQuestion,
  QuizAnswer,
  QuizProgress,
  QuizResults,
  QuizState,
  RandomizedQuestion,
} from "@/components/mardown-display/blocks/quiz/quiz-types";
import type { QuizSession } from "@/types/quiz-session";

// quiz_sessions is in `education` schema; local type until `education` is in PGRST_DB_SCHEMAS and types regenerated.
type QuizSessionRow = Record<string, unknown> & {
  id: string;
  user_id: string | null;
  title: string | null;
  category: string | null;
  state: import("@/types/database.types").Json;
  is_completed: boolean | null;
  quiz_content_hash: string | null;
  quiz_metadata: import("@/types/database.types").Json | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function isJsonRecord(value: Json): value is Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseOriginalQuestion(val: Json): OriginalQuestion | null {
  if (!isJsonRecord(val)) return null;
  const o = val;
  if (!isFiniteNumber(o.id) || typeof o.question !== "string") return null;
  if (
    !Array.isArray(o.options) ||
    !o.options.every((x) => typeof x === "string")
  ) {
    return null;
  }
  if (!isFiniteNumber(o.correctAnswer) || typeof o.explanation !== "string") {
    return null;
  }
  return {
    id: o.id,
    question: o.question,
    options: o.options,
    correctAnswer: o.correctAnswer,
    explanation: o.explanation,
  };
}

function parseRandomizedQuestion(val: Json): RandomizedQuestion | null {
  if (!isJsonRecord(val)) return null;
  const o = val;
  if (!isFiniteNumber(o.id) || typeof o.question !== "string") return null;
  if (
    !Array.isArray(o.options) ||
    !o.options.every((x) => typeof x === "string")
  ) {
    return null;
  }
  if (
    !isFiniteNumber(o.correctAnswerIndex) ||
    !isFiniteNumber(o.originalCorrectAnswer)
  ) {
    return null;
  }
  if (
    !Array.isArray(o.shuffleMap) ||
    !o.shuffleMap.every((x) => isFiniteNumber(x))
  ) {
    return null;
  }
  if (typeof o.explanation !== "string") return null;
  return {
    id: o.id,
    question: o.question,
    options: o.options,
    correctAnswerIndex: o.correctAnswerIndex,
    originalCorrectAnswer: o.originalCorrectAnswer,
    shuffleMap: o.shuffleMap,
    explanation: o.explanation,
  };
}

function parseQuizAnswer(val: Json): QuizAnswer | null {
  if (!isJsonRecord(val)) return null;
  const o = val;
  if (!isFiniteNumber(o.questionId) || !isFiniteNumber(o.selectedOptionIndex)) {
    return null;
  }
  if (typeof o.isCorrect !== "boolean" || !isFiniteNumber(o.timestamp))
    return null;
  const out: QuizAnswer = {
    questionId: o.questionId,
    selectedOptionIndex: o.selectedOptionIndex,
    isCorrect: o.isCorrect,
    timestamp: o.timestamp,
  };
  if (o.timeSpent !== undefined) {
    if (!isFiniteNumber(o.timeSpent)) return null;
    out.timeSpent = o.timeSpent;
  }
  return out;
}

function parseQuizProgress(val: Json): QuizProgress | null {
  if (!isJsonRecord(val)) return null;
  const o = val;
  if (
    !isFiniteNumber(o.currentQuestionIndex) ||
    !isFiniteNumber(o.startTime) ||
    !isFiniteNumber(o.lastUpdated) ||
    !isFiniteNumber(o.totalTimeSpent)
  ) {
    return null;
  }
  if (!isJsonRecord(o.answers)) return null;
  const answers: Record<number, QuizAnswer> = {};
  for (const [k, v] of Object.entries(o.answers)) {
    const idx = Number(k);
    if (!Number.isInteger(idx)) return null;
    const ans = parseQuizAnswer(v);
    if (ans === null) return null;
    answers[idx] = ans;
  }
  return {
    currentQuestionIndex: o.currentQuestionIndex,
    answers,
    startTime: o.startTime,
    lastUpdated: o.lastUpdated,
    totalTimeSpent: o.totalTimeSpent,
  };
}

function parseQuizResults(val: Json): QuizResults | null {
  if (!isJsonRecord(val)) return null;
  const o = val;
  const nums = [
    "totalQuestions",
    "answeredCount",
    "correctCount",
    "incorrectCount",
    "skippedCount",
    "scorePercentage",
    "completedAt",
    "totalTimeSpent",
  ] as const;
  for (const k of nums) {
    if (!isFiniteNumber(o[k])) return null;
  }
  if (!Array.isArray(o.incorrectQuestionIds)) return null;
  if (!o.incorrectQuestionIds.every((x) => isFiniteNumber(x))) return null;
  return {
    totalQuestions: Number(o.totalQuestions),
    answeredCount: Number(o.answeredCount),
    correctCount: Number(o.correctCount),
    incorrectCount: Number(o.incorrectCount),
    skippedCount: Number(o.skippedCount),
    scorePercentage: Number(o.scorePercentage),
    completedAt: Number(o.completedAt),
    totalTimeSpent: Number(o.totalTimeSpent),
    incorrectQuestionIds: o.incorrectQuestionIds,
  };
}

/** Parse `quiz_sessions.state` JSON into `QuizState`; returns null if shape is invalid. */
export function parseQuizStateJson(data: Json): QuizState | null {
  if (!isJsonRecord(data)) return null;
  const o = data;
  if (typeof o.quizId !== "string") return null;
  if (o.mode !== "normal" && o.mode !== "retake") return null;
  if (!Array.isArray(o.originalQuestions)) return null;
  const originalQuestions: OriginalQuestion[] = [];
  for (let i = 0; i < o.originalQuestions.length; i++) {
    const q = parseOriginalQuestion(o.originalQuestions[i]);
    if (q === null) return null;
    originalQuestions.push(q);
  }
  if (!Array.isArray(o.randomizedQuestions)) return null;
  const randomizedQuestions: RandomizedQuestion[] = [];
  for (let i = 0; i < o.randomizedQuestions.length; i++) {
    const q = parseRandomizedQuestion(o.randomizedQuestions[i]);
    if (q === null) return null;
    randomizedQuestions.push(q);
  }
  const progress = parseQuizProgress(o.progress);
  if (progress === null) return null;
  let results: QuizResults | null;
  if (o.results === null) {
    results = null;
  } else {
    results = parseQuizResults(o.results);
    if (results === null) return null;
  }
  let retakeQuestionIds: number[] | undefined;
  if (o.retakeQuestionIds !== undefined) {
    if (!Array.isArray(o.retakeQuestionIds)) return null;
    if (!o.retakeQuestionIds.every((x) => isFiniteNumber(x))) return null;
    retakeQuestionIds = o.retakeQuestionIds;
  }
  const out: QuizState = {
    quizId: o.quizId,
    originalQuestions,
    randomizedQuestions,
    progress,
    results,
    mode: o.mode,
  };
  if (retakeQuestionIds !== undefined) {
    out.retakeQuestionIds = retakeQuestionIds;
  }
  return out;
}

function parseQuizMetadataJson(
  raw: Json | null,
): Record<string, unknown> | null {
  if (raw === null) return null;
  if (!isJsonRecord(raw)) return null;
  return { ...raw };
}

/** Maps a DB row to the server action `QuizSession` shape; null if state/metadata invalid. */
export function mapQuizSessionRow(row: QuizSessionRow): QuizSession | null {
  const state = parseQuizStateJson(row.state);
  if (state === null) return null;
  const quiz_metadata = parseQuizMetadataJson(row.quiz_metadata);
  if (row.quiz_metadata !== null && quiz_metadata === null) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    category: row.category,
    state,
    is_completed: row.is_completed ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    quiz_content_hash: row.quiz_content_hash,
    quiz_metadata,
  };
}
