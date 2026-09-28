/**
 * Surface manifest — Solo Arcade live round (`matrx-user/education-game-solo`).
 *
 * `/education/game/solo` (`SoloArcadeImpl.tsx`) previously had NO surface of
 * its own — the route fell through the `/education/game` prefix to
 * `matrx-user/education-game`, whose `solo_*` values were declared but never
 * emitted (see that manifest's header). An agent helping here was blind to
 * the live round: it could not see the current question, the answer choices,
 * the score/streak, or what the learner had just gotten wrong.
 *
 * VIEW-ONLY. `answer(choiceIndex)` is a human-pressed timed button inside a
 * scored round (`useGamePlay`'s `answer`) — the same "one deliberate button,
 * not an agent write target" judgment as `education-game`'s host/join
 * composers. "Play again" / "Exit" are navigation, not writes. No
 * `writeTargets` are declared.
 *
 * `misses` (what the learner just got wrong) needed a small engine change:
 * `useGamePlay`'s `lastAnswer` clears 700ms after each answer (the reveal →
 * advance transition), too narrow a window for an agent to reliably read. The
 * hook now also accumulates a `misses: GameMiss[]` list for the whole round
 * (`features/education/engage/data/useGamePlay.ts`), which this surface
 * exposes as `recent_misses`.
 *
 * Emitter: `features/education/engage/components/solo/SoloArcadeImpl.tsx`
 * (`SoloRound`), scope built in-file below from the live `useGamePlay` result.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import type { GameMiss } from "@/features/education/engage/data/useGamePlay";

export const EDUCATION_GAME_SOLO_SURFACE_NAME = "matrx-user/education-game-solo";

const groups: SurfaceValueGroup[] = [
  {
    key: "round_state",
    label: "Round state",
    sortOrder: 100,
    description:
      "Where the round is right now — read first; it decides which of the other groups carry values.",
  },
  {
    key: "current_question",
    label: "Current question",
    sortOrder: 200,
    description:
      "The question on screen right now: its prompt and answer choices, and (briefly, right after answering) whether the pick was correct.",
  },
  {
    key: "scoreboard",
    label: "Scoreboard",
    sortOrder: 300,
    description: "The learner's live score, streak and in-round currency.",
  },
  {
    key: "mistakes",
    label: "Mistakes this round",
    sortOrder: 400,
    description:
      "Every question the learner has gotten wrong so far this round, so an agent can explain a recent miss even after the reveal has passed.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Round state ────────────────────────────────────────────────────────
  {
    name: "phase",
    label: "Round phase",
    description:
      '"loading" (building the queue), "playing" (a live round), "finished" (round over, results shown) or "error" (the round could not start or a write failed). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "round_state",
  },
  {
    name: "source_kind",
    label: "Question source",
    description:
      '"due" (the learner\'s cross-deck due/weak queue — the adaptive default, used when no deck was picked) or "set" (one specific flashcard deck, from a ?set= deep link). Always present once the round has loaded (absent only while "loading").',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 110,
    group: "round_state",
  },
  {
    name: "source_title",
    label: "Source deck name",
    description:
      "Name of the deck the round is drawing from. Absent when the source is the due/weak queue rather than one named deck.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 120,
    group: "round_state",
  },
  {
    name: "remaining_seconds",
    label: "Time left",
    description:
      "Seconds left on the round's countdown clock, rounded up. Present only while playing.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 130,
    group: "round_state",
  },

  // ── Current question ──────────────────────────────────────────────────
  {
    name: "question_number",
    label: "Question number",
    description:
      "1-based position of the current question in the round's queue. Present only while playing.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 200,
    group: "current_question",
  },
  {
    name: "question_total",
    label: "Questions in queue",
    description:
      "Total questions built into this round's queue (up to 20). Present only while playing.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 210,
    group: "current_question",
  },
  {
    name: "question_prompt",
    label: "Current question",
    description:
      "The prompt text shown for the question on screen right now (the flashcard's front). Present only while playing.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 220,
    group: "current_question",
  },
  {
    name: "question_choices",
    label: "Answer choices",
    description:
      "The current question's answer choices in on-screen order, exactly one of which is correct. Present only while playing.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 230,
    group: "current_question",
  },
  {
    name: "question_is_due",
    label: "Due for review",
    description:
      'True when the current question is flagged "Due for review" (SRS-biased pick) on screen. Present only while playing.',
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 240,
    group: "current_question",
  },
  {
    name: "last_answer",
    label: "Just answered",
    description:
      'The learner\'s pick on the question they just answered, as { correct, chosen_text, correct_text } — shown during the brief reveal before the next question loads. Absent before they answer and after the reveal ends (use recent_misses for anything wrong once this clears).',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 250,
    group: "current_question",
  },

  // ── Scoreboard ─────────────────────────────────────────────────────────
  {
    name: "score",
    label: "Score",
    description: "The learner's running score this round. Present once the round has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "scoreboard",
  },
  {
    name: "streak",
    label: "Current streak",
    description:
      "Consecutive correct answers right now (a shield power-up can preserve it through one wrong answer). Present once the round has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 310,
    group: "scoreboard",
  },
  {
    name: "best_streak",
    label: "Best streak",
    description: "The longest streak reached so far this round. Present once the round has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 320,
    group: "scoreboard",
  },
  {
    name: "currency",
    label: "Coins",
    description:
      "In-round currency earned, spendable on power-ups (double points, shield, 50/50). Present once the round has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 330,
    group: "scoreboard",
  },
  {
    name: "mastery_gain",
    label: "Mastery gained",
    description:
      "Real FSRS retrievability gain measured from this round's answers so far (the same number shown on the HUD). Present once the round has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 340,
    group: "scoreboard",
  },
  {
    name: "answered_count",
    label: "Questions answered",
    description: "How many questions the learner has answered so far this round.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 350,
    group: "scoreboard",
  },
  {
    name: "correct_count",
    label: "Correct answers",
    description: "How many of those answers were correct.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 360,
    group: "scoreboard",
  },

  // ── Mistakes ───────────────────────────────────────────────────────────
  {
    name: "recent_misses",
    label: "Recent mistakes",
    description:
      'Every question missed so far this round, oldest first, each as { prompt, chosen_text, correct_text }. Unlike last_answer this does NOT clear after the reveal — it is how an agent answers "what did I just get wrong?" mid-round. Empty array when the learner hasn\'t missed anything yet.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 400,
    group: "mistakes",
  },
  {
    name: "misses_count",
    label: "Mistake count",
    description: "How many questions have been missed so far this round.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 410,
    group: "mistakes",
  },
];

export const educationGameSoloManifest: SurfaceManifest = {
  surfaceName: EDUCATION_GAME_SOLO_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Live solo-arcade round: current question, choices, score, streak and recent mistakes (/education/game/solo).",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter wired 2026-09-28 with the misses fix in useGamePlay. Not yet: no data-surface-value Locate anchors tagged; no live-agent-run/Matrx-vs-matrix binding test performed beyond the surface:probe read-only check; finished-round outcome (final results screen) is not yet declared as its own values — only the live in-progress round.",
  label: "Solo Arcade — Live Round",
  urlPattern: "/education/game/solo",
  intro: `<surface_intro>
You are watching a live Solo Arcade round at /education/game/solo — single-player spaced-repetition trivia against the learner's due/weak flashcard queue (or one deck, if launched with a deck link). Read \`phase\` first: "loading" (queue building), "playing" (a live round — the rest of this surface's values are populated), "finished" (round over) or "error".
While playing: \`question_prompt\` and \`question_choices\` are the question on screen right now; \`question_number\`/\`question_total\` is the position in the queue; \`remaining_seconds\` is the countdown. \`score\`, \`streak\`, \`best_streak\`, \`currency\` and \`mastery_gain\` are the live HUD numbers.
\`last_answer\` appears only for the brief reveal right after the learner answers, then clears. For anything the learner got wrong earlier in the round, read \`recent_misses\` instead — it accumulates every miss this round and never clears, so it is the reliable way to answer "what did I just get wrong?".
Nothing here is agent-writable: answering, buying a power-up, and exiting are all deliberate button presses the learner makes themselves.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

export interface SoloRoundLastAnswer {
  correct: boolean;
  chosen_text: string;
  correct_text: string;
}

export interface SoloRoundMiss {
  prompt: string;
  chosen_text: string;
  correct_text: string;
}

function toSoloMiss(m: GameMiss): SoloRoundMiss {
  return { prompt: m.prompt, chosen_text: m.chosenText, correct_text: m.correctText };
}

/** Maps a raw `useGamePlay` `misses` array into the surface's `recent_misses` shape. */
export function mapSoloMisses(misses: GameMiss[]): SoloRoundMiss[] {
  return misses.map(toSoloMiss);
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationGameSoloScope(values: {
  // alwaysAvailable: true → required
  phase: "loading" | "playing" | "finished" | "error";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  source_kind?: "due" | "set";
  source_title?: string;
  remaining_seconds?: number;
  question_number?: number;
  question_total?: number;
  question_prompt?: string;
  question_choices?: string[];
  question_is_due?: boolean;
  last_answer?: SoloRoundLastAnswer;
  score?: number;
  streak?: number;
  best_streak?: number;
  currency?: number;
  mastery_gain?: number;
  answered_count?: number;
  correct_count?: number;
  recent_misses?: SoloRoundMiss[];
  misses_count?: number;
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
