// features/education/assessment/data/questionRunRequest.ts
//
// What an "Add more questions" run asked for, as the JSON `useTabBoundRun`
// keeps on the device: count, the person's instruction, the question types and
// the Sources exactly as chosen. A run that stopped with its page is offered
// again with the SAME request (the twin of flashcards' `cardRunRequest`).

import type { SourceSet } from "@ai-matrx/agents/sources";
import type { SourceDraft } from "@ai-matrx/agents/sources/runtime";
import {
  deckDraftsFromMetadata,
  deckSourceSetPatch,
  type DeckSourceName,
} from "@/features/flashcards/data/deckSourceSet";
import { isQuestionType } from "./types";
import type { QuestionType } from "./types";

export interface QuestionRunRequest {
  count: number;
  instruction: string;
  questionTypes: QuestionType[];
  drafts: SourceDraft[];
}

/** The tab-bound run key for one assessment's "Add more questions". */
export function addMoreQuestionsRunKey(assessmentId: string): string {
  return `assessment:add-more:${assessmentId}`;
}

export function questionRunRequest(
  count: number,
  instruction: string,
  questionTypes: readonly QuestionType[],
  sourceSet: SourceSet,
  names: Record<string, DeckSourceName>,
): Record<string, unknown> {
  return { count, instruction, questionTypes: [...questionTypes], ...deckSourceSetPatch(sourceSet, names) };
}

/** The stored request back, or null when it is not one we can repeat. */
export function restoreQuestionRunRequest(data: Record<string, unknown>): QuestionRunRequest | null {
  const count = data.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return null;
  const drafts = deckDraftsFromMetadata(data) ?? [];
  if (drafts.length === 0) return null;
  const rawTypes = Array.isArray(data.questionTypes) ? data.questionTypes : [];
  return {
    count,
    instruction: typeof data.instruction === "string" ? data.instruction : "",
    questionTypes: rawTypes.filter((t): t is QuestionType => typeof t === "string" && isQuestionType(t)),
    drafts,
  };
}
