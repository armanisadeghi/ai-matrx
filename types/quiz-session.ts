import type { QuizState } from "@/components/mardown-display/blocks/quiz/quiz-types";

/** Client/server shape for a persisted quiz session (subset of columns used by UI). */
export type QuizSession = {
  id: string;
  created_by: string;
  title: string | null;
  category: string | null;
  state: QuizState;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  quiz_content_hash: string | null;
  quiz_metadata: Record<string, unknown> | null;
};
