// features/question-desk/types.ts
//
// The Question Desk's row shapes and its ONE vocabulary of words on screen.
//
// Every type here is derived from the GENERATED `types/database.types.ts`
// (`Database["interview"]["Tables"]`) — never hand-declared. The contract is
// `aidream/db/migrations/qd_001_decision_interview.sql`; if a column name here
// drifts from the DB, `pnpm type-check` says so instead of the screen lying.

import type { Database } from "@/types/database.types";

export type DecisionInterviewRow =
  Database["interview"]["Tables"]["decision_interview"]["Row"];
export type DecisionQuestionRow =
  Database["interview"]["Tables"]["decision_question"]["Row"];
export type DecisionQuestionUpdate =
  Database["interview"]["Tables"]["decision_question"]["Update"];

/** The verdicts the DB CHECK admits (`decision_question_verdict_check`). */
export const VERDICTS = [
  "recommendation",
  "skip",
  "hand_back",
  "own_words",
  "confirm",
  "overturn",
] as const;
export type Verdict = (typeof VERDICTS)[number];

/** `decision_question_answer_source_check`. */
export type AnswerSource = "keystroke" | "typed" | "voice" | "chat";

/**
 * The words the answered block shows. They are the RESPONDENT's sentence about
 * what he did, not a status code — the reference page's own labels, kept.
 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  recommendation: "You took the recommendation",
  skip: "Skipped",
  hand_back: "Not yours — the desk decides",
  own_words: "Your answer",
  confirm: "Confirmed",
  overturn: "Overturned — coming back to you",
};

/** The five research parts, in the order the reference page discloses them. */
export const RESEARCH_PARTS = [
  { key: "ruled_before", label: "What you ruled before" },
  { key: "the_best_do", label: "What the best in the world do" },
  { key: "today", label: "What the system actually does today" },
  { key: "implications", label: "What each way costs" },
] as const;
export type ResearchPartKey = (typeof RESEARCH_PARTS)[number]["key"];

/**
 * Review-mode groups. `review_kind` is deliberately FREE TEXT in the DB (a
 * growing vocabulary — attack F10), so this map names the kinds we know and an
 * unknown kind renders under its own raw value rather than being dropped.
 */
export const REVIEW_KIND_LABEL: Record<string, string> = {
  agent: "An agent can just do it",
  already: "You already ruled",
  table: "Table stakes",
  stale: "Premise no longer true",
  knob: "A setting with a default",
  user: "Asked you as a user, not the boss",
};

/** Group order on the review table — the reference page's order. */
export const REVIEW_KIND_ORDER = [
  "agent",
  "knob",
  "table",
  "already",
  "user",
  "stale",
] as const;

export const KIND_LABEL: Record<string, string> = {
  choice: "Choice",
  confirmation: "Confirmation",
  open_ended: "Open ended",
  vision: "Vision",
  money: "Money",
  brand_or_legal: "Brand or legal",
};

export const WEIGHT_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const DOOR_LABEL: Record<string, string> = {
  two_way: "Two-way door",
  one_way: "One-way door",
};

/** What the interview screen holds for one interview. */
export interface InterviewBundle {
  interview: DecisionInterviewRow;
  questions: DecisionQuestionRow[];
}

/** A list row: the interview plus its three counts, from one grouped read. */
export interface InterviewListRow extends DecisionInterviewRow {
  openCount: number;
  answeredCount: number;
  deliveredCount: number;
  totalCount: number;
}

export function isAnswered(q: DecisionQuestionRow): boolean {
  return q.answered_at !== null && q.verdict !== null;
}
