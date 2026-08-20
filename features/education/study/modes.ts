// features/education/study/modes.ts
//
// THE STUDY SPINE'S MODE VOCABULARY — one canonical place naming every way a
// learner practices. `study_session.mode` is a free-form text column on purpose
// (adding a mode is a value, never a migration), so this file is the vocabulary
// register, not an enum the DB enforces.
//
// Why it exists: the same `MODE_LABEL` map was hand-copied into
// `utils/sessionListDisplay.ts` AND `components/SessionDetailView.tsx`, and
// BOTH copies had drifted — they named six modes while the spine actually
// records at least a dozen (`match`, `weak_area`, `test`, `learn`, `write`,
// `game`, `grade_work`, and the four spoken-practice modes all fell through to
// the raw-underscore fallback). One register, imported by every surface.
//
// 🚨 IT IS ALSO A LOAD-BEARING INPUT TO A COMMERCIAL INVARIANT. Program law D-5
// ("core practice is never metered") is guarded by
// `features/entitlements/__tests__/core-practice-never-metered.test.ts`, which
// derives its forbidden capability vocabulary from the study spine itself —
// including the keys below. Adding a mode here automatically extends that guard
// to cover it. See `features/entitlements/FEATURE.md` § THE CORE-PRACTICE LAW.

/**
 * Human labels for every `study_session.mode` the platform writes today.
 *
 * Keyed by the exact string the launching surface passes to
 * `studyService.createSession({ mode })`. Extend this when you add a mode —
 * an unlabelled mode renders as its raw token in every history surface.
 */
export const STUDY_MODE_LABELS: Record<string, string> = {
  // Flashcards — the classic spine
  classic_review: "Study",
  flashcards: "Study",
  learn: "Learn",
  write: "Write",
  match: "Match",
  test: "Test",
  // Scheduling-driven practice
  adaptive: "Adaptive",
  weak_area: "Weak-area drill",
  // FastFire
  fast_fire: "Fast Fire",
  // Assessment
  quiz: "Quiz",
  practice_test: "Practice Test",
  grade_work: "Grade My Work",
  // Engage (multiplayer)
  game: "Game",
  // Spoken practice
  oral_exam: "Oral Exam",
  interview_prep: "Interview Prep",
  debate: "Debate",
  pronunciation: "Pronunciation",
};

/** Every mode token the spine knows about, as a plain list. */
export const STUDY_MODES: string[] = Object.keys(STUDY_MODE_LABELS);

/**
 * Human label for a persisted `study_session.mode`. Falls back to the
 * de-underscored token so an unregistered mode still reads as words.
 */
export function sessionModeLabel(mode: string | null | undefined): string {
  if (!mode) return "Session";
  return STUDY_MODE_LABELS[mode] ?? mode.replace(/_/g, " ");
}
