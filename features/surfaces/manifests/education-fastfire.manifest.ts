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
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  DRILL_CONFIG_BOUNDS,
  type FastFireConfig,
} from "@/features/flashcards/fast-fire/drill-config";
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

/**
 * Write half of the 360 loop — what an agent may WRITE into the FastFire DRILL
 * SETUP form, and (just as deliberately) what it may not.
 *
 * ONE target, on purpose. The judgment call, written down:
 *
 * WHAT EARNS IT. The setup screen is a planning form, and the plan is genuinely
 * derivable from what the learner says: "I've got five minutes before class" is
 * a card count plus a pace; "read them to me, I'm walking" is voice mode plus a
 * shorter answer window. Those are four real fields an agent can compute
 * (`secondsPerCard`, `cardLimit`, `voiceAnswerSeconds`, `spokenFronts`), plus
 * two cheap companions the learner sets in the same breath (`warningSeconds`,
 * `liveScore`). They are edited TOGETHER on one screen, in one decision, so per
 * the skill's own preference they are ONE object target with a partial patch —
 * not six micro-targets producing six confirm dialogs for a single ask.
 *
 * WHAT DOES NOT, AND WHY:
 *   • The SET PICKER (`setId`/`setName`) is not writable, for exactly the
 *     reason `education-assessment` left its deck/document pickers out: the
 *     surface exposes no options to choose FROM. The read half publishes only
 *     the set already loaded (`set_id`/`set_name`) — the learner's library
 *     lives in `FastFireSetup`'s local React state and never reaches the scope.
 *     An agent handed a `set_id` target could only guess a UUID, and a
 *     confidently-wrong deck is worse than no target at all. If the library is
 *     ever published as a read value, this becomes a good second target.
 *   • RUNNING the drill — start, skip a card, abort, replay, grade — stays
 *     human. These are the learner's own study actions; the whole point of
 *     FastFire is that THEY answer out loud against a clock. An agent driving
 *     the clock would be driving the study session itself.
 *   • The scoreboard's review filter is pure view state (`all|correct|
 *     incorrect`) — the mechanical-toggle class the bar excludes.
 *
 * MODE + POLICY. `draft` + `ask`: the handler dispatches the SAME
 * `updateConfig` action the learner's own slider dragging dispatches, so the
 * value appears on the setup form, is visibly reversible by dragging, and
 * reaches nothing durable — the drill only opens a `study_session` when the
 * USER presses "Start FastFire", which is also where the mic prompt and the
 * `education.live_grade` entitlement gate run. Nothing here spends quota,
 * records an attempt, or writes a row.
 *
 * MOUNTS. This surface has exactly ONE mount —
 * `FastFireSurface.tsx`, the phase router, which wraps the drill's whole
 * lifecycle and owns the slice the config lives in. It registers this handler.
 * There is no second mount to reason about (the sibling `CaptureTestSurface` is
 * an audio-debug harness that mounts no surface at all). The handler is
 * nonetheless PHASE-GUARDED rather than mount-guarded: the same provider stays
 * mounted through `countdown`/`card_recording`/`complete`, where the setup form
 * is off screen and the config is already locked into the running drill, so a
 * patch outside `setup` is refused with an error saying so.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "drill_config",
    label: "Drill configuration",
    description: `Stages the drill's pace and behavior into the FastFire setup form, before the learner starts. Accepts a PARTIAL object — include only the fields you mean to change; omitted fields keep their current value (read drill_config first to see them). Writable fields: secondsPerCard (whole number ${DRILL_CONFIG_BOUNDS.secondsPerCard.min}-${DRILL_CONFIG_BOUNDS.secondsPerCard.max}, the answer clock per card); cardLimit (whole number ${DRILL_CONFIG_BOUNDS.cardLimit.min}-${DRILL_CONFIG_BOUNDS.cardLimit.max}, where 0 means every card in the set); warningSeconds (whole number ${DRILL_CONFIG_BOUNDS.warningSeconds.min}-${DRILL_CONFIG_BOUNDS.warningSeconds.max}, seconds-left for the warning beep, 0 = off); liveScore (boolean, show grades during the drill vs only on the scoreboard); spokenFronts (boolean, read each question aloud — voice mode); voiceAnswerSeconds (whole number ${DRILL_CONFIG_BOUNDS.voiceAnswerSeconds.min}-${DRILL_CONFIG_BOUNDS.voiceAnswerSeconds.max}, voice-mode answer window, and it may not exceed secondsPerCard). Out-of-range or wrongly-typed values are REJECTED, never clamped. Only these fields are accepted — notably the flashcard set is NOT writable here; the learner picks that themselves. Applies only while the setup screen is up (drill_phase "setup"); once the drill is running the config is locked. The user still presses Start FastFire.`,
    valueType: "object",
    updatesValue: "drill_config",
    mode: "draft",
    applyPolicy: "ask",
    group: "drill",
    sortOrder: 100,
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
  writeTargets,
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

/**
 * The `drill_config` composite. Aliased to the canonical `FastFireConfig`
 * rather than re-declared: this is both the read value's shape and the write
 * target's field vocabulary, so a hand-copied mirror here would be a silent
 * drift path the moment a setting is added.
 */
export type FastFireDrillConfig = FastFireConfig;

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
