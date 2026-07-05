// features/education/study/utils/sessionRestart.ts
//
// Maps a persisted study_session row to the route that starts the same activity
// again (new drill / study run for the same set).

import type { StudySessionRow } from "../types";

/** Where to send the learner to start the same activity again. */
export function resolveSessionRestartHref(
  session: Pick<StudySessionRow, "mode" | "source_set_id">,
): string {
  const setId = session.source_set_id;

  switch (session.mode) {
    case "fast_fire":
      return setId ? `/education/fastfire?set=${setId}` : "/education/fastfire";
    case "classic_review":
    case "flashcards":
      return setId
        ? `/education/flashcards/${setId}/study`
        : "/education/flashcards";
    case "adaptive":
      return "/education/flashcards/review";
    default:
      return setId ? `/education/flashcards/${setId}` : "/education/flashcards";
  }
}
