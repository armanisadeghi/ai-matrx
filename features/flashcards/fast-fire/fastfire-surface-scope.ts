// features/flashcards/fast-fire/fastfire-surface-scope.ts
//
// Runtime scope builder for the FastFire surface
// (`matrx-user/education-fastfire`). Maps the ONE drill state machine
// (`fastFireSlice`) into the manifest's declared values at trigger time —
// called only when an agent actually runs, never on render.

import type { RootState } from "@/lib/redux/store";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  createEducationFastfireScope,
  type FastFireCardGradeSummary,
  type FastFireGradeSummary,
} from "@/features/surfaces/manifests/education-fastfire.manifest";

export function buildFastFireSurfaceScope(state: RootState): SurfaceScopePayload {
  const ff = state.fastFire;
  const { config } = ff;

  const grades = Object.values(ff.gradesByCard);
  const resolved = grades.filter((g) => g.status === "resolved");
  const cardGrades: FastFireCardGradeSummary[] = grades.map((g) => ({
    cardId: g.cardId,
    status: g.status,
    score: g.score,
    result: g.result,
    transcript: g.transcript,
    feedback: g.feedback,
    missing: g.missing,
  }));
  const gradeSummary: FastFireGradeSummary | undefined =
    grades.length > 0
      ? {
          graded: resolved.length,
          correct: resolved.filter((g) => g.result === "correct").length,
          partial: resolved.filter((g) => g.result === "partial").length,
          incorrect: resolved.filter((g) => g.result === "incorrect").length,
          pending: grades.filter((g) => g.status === "pending").length,
          errored: grades.filter((g) => g.status === "error").length,
        }
      : undefined;

  const currentCard =
    ff.currentIndex >= 0 && ff.currentIndex < ff.cards.length
      ? ff.cards[ff.currentIndex]
      : undefined;

  return createEducationFastfireScope({
    drill_phase: ff.phase,
    seconds_per_card: config.secondsPerCard,
    live_score_enabled: config.liveScore,
    spoken_fronts_enabled: config.spokenFronts,
    drill_config: { ...config },
    card_count: ff.cards.length,
    current_card_index: ff.currentIndex,
    drill_cards: ff.cards.map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      position: c.position,
    })),
    graded_count: resolved.length,
    ...(ff.sessionId ? { session_id: ff.sessionId } : {}),
    ...(ff.error ? { drill_error: ff.error } : {}),
    ...(config.setId ? { set_id: config.setId } : {}),
    ...(config.setName ? { set_name: config.setName } : {}),
    ...(currentCard
      ? {
          current_card: {
            id: currentCard.id,
            front: currentCard.front,
            back: currentCard.back,
            position: currentCard.position,
          },
        }
      : {}),
    ...(gradeSummary ? { grade_summary: gradeSummary } : {}),
    ...(cardGrades.length > 0 ? { card_grades: cardGrades } : {}),
    ...(ff.sessionReview ? { session_review: ff.sessionReview } : {}),
  });
}
