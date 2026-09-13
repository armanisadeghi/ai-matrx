// features/question-desk/data/questions.ts
//
// Reads and writes for `interview.decision_question` — the answer path.
//
// 🚨 THE ANSWER IS SACRED. `answer_text` is written EXACTLY as it was given:
// no trim, no collapse, no "helpful" normalisation. A leading space, a trailing
// newline and a run of blank lines are part of what he said. The DB backs this
// up (`decision_question_answer_words_ck` refuses an empty own-words answer),
// and this module never calls `.trim()` on anything it stores.
//
// Every write is a `guardedUpdate` compare-and-swap on the canonical `version`
// column, so an answer typed against a stale row reports a conflict instead of
// silently overwriting whatever an agent wrote through MCP in the meantime.

import { guardedUpdate } from "@ai-matrx/data/db";
import type {
  AnswerSource,
  DecisionQuestionRow,
  DecisionQuestionUpdate,
  Verdict,
} from "../types";
import { LIST_CAP, db } from "./db";
import { QuestionDeskReadError } from "./interviews";

export interface QuestionListResult {
  questions: DecisionQuestionRow[];
  /** The read hit the cap — the screen says so rather than showing a short interview. */
  truncated: boolean;
}

/** Every question in one interview, in the order the desk filed them. */
export async function listQuestions(
  interviewId: string,
): Promise<QuestionListResult> {
  const { data, error } = await db()
    .from("decision_question")
    .select("*")
    .eq("interview_id", interviewId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(LIST_CAP + 1);
  if (error) {
    throw new QuestionDeskReadError(
      `The questions could not be read: ${error.message}`,
    );
  }
  const rows = (data ?? []) as DecisionQuestionRow[];
  return { questions: rows.slice(0, LIST_CAP), truncated: rows.length > LIST_CAP };
}

/** One question re-read by id — the row realtime or a conflict hands back. */
export async function loadQuestion(
  questionId: string,
): Promise<DecisionQuestionRow | null> {
  const { data, error } = await db()
    .from("decision_question")
    .select("*")
    .eq("id", questionId)
    .maybeSingle();
  if (error) {
    throw new QuestionDeskReadError(
      `That question could not be re-read: ${error.message}`,
    );
  }
  return (data as DecisionQuestionRow | null) ?? null;
}

export type SaveOutcome =
  | { status: "saved"; row: DecisionQuestionRow }
  | { status: "conflict"; currentRow: DecisionQuestionRow; message: string }
  | { status: "failed"; message: string };

export interface SaveAnswerArgs {
  question: DecisionQuestionRow;
  verdict: Verdict;
  /** Verbatim. Never trimmed here or anywhere downstream. */
  answerText: string | null;
  source: AnswerSource;
  answeredBy: string;
  /** `cld_files` id of the recording, when the capture path persisted one. */
  audioFileId?: string | null;
}

/**
 * Record an answer. `verdict` and `answered_at` are written TOGETHER because
 * the DB pair CHECK (`decision_question_answer_pair_ck`) requires it, and
 * `status` moves to `answered` in the same statement so no reader can ever see
 * a row that is answered but not marked answered.
 */
export async function saveAnswer(args: SaveAnswerArgs): Promise<SaveOutcome> {
  const { question, verdict, answerText, source, answeredBy, audioFileId } = args;
  if (
    (verdict === "own_words" || verdict === "overturn") &&
    (answerText === null || answerText.length === 0)
  ) {
    return {
      status: "failed",
      message: "Write something first, or use one of the buttons.",
    };
  }

  const patch: DecisionQuestionUpdate = {
    verdict,
    answer_text: answerText,
    answer_source: source,
    answered_at: new Date().toISOString(),
    answered_by: answeredBy,
    status: "answered",
  };
  if (audioFileId) patch.answer_audio_file_id = audioFileId;

  return applyGuarded(question, patch, "That answer did not save");
}

/**
 * THE UNDO. Re-open a row that was just answered: `verdict` and `answered_at`
 * are cleared TOGETHER (the pair CHECK forbids clearing one alone) and the row
 * returns to THE STATUS IT ACTUALLY HELD before the answer. The prior words
 * stay in `history.row_versions`, which is why an undo is safe: nothing is
 * lost, the row is simply open again.
 *
 * 🚨 `previousStatus` is not optional taste. The first version guessed
 * `asked_at ? "asked" : "researched"`, and undoing a row that had been sitting
 * at `filed` put it into `researched` — a transition nobody performed, on a
 * ladder other agents read (verifier finding 5, 2026-09-12). The caller holds
 * the row it saved from, so it knows the real answer and passes it.
 */
export async function reopenAnswer(
  question: DecisionQuestionRow,
  previousStatus: string,
): Promise<SaveOutcome> {
  const patch: DecisionQuestionUpdate = {
    verdict: null,
    answered_at: null,
    answered_by: null,
    answer_source: null,
    answer_text: null,
    answer_audio_file_id: null,
    status: previousStatus,
  };
  return applyGuarded(question, patch, "That answer could not be re-opened");
}

async function applyGuarded(
  question: DecisionQuestionRow,
  patch: DecisionQuestionUpdate,
  what: string,
): Promise<SaveOutcome> {
  try {
    const result = await guardedUpdate<DecisionQuestionRow>({
      expectedVersion: question.version,
      applyUpdate: ({ expectedVersion, nextVersion }) =>
        db()
          .from("decision_question")
          .update({ ...patch, version: nextVersion })
          .eq("id", question.id)
          .eq("version", expectedVersion)
          .select("*")
          .maybeSingle() as never,
      fetchCurrent: () =>
        db()
          .from("decision_question")
          .select("*")
          .eq("id", question.id)
          .maybeSingle() as never,
    });
    if (result.status === "saved") return { status: "saved", row: result.row };
    if (result.status === "conflict") {
      return {
        status: "conflict",
        currentRow: result.currentRow,
        message:
          "This question changed somewhere else while you were answering — your words are still on screen. Look at what landed, then save again.",
      };
    }
    return {
      status: "failed",
      message: "This question no longer exists. Your words are still on screen.",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "failed", message: `${what}: ${reason}` };
  }
}
