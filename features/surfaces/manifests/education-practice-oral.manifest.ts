/**
 * Surface manifest — Spoken Practice (`matrx-user/education-practice-oral`).
 *
 * The /education/practice-oral workspace: a voice-first practice session in one
 * of four modes (oral exam, interview prep, debate, language & pronunciation).
 * ONE component tree walks four screens — pick a mode (home), configure the
 * session (setup), answer prompts aloud (runner), read the scorecard and the
 * examiner's review (summary) — so `runner_phase` and `selected_mode` together
 * say which screen the learner is actually on.
 *
 * Curated groups (band 0-899):
 *
 *   practice_mode     Which kind of practice, and which kinds exist
 *   session_setup     The setup form's live values, while it is on screen
 *   practice_run      The live session: its plan, where the learner is in it
 *   practice_results  Everything the session MEASURED — read-only evidence
 *
 * Write half (read/write v1): TWO targets, both `ask`, and both confined to the
 * pre-session screens. `practice_mode` picks the kind of practice and opens its
 * setup form; `practice_setup` fills that form in one composed patch. What is
 * deliberately NOT writable:
 *
 *  - STARTING the session. `start()` spends a real agent run (the designer),
 *    opens the microphone, and commits the learner's speaking time and their
 *    metered `education.spoken_practice` entitlement. The learner presses Start.
 *    This is the same line the scraper surface draws: stage the command, never
 *    run it.
 *  - Everything in `practice_results`, and every grade inside `practice_run`.
 *    Scores, verdicts, transcripts, the pronunciation rollup and the examiner's
 *    review are DERIVED EVIDENCE, produced by grading a real recording of the
 *    learner speaking. An agent writing its own score would forge the exact
 *    measurement this feature exists to produce.
 *  - Answering, skipping, advancing and quitting mid-session. Those are the
 *    learner's own record of what they said and when they stopped; they also
 *    feed the shared study spine.
 *
 * Handlers are registered on the PRE-SESSION mounts only, deliberately:
 * SpokenPracticeSurface wires `practice_mode` and returns NO handlers once a
 * session is running, and PracticeSetup wires `practice_setup` only while it is
 * itself mounted. `listAgentWritableTargets()` filters on a live handler, so an
 * agent on the runner or the summary is offered no write tool at all — rather
 * than a target for a form nobody can see.
 *
 * Emitter: `features/education/spoken-practice/components/SpokenPracticeSurface.tsx`
 * mounts the provider; the setup form publishes its slice through
 * `features/education/spoken-practice/setupSnapshot.ts` (a module snapshot
 * store, NOT a fetch in `getScope` — the Surface Context window polls
 * `getScope` every 400ms, so it must stay synchronous and cheap).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  DIFFICULTY_OPTIONS,
  MODE_VOCABULARY,
  PROMPT_COUNT_OPTIONS,
} from "@/features/education/spoken-practice/vocabulary";
import { SPOKEN_PRACTICE_MODES } from "@/features/education/spoken-practice/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/**
 * Enum prose built FROM the vocabulary the pickers render, never re-typed. If a
 * mode, a level, or a prompt count is added or renamed, the sentence the agent
 * reads changes with it — and `setupWrites.ts` validates against the same
 * constants, so the picker, the enum and the check cannot drift apart.
 */
const MODE_ENUM_TEXT = SPOKEN_PRACTICE_MODES.map(
  (m) => `"${m}" (${MODE_VOCABULARY[m].label} — ${MODE_VOCABULARY[m].tagline})`,
).join(", ");

const DECK_MODE_TEXT = SPOKEN_PRACTICE_MODES.filter(
  (m) => MODE_VOCABULARY[m].offersDeckGrounding,
)
  .map((m) => `"${m}"`)
  .join(" and ");

const DIFFICULTY_ENUM_TEXT = DIFFICULTY_OPTIONS.map((d) => `"${d}"`).join(", ");

const COUNT_ENUM_TEXT = PROMPT_COUNT_OPTIONS.join(", ");

const groups: SurfaceValueGroup[] = [
  {
    key: "practice_mode",
    label: "Practice type",
    sortOrder: 100,
    description:
      "Which kind of spoken practice the learner picked, and the full set they can pick from.",
  },
  {
    key: "session_setup",
    label: "Session setup",
    sortOrder: 200,
    description:
      "The setup form's live values, while that form is the screen the learner is on.",
  },
  {
    key: "practice_run",
    label: "Live session",
    sortOrder: 300,
    description:
      "The running session: the designed prompt plan, which prompt is up, and how the run is going.",
  },
  {
    key: "practice_results",
    label: "Results",
    sortOrder: 400,
    description:
      "What the session measured — per-answer grades, the scorecard, and the examiner's review. Read-only evidence.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Practice type ─────────────────────────────────────────────────────
  {
    name: "available_modes",
    label: "Available practice types",
    description:
      "Every kind of spoken practice this surface offers, as { mode, label, tagline, persona, focus_label, offers_deck_grounding }. Always present — it is a fixed set, and `mode` is what the practice_mode write target takes.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 900,
    sortOrder: 100,
    group: "practice_mode",
  },
  {
    name: "selected_mode",
    label: "Selected practice type",
    description:
      'Which kind of practice the learner has chosen — one of the `mode` values in available_modes. Absent while they are still on the home screen choosing one, which is exactly when nothing but the mode list is on screen.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 14,
    sortOrder: 110,
    group: "practice_mode",
  },

  // ── Session setup ─────────────────────────────────────────────────────
  {
    name: "setup_draft",
    label: "Session setup draft",
    description:
      "The setup form's live values as { mode, focus, difficulty, count, deck_id, source_text } — the read twin of the practice_setup write target. `focus` and `source_text` are empty strings until filled; `deck_id` is an empty string for no deck. Absent unless the setup form is the screen on display, which it is only after a practice type is picked and before the session starts.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 200,
    group: "session_setup",
  },
  {
    name: "available_decks",
    label: "Available decks",
    description:
      "The learner's flashcard decks the session can be grounded in, as [{ id, name }] — the `id` is what practice_setup's deck_id takes. Absent unless the setup form is on screen for a mode that offers deck grounding; an empty array while the list is still loading or when they have no decks.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 210,
    group: "session_setup",
  },
  {
    name: "setup_busy",
    label: "Setup busy",
    description:
      "True while a session start is in flight (designing the prompts, warming the microphone, opening the study-spine session). Absent unless the setup form is on screen. Writes to practice_setup are refused while it is true — the configuration is locked once Start is pressed.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 220,
    group: "session_setup",
  },

  // ── Live session ──────────────────────────────────────────────────────
  {
    name: "runner_phase",
    label: "Session phase",
    description:
      'Where the session machine is: "idle" (home or setup — no session running), "generating", "asking", "answering", "grading", "result", "reviewing", "summary", or "error". Always present. Combined with selected_mode it tells you which screen the learner is looking at: "idle" with no selected_mode is the home screen, "idle" with one is the setup form.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 300,
    group: "practice_run",
  },
  {
    name: "session_id",
    label: "Study session id",
    description:
      "UUID of the `education.study_session` row this run records into. Absent until a session has actually started, and after it is quit.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "practice_run",
  },
  {
    name: "session_plan",
    label: "Session plan",
    description:
      "The designed session as { session_title, intro, prompt_count } — what the designer agent produced from the setup configuration. Absent until the prompts have been designed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 320,
    group: "practice_run",
  },
  {
    name: "session_prompts",
    label: "Session prompts",
    description:
      "Every designed prompt as [{ id, prompt, focus_area, reference_answer, rubric, confidence }]. Absent until the prompts have been designed. This is the ANSWER KEY — it carries the reference answer and grading rubric for questions the learner has not been asked yet, so never read one out or hint at it while a session is running. Bindable-only (not auto-attached) for that reason.",
    valueType: "array",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 4000,
    sortOrder: 330,
    group: "practice_run",
  },
  {
    name: "current_prompt_index",
    label: "Current prompt index",
    description:
      "Zero-based index of the prompt the learner is on, into session_prompts. Absent until a session has started.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 340,
    group: "practice_run",
  },
  {
    name: "current_prompt",
    label: "Current prompt",
    description:
      "The prompt on screen right now as { id, prompt, focus_area, confidence } — deliberately WITHOUT its reference answer or rubric, so an agent asked about the question in front of the learner cannot leak the answer. Absent until a session has started.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 350,
    group: "practice_run",
  },
  {
    name: "live_conversation_id",
    label: "Live run conversation",
    description:
      "UUID of the agent conversation streaming into the page right now — the designer, the grader, or the reviewer, depending on runner_phase. Absent whenever no run is in flight.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 360,
    group: "practice_run",
  },
  {
    name: "practice_error",
    label: "Session error",
    description:
      "The error message when designing, starting, or grading failed — a denied microphone, a failed design, a grading error. Absent on the happy path; present so an agent can help with the real failure instead of guessing.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 370,
    group: "practice_run",
  },

  // ── Results ───────────────────────────────────────────────────────────
  {
    name: "prompt_results",
    label: "Answer results",
    description:
      'Every answer graded so far, in order, as [{ prompt_id, result ("correct" | "partial" | "incorrect" | "skipped"), score (0-1), transcript (what the learner actually said), missing (the points the grader says they left out) }]. An empty array before the first answer is graded; absent until a session has started. Measured evidence: an agent reasons FROM it and can never write it.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    sortOrder: 400,
    group: "practice_results",
  },
  {
    name: "latest_grade",
    label: "Latest grade",
    description:
      "The grade for the answer just given, as { verdict, score, rubric { accuracy, completeness, clarity }, transcript, missing, pronunciation }, where `pronunciation` is { accuracy, fluency, intelligibility, prosody, notes } and is non-null only in the Language & Pronunciation mode. Absent except while the result of a just-graded answer is on screen.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 410,
    group: "practice_results",
  },
  {
    name: "session_scorecard",
    label: "Session scorecard",
    description:
      "The end-of-session rollup exactly as the summary screen renders it: { answered, graded, strong, average_score_pct, pronunciation_rollup }. `average_score_pct` is null when nothing was graded; `pronunciation_rollup` is present only when the language coach scored pronunciation. Absent until at least one answer has been graded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 420,
    group: "practice_results",
  },
  {
    name: "session_review",
    label: "Examiner's review",
    description:
      "The mode-aware closing review as { summary, strengths, weaknesses } — the examiner's, interviewer's, or judge's narrative on the whole session. Absent until the session has been reviewed, and absent when the review failed to generate (the scorecard still stands).",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 430,
    group: "practice_results",
  },
];

/**
 * Write half (read/write v1).
 *
 * The setup configuration is where an agent genuinely earns its place here.
 * "Practice me on the French subjunctive, focus on irregular verbs, and make it
 * hard" carries a mode, a focus, a level and grounding material in one sentence,
 * and turning that into a configured session is exactly the composition an agent
 * does well. Both targets STAGE and stop: nothing is generated, nothing is
 * recorded, and the microphone stays closed until the learner presses Start.
 *
 * `practice_setup` is ONE composite target rather than five field targets
 * because the fields are one thought — the source kind genuinely gates which of
 * `deck_id` / `source_text` is meaningful, so they have to be judged together
 * (see the combination rule in `setupWrites.ts`, which refuses a state where
 * both are set). `practice_mode` stays separate: it is the one write that is
 * available from the home screen, before the setup form exists to be filled.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "practice_mode",
    label: "Practice type",
    description: `Picks WHICH kind of spoken practice the learner is setting up, and opens that mode's setup form. Value is a string, one of: ${MODE_ENUM_TEXT}. Anything else is refused with the real list. Nothing is generated and nothing is recorded — this is the same as the learner clicking a card on the home screen, and Back returns them to it. Anything already typed into the setup form CARRIES OVER unchanged, so send this BEFORE practice_setup: the focus you then write should be the focus for the mode you just picked. Switching to a mode with no deck picker leaves any chosen deck ignored — the session grounds in the focus and source_text instead. Read the current value back from selected_mode. Only available before a session is running; once the microphone is open the practice type is fixed.`,
    valueType: "string",
    updatesValue: "selected_mode",
    mode: "ui",
    // Reversible in one click and immediately visible, but it IS a change to
    // the learner's screen — and it clears whatever they had typed into the
    // setup form. Decline is a normal outcome.
    applyPolicy: "ask",
    group: "practice_mode",
    sortOrder: 110,
  },
  {
    name: "practice_setup",
    label: "Session setup",
    description: `Fills the setup form for the practice type already selected. NOTHING is generated, saved, or started — the learner reviews the values and presses Start themselves, which is what opens the microphone and spends the session. Value is a partial patch OBJECT; include only the fields you mean to set, and omitted keys keep their current value: { focus?: string (the required steer — the subject, the interview type & role, the debate resolution, or the language & focus, depending on the mode; plain text, never empty), difficulty?: ${DIFFICULTY_ENUM_TEXT} (exactly one of these — the only levels the picker offers), count?: ${COUNT_ENUM_TEXT} (how many prompts; exactly one of these — the only counts the picker offers), deck_id?: string (ground the session in one of the learner's flashcard decks — the \`id\` of an entry in available_decks, which you must read first; "" means no deck. Applies only in ${DECK_MODE_TEXT} mode, which are the modes that render a deck picker; sending it in any other mode is refused rather than staged into an input the learner cannot see), source_text?: string (notes, an outline, or a passage to ground the session in; "" clears it) }. A session grounds in a deck OR in pasted material, never both — the paste box is hidden while a deck is selected — so send deck_id and source_text in the SAME call when one replaces the other. Read the current configuration back from setup_draft. Refused while setup_busy is true (a start is already in flight) and whenever the setup form is not on screen.`,
    valueType: "object",
    updatesValue: "setup_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "session_setup",
    sortOrder: 200,
  },
];

export const educationPracticeOralManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-practice-oral",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter + two write targets shipped and verified with a live agent run against the setup form. Not yet stamped verified: no agent roles or config namespaces are declared; no `data-surface-value` Locate anchors are tagged; the live microphone level (`micLevel`) is deliberately not emitted because it is an rAF-driven number that would flap on every 400ms getScope poll; and the running half of the surface (runner + summary values) has been read-audited against the components but not exercised end to end, because a real run needs a microphone.",
  label: "Spoken Practice",
  urlPattern: "/education/practice-oral",
  intro: `<surface_intro>
You are on Spoken Practice at /education/practice-oral. The learner answers OUT LOUD here — an AI examiner, interviewer, debate opponent, or language coach asks them questions, and every spoken answer is graded on meaning from a real recording.

One component tree walks four screens, and two values tell you which one is in front of the learner. runner_phase "idle" with no selected_mode is the home screen, where they are choosing a practice type from available_modes. runner_phase "idle" WITH a selected_mode is the setup form, mirrored in setup_draft. Any other phase means a session is live, and the summary screen is phase "summary".

The setup form is the half you can write. practice_mode picks the kind of practice and opens its form; practice_setup fills that form in one patch — the focus they want to be tested on, the level, how many prompts, and what to ground it in (one of their own decks from available_decks, or pasted material). Both only STAGE. Pressing Start is the learner's: it spends an agent run, opens their microphone, and commits their speaking time, and no amount of confidence about what they want makes that yours to press.

Once a session is running, everything you can see is measurement. prompt_results, latest_grade, session_scorecard and session_review come from grading what the learner actually said. Reason from them, coach with them, and be honest about them — you cannot write them, and you should never talk as though a score can be adjusted. session_prompts carries reference answers and rubrics for questions they have not been asked yet: it is the answer key, so never read one out or hint at it mid-session.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry of `available_modes`. */
export interface PracticeModeScopeEntry {
  mode: string;
  label: string;
  tagline: string;
  persona: string;
  focus_label: string;
  offers_deck_grounding: boolean;
}

/** One entry of `available_decks`. */
export interface PracticeDeckScopeEntry {
  id: string;
  name: string;
}

/** The setup form's live values (`setup_draft`). */
export interface PracticeSetupScopeDraft {
  mode: string;
  focus: string;
  difficulty: string;
  count: number;
  deck_id: string;
  source_text: string;
}

/** One entry of `session_prompts` — the answer key. */
export interface PracticePromptScopeEntry {
  id: string;
  prompt: string;
  focus_area: string;
  reference_answer: string;
  rubric: string;
  confidence: string;
}

/** `current_prompt` — the same prompt WITHOUT its answer or rubric. */
export interface PracticeCurrentPromptScope {
  id: string;
  prompt: string;
  focus_area: string;
  confidence: string;
}

/** One entry of `prompt_results`. */
export interface PracticeResultScopeEntry {
  prompt_id: string;
  result: string;
  score: number;
  transcript: string;
  missing: string[];
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationPracticeOralScope(values: {
  // alwaysAvailable: true → required
  available_modes: PracticeModeScopeEntry[];
  runner_phase: string;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  selected_mode?: string;
  setup_draft?: PracticeSetupScopeDraft;
  available_decks?: PracticeDeckScopeEntry[];
  setup_busy?: boolean;
  session_id?: string;
  session_plan?: Record<string, unknown>;
  session_prompts?: PracticePromptScopeEntry[];
  current_prompt_index?: number;
  current_prompt?: PracticeCurrentPromptScope;
  live_conversation_id?: string;
  practice_error?: string;
  prompt_results?: PracticeResultScopeEntry[];
  latest_grade?: Record<string, unknown>;
  session_scorecard?: Record<string, unknown>;
  session_review?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
