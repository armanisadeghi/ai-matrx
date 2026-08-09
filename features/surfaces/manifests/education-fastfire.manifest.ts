/**
 * Surface manifest — FastFire (`matrx-user/education-fastfire`).
 *
 * The `/education/fastfire` spoken rapid-drill lane: the learner races a
 * per-card clock through a flashcard set, answering out loud while the mic
 * records continuously; each clip is graded fire-and-forget by the spoken
 * grader agent and the scoreboard fills in live. The whole drill is ONE Redux
 * state machine (`fastFireSlice`) — phase, config, the card queue, per-card
 * grades, and the end-of-session review all live there, which is exactly what
 * this surface emits.
 *
 * Curated groups (band 0-899):
 *
 *   drill    Where the session is: phase, timing config, session identity
 *   deck     The set being drilled and the card currently on screen
 *   scoring  Per-card grades as they resolve + the holistic session review
 *
 * Emitter: `features/flashcards/fast-fire/components/FastFireSurface.tsx`
 * (the phase router — the single client boundary under the route, mounted for
 * the drill's whole lifecycle).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "drill",
    label: "Drill session",
    sortOrder: 100,
    description:
      "The live drill state machine — which phase the session is in, the timing rules it runs under, and the study-spine session identity.",
  },
  {
    key: "deck",
    label: "Deck",
    sortOrder: 200,
    description:
      "The flashcard set loaded into the drill queue, and the card the learner is answering right now.",
  },
  {
    key: "scoring",
    label: "Scoring",
    sortOrder: 300,
    description:
      "Per-card spoken grades as the grader agent resolves them, plus the holistic end-of-session review.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Drill session ─────────────────────────────────────────────────────
  {
    name: "drill_phase",
    label: "Drill phase",
    description:
      'Where the session is in its lifecycle: "idle", "setup", "countdown", "card_recording", "advancing", "finalizing", "complete", or "abandoned". Always present — the state machine always has a phase.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 300,
    group: "drill",
  },
  {
    name: "seconds_per_card",
    label: "Seconds per card",
    description:
      "How long the learner gets to answer each card before the drill advances. Always present — defaults to 12 until the learner tunes it in setup.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 310,
    group: "drill",
  },
  {
    name: "live_score_enabled",
    label: "Live scoring on",
    description:
      "True when running grades are shown during the drill; false when results are held for the scoreboard reveal. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "drill",
  },
  {
    name: "spoken_fronts_enabled",
    label: "Spoken questions on",
    description:
      "True when each card's question is spoken aloud via pre-generated TTS (voice mode). Always present — defaults to false.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 330,
    group: "drill",
  },
  {
    name: "drill_config",
    label: "Drill configuration",
    description:
      "The full timing/behavior config as one object: { setId, setName, secondsPerCard, cardLimit, liveScore, spokenFronts, voiceAnswerSeconds, warningSeconds }. Always present (defaults before setup). Mirrors the individual values (completeness law). Bindable-only.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    autoContext: false,
    sortOrder: 340,
    group: "drill",
  },
  {
    name: "session_id",
    label: "Study session ID",
    description:
      "UUID of the study-spine `study_session` row this drill writes to. Absent until the drill actually starts (setup and countdown have no session yet).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 350,
    group: "drill",
  },
  {
    name: "drill_error",
    label: "Drill error",
    description:
      "Structured error message from a fatal setup/finalize failure (mic denied, upload failed…). Absent on the happy path. Present so an agent can help with the real failure instead of guessing.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 360,
    group: "drill",
  },

  // ── Deck ──────────────────────────────────────────────────────────────
  {
    name: "set_id",
    label: "Flashcard set ID",
    description:
      "UUID of the set loaded into the drill. Absent in setup when the learner arrived without a `?set=` and has not picked one yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
    group: "deck",
  },
  {
    name: "set_name",
    label: "Flashcard set name",
    description:
      "Display name of the loaded set. Absent until a set is chosen and its cards load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 410,
    group: "deck",
  },
  {
    name: "card_count",
    label: "Cards in drill",
    description:
      "How many cards are in the drill queue (after any card limit is applied). Zero until a set's cards load. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 420,
    group: "deck",
  },
  {
    name: "current_card_index",
    label: "Current card index",
    description:
      "Zero-based index of the card being answered right now; -1 before the drill starts and after it ends. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 430,
    group: "deck",
  },
  {
    name: "current_card",
    label: "Current card",
    description:
      "The card on screen as { id, front, back, position }. Absent outside the card_recording/advancing phases (no card is 'current' during setup or on the scoreboard).",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 440,
    group: "deck",
  },
  {
    name: "drill_cards",
    label: "All drill cards",
    description:
      "The full ordered drill queue as { id, front, back, position }. Empty array until a set's cards load. Can be large — bindable-only, so it never silently consumes the context window.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 450,
    group: "deck",
  },

  // ── Scoring ───────────────────────────────────────────────────────────
  {
    name: "graded_count",
    label: "Grades resolved",
    description:
      "How many cards have a resolved grade so far (grades stream in asynchronously after each answer). Zero until the first grade lands. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 500,
    group: "scoring",
  },
  {
    name: "grade_summary",
    label: "Grade summary",
    description:
      "Rollup of resolved grades as { graded, correct, partial, incorrect, pending, errored }. Absent until at least one card has been answered.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 510,
    group: "scoring",
  },
  {
    name: "card_grades",
    label: "Per-card grades",
    description:
      "Every card's grade record as { cardId, status, score, result, transcript, feedback, missing }. Empty until answers start resolving. Large — bindable-only; bind `grade_summary` for automatic context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    sortOrder: 520,
    group: "scoring",
  },
  {
    name: "session_review",
    label: "Session review",
    description:
      "The holistic end-of-session review text (what to work on across the whole run). Absent until the wrap-up resolves on the scoreboard.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 530,
    group: "scoring",
  },
];

export const educationFastfireManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-fastfire",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter shipped for everything the drill state machine holds. Not yet stamped verified: a live non-matching-name binding test and the Matrx-vs-matrix context check have not been run, no agent roles are declared (the spoken grader + TTS agents resolve via agent slots, not surface roles), and no Locate anchors are tagged.",
  label: "FastFire",
  urlPattern: "/education/fastfire",
  intro: `<surface_intro>
You are on FastFire at /education/fastfire — a spoken rapid-fire drill over one flashcard set. The learner answers each card OUT LOUD against a per-card clock; the mic records continuously, each clip is graded asynchronously by a spoken-grader agent, and the scoreboard fills in as grades resolve.
Read drill_phase first — it decides what is true. In "setup" the learner is choosing a set and timing (set values may be absent). During "card_recording"/"advancing" the learner is mid-drill and racing a clock: current_card is what they are answering, and anything you do must not interrupt them. In "finalizing"/"complete" the drill is over and the scoreboard is on screen: grade_summary and session_review are the material to reason about, and graded_count may still be climbing as late grades resolve — do not treat a pending card as wrong.
Grades stream in asynchronously, so absence of a grade means "not resolved yet", never "incorrect". The deck values name the set; per-card records live in card_grades (bindable-only).
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry in `drill_cards` / the `current_card` object. */
export interface FastFireDrillCardSummary {
  id: string;
  front: string;
  back: string;
  position: number;
}

/** One entry in `card_grades`. */
export interface FastFireCardGradeSummary {
  cardId: string;
  status: string;
  score: number | null;
  result: string | null;
  transcript: string | null;
  feedback: string | null;
  missing: string[];
}

/** The `grade_summary` rollup. */
export interface FastFireGradeSummary {
  graded: number;
  correct: number;
  partial: number;
  incorrect: number;
  pending: number;
  errored: number;
}

/** The `drill_config` composite (mirrors `FastFireConfig`). */
export interface FastFireDrillConfig {
  setId: string | null;
  setName: string | null;
  secondsPerCard: number;
  cardLimit: number;
  liveScore: boolean;
  spokenFronts: boolean;
  voiceAnswerSeconds: number;
  warningSeconds: number;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationFastfireScope(values: {
  // alwaysAvailable: true → required
  drill_phase: string;
  seconds_per_card: number;
  live_score_enabled: boolean;
  spoken_fronts_enabled: boolean;
  drill_config: FastFireDrillConfig;
  card_count: number;
  current_card_index: number;
  drill_cards: FastFireDrillCardSummary[];
  graded_count: number;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  session_id?: string;
  drill_error?: string;
  set_id?: string;
  set_name?: string;
  current_card?: FastFireDrillCardSummary;
  grade_summary?: FastFireGradeSummary;
  card_grades?: FastFireCardGradeSummary[];
  session_review?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
