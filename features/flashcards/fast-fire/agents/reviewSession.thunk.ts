// features/flashcards/fast-fire/agents/reviewSession.thunk.ts
//
// Fast Fire's thin wrapper over the generalized end-of-session review
// (`features/education/tutor/lanes/reviewSession.ts`, Phase 4 parity push).
// Builds the `attempts`/`aggregate` shape from Fast Fire's OWN grade state
// (it has real per-card `transcript`/`score`, unlike the generic study spine
// drivers) and folds the result into the Fast Fire Redux slice for its own
// completion screen, in addition to the shared `study_session.session_review`
// persistence the generalized core already does.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { reviewSession as reviewSessionCore } from "@/features/education/tutor/lanes/reviewSession";
import { setSessionReview } from "../redux/fastFireSlice";
import {
  selectGradesInOrder,
  selectFastFireCards,
} from "../redux/fastFire.selectors";

interface ReviewSessionArgs {
  sessionId: string | null;
}

/** Run the holistic review. Call WITHOUT awaiting (it catches up after complete). */
export function reviewSession(args: ReviewSessionArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    const state = getState();
    const cards = selectFastFireCards(state);
    const grades = selectGradesInOrder(state);
    const byId = new Map(grades.map((g) => [g.cardId, g]));

    const attempts = cards.map((c) => {
      const g = byId.get(c.id);
      return {
        front: c.front,
        result: g?.result ?? null,
        score: g?.score ?? null,
        transcript: g?.transcript ?? "",
      };
    });
    const resolved = grades.filter((g) => g.status === "resolved");
    const correct = resolved.filter((g) => g.result === "correct").length;
    const aggregate = {
      total: cards.length,
      graded: resolved.length,
      correct,
      accuracy: resolved.length > 0 ? correct / resolved.length : 0,
    };

    const result = await dispatch(
      reviewSessionCore({ sessionId: args.sessionId, attempts, aggregate }),
    );
    if (result) dispatch(setSessionReview({ review: result.summary }));
  };
}
