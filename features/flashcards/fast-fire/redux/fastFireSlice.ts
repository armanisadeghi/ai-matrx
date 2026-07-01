// features/flashcards/fast-fire/redux/fastFireSlice.ts
//
// THE single FastFire state machine. Everything the drill is — phase, the card
// queue, per-card grades, the live scoreboard, and review playback — lives in
// ONE slice. This is hard-requirement #1: the historical failure was a drift of
// loose `useState`s plus a fragile effect; here there is exactly one source of
// truth and one set of transitions.
//
// WHAT IS NOT IN HERE (deliberately):
//   - Audio blobs / the MediaRecorder. Those are binary and would bloat / break
//     Redux serialization, so they live in a module-scoped ref store
//     (`audio/continuousCapture.ts`). Only durable `file_id`s reach this slice.
//   - The deadline timestamp. The rAF loop reads it from a ref (the timer hook),
//     not Redux — a per-frame Redux write would be a re-render storm. The slice
//     only learns the OUTCOME of a card (it advanced) via `advanceCard`.
//
// THE GRADE FLOW (hard-requirement #4): grades NEVER come back by re-reading
// state set in the same tick. A card's clip is uploaded + sent to the grader
// agent fire-and-forget; when the agent resolves, a `gradeResolved` action
// dispatches the result INTO this slice, and the UI re-renders from Redux. The
// drill advances through every card before any grade needs to resolve.
//
// `audioPlayer` is STATE here, not a ref (hard-requirement #5) — the old review
// playback was dead because the player lived in a ref that never re-rendered.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// =============================================================================
// Types
// =============================================================================

/**
 * The drill's lifecycle. Linear with two exits:
 *   idle → setup → countdown → card_recording → advancing → finalizing → complete
 *                                     ↑______________|
 *   (any active phase) → abandoned
 *
 * `card_recording` and `advancing` alternate per card: record the current card,
 * then a brief `advancing` beat (buzzer + slice) before the next card's
 * `card_recording`. After the last card, `finalizing` runs the wrap-up
 * (session audio upload, end-of-session review) and lands on `complete`.
 */
export type FastFirePhase =
  | "idle"
  | "setup"
  | "countdown"
  | "card_recording"
  | "advancing"
  | "finalizing"
  | "complete"
  | "abandoned";

export type GradeResult = "correct" | "partial" | "incorrect";

/** The per-card rubric the grader agent returns (mirrors `fc_grade_spoken`). */
export interface GradeRubric {
  accuracy: number;
  completeness: number;
  clarity: number;
}

/**
 * Per-card grade lifecycle. `pending` = sent to the grader, awaiting result.
 * `skipped` = no grader agent configured (the drill still ran; the attempt was
 * recorded result-less). `resolved` = the grader returned. `error` = the grade
 * attempt failed (recorded loud, never silent).
 */
export type GradeStatus = "idle" | "pending" | "resolved" | "skipped" | "error";

export interface CardGrade {
  cardId: string;
  status: GradeStatus;
  /** Normalized 0..1 score (null until resolved). */
  score: number | null;
  result: GradeResult | null;
  rubric: GradeRubric | null;
  transcript: string | null;
  /** The grader's spoken-feedback TEXT (played back in review). */
  feedback: string | null;
  /** What the learner missed, per the grader. */
  missing: string[];
  /** Durable per-card response clip — drives review playback. */
  responseAudioFileId: string | null;
  /** Set when status === 'error'. */
  error: string | null;
}

/** A card flattened to exactly what the drill needs (front + id + order). */
export interface DrillCard {
  id: string;
  front: string;
  back: string;
  position: number;
  /** Durable file_id of the pre-generated spoken front, if any (optional TTS). */
  spokenFrontFileId?: string | null;
}

export interface FastFireConfig {
  setId: string | null;
  setName: string | null;
  secondsPerCard: number;
  /** Cap the card count (0 / undefined = all cards in the set). */
  cardLimit: number;
  /** Show running grades live, or only reveal at the scoreboard. */
  liveScore: boolean;
  /** Speak each card's question aloud (pre-generated + cached TTS). Default off. */
  spokenFronts: boolean;
}

/** Which subset of cards the review-playback scoreboard is showing. */
export type ReviewFilter = "all" | "correct" | "incorrect";

/**
 * Review playback state. STATE, not a ref (hard-requirement #5). `playingCardId`
 * drives the audio element; the component subscribes and (re)mounts the player.
 */
export interface AudioPlayerState {
  playingCardId: string | null;
  filter: ReviewFilter;
}

export interface FastFireState {
  phase: FastFirePhase;
  config: FastFireConfig;
  /** The ordered drill queue. */
  cards: DrillCard[];
  /** Index of the card currently being recorded (−1 before start). */
  currentIndex: number;
  /** The study_session id (study spine). Null until the session opens. */
  sessionId: string | null;
  /** Full-session recording, uploaded at finalize. */
  sessionAudioFileId: string | null;
  /** Per-card grades, keyed by card id (hard-requirement #4 keys by card id). */
  gradesByCard: Record<string, CardGrade>;
  /** Holistic end-of-session review (fc_review_batch), null until it resolves. */
  sessionReview: string | null;
  audioPlayer: AudioPlayerState;
  /** Structured error string for a fatal setup/finalize failure. */
  error: string | null;
}

// =============================================================================
// Initial state
// =============================================================================

const DEFAULT_CONFIG: FastFireConfig = {
  setId: null,
  setName: null,
  secondsPerCard: 12,
  cardLimit: 0,
  liveScore: true,
  spokenFronts: false,
};

const initialState: FastFireState = {
  phase: "idle",
  config: DEFAULT_CONFIG,
  cards: [],
  currentIndex: -1,
  sessionId: null,
  sessionAudioFileId: null,
  gradesByCard: {},
  sessionReview: null,
  audioPlayer: { playingCardId: null, filter: "all" },
  error: null,
};

function blankGrade(cardId: string): CardGrade {
  return {
    cardId,
    status: "idle",
    score: null,
    result: null,
    rubric: null,
    transcript: null,
    feedback: null,
    missing: [],
    responseAudioFileId: null,
    error: null,
  };
}

// =============================================================================
// Slice
// =============================================================================

const fastFireSlice = createSlice({
  name: "fastFire",
  initialState,
  reducers: {
    /** Open the setup screen (config form). Resets any prior run. */
    openSetup(state, action: PayloadAction<{ setId?: string | null }>) {
      const setId = action.payload.setId ?? state.config.setId ?? null;
      return {
        ...initialState,
        phase: "setup",
        config: { ...DEFAULT_CONFIG, setId },
      };
    },

    /** Patch the config form while in `setup`. */
    updateConfig(state, action: PayloadAction<Partial<FastFireConfig>>) {
      state.config = { ...state.config, ...action.payload };
    },

    /**
     * Begin the drill: lock in the resolved card queue + session id and run the
     * countdown. Cards are already trimmed to `cardLimit` by the caller.
     */
    startDrill(
      state,
      action: PayloadAction<{
        cards: DrillCard[];
        sessionId: string | null;
        setName: string | null;
      }>,
    ) {
      const { cards, sessionId, setName } = action.payload;
      state.phase = "countdown";
      state.cards = cards;
      state.sessionId = sessionId;
      state.config.setName = setName;
      state.currentIndex = -1;
      state.gradesByCard = {};
      for (const c of cards) state.gradesByCard[c.id] = blankGrade(c.id);
      state.sessionAudioFileId = null;
      state.sessionReview = null;
      state.error = null;
    },

    /** Countdown finished → record the first card. */
    beginRecording(state) {
      if (state.cards.length === 0) {
        state.phase = "finalizing";
        return;
      }
      state.phase = "card_recording";
      state.currentIndex = 0;
    },

    /**
     * The deadline fired (or the user skipped) for the current card. Move to the
     * `advancing` beat. The drill hook owns the per-card slice + buzzer here.
     */
    advanceCard(state) {
      state.phase = "advancing";
    },

    /**
     * Commit the advance: either record the next card or, if the queue is
     * exhausted, go to `finalizing`.
     */
    commitAdvance(state) {
      const nextIndex = state.currentIndex + 1;
      if (nextIndex >= state.cards.length) {
        state.phase = "finalizing";
        state.currentIndex = state.cards.length;
        return;
      }
      state.currentIndex = nextIndex;
      state.phase = "card_recording";
    },

    /** Mark a card's grade as in-flight (clip sent to the grader agent). */
    gradePending(
      state,
      action: PayloadAction<{
        cardId: string;
        responseAudioFileId: string | null;
        runId: string | null;
      }>,
    ) {
      // M4: ignore a result from a PREVIOUS run. In-flight grade thunks can
      // resolve late, after `restart()`/`openSetup()` reset state and a new run
      // started — writing a stale grade would corrupt the new drill. Each grade
      // dispatch is stamped with the run's sessionId; drop any whose runId no
      // longer matches the current session.
      if (action.payload.runId !== state.sessionId) return;
      const { cardId, responseAudioFileId } = action.payload;
      const grade = state.gradesByCard[cardId] ?? blankGrade(cardId);
      grade.status = "pending";
      grade.responseAudioFileId = responseAudioFileId;
      state.gradesByCard[cardId] = grade;
    },

    /**
     * The grader agent returned — fold its result into the slice. This is the
     * ONLY way a grade reaches the UI: through Redux, never a same-tick re-read
     * of state set elsewhere (the §5.3 killer bug, now structurally impossible).
     */
    gradeResolved(
      state,
      action: PayloadAction<{
        cardId: string;
        runId: string | null;
        score: number;
        result: GradeResult;
        rubric: GradeRubric;
        transcript: string;
        feedback: string;
        missing: string[];
      }>,
    ) {
      const p = action.payload;
      // M4: drop a stale grade from a previous run (see gradePending).
      if (p.runId !== state.sessionId) return;
      const grade = state.gradesByCard[p.cardId] ?? blankGrade(p.cardId);
      grade.status = "resolved";
      grade.score = p.score;
      grade.result = p.result;
      grade.rubric = p.rubric;
      grade.transcript = p.transcript;
      grade.feedback = p.feedback;
      grade.missing = p.missing;
      grade.error = null;
      state.gradesByCard[p.cardId] = grade;
    },

    /** No grader configured — the attempt was recorded result-less. */
    gradeSkipped(
      state,
      action: PayloadAction<{
        cardId: string;
        responseAudioFileId: string | null;
        runId: string | null;
      }>,
    ) {
      // M4: drop a stale grade from a previous run (see gradePending).
      if (action.payload.runId !== state.sessionId) return;
      const { cardId, responseAudioFileId } = action.payload;
      const grade = state.gradesByCard[cardId] ?? blankGrade(cardId);
      grade.status = "skipped";
      grade.responseAudioFileId = responseAudioFileId;
      state.gradesByCard[cardId] = grade;
    },

    /** A grade attempt failed (loud, never silent). */
    gradeFailed(
      state,
      action: PayloadAction<{ cardId: string; error: string; runId: string | null }>,
    ) {
      // M4: drop a stale grade from a previous run (see gradePending).
      if (action.payload.runId !== state.sessionId) return;
      const { cardId, error } = action.payload;
      const grade = state.gradesByCard[cardId] ?? blankGrade(cardId);
      grade.status = "error";
      grade.error = error;
      state.gradesByCard[cardId] = grade;
    },

    /** Stamp the durable full-session recording (uploaded at finalize). */
    setSessionAudio(state, action: PayloadAction<{ fileId: string }>) {
      state.sessionAudioFileId = action.payload.fileId;
    },

    /** Append the holistic end-of-session review text. */
    setSessionReview(state, action: PayloadAction<{ review: string }>) {
      state.sessionReview = action.payload.review;
    },

    /** Finalize done → scoreboard. */
    completeDrill(state) {
      state.phase = "complete";
    },

    /** User abandoned mid-drill (back, navigate away, error). */
    abandonDrill(state, action: PayloadAction<{ error?: string } | undefined>) {
      state.phase = "abandoned";
      state.error = action.payload?.error ?? null;
    },

    /** A fatal setup/finalize error — surface it, never swallow. */
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },

    // ─── Review playback (audioPlayer is STATE) ──────────────────────────────
    playCard(state, action: PayloadAction<{ cardId: string }>) {
      state.audioPlayer.playingCardId = action.payload.cardId;
    },

    stopPlayback(state) {
      state.audioPlayer.playingCardId = null;
    },

    setReviewFilter(state, action: PayloadAction<{ filter: ReviewFilter }>) {
      state.audioPlayer.filter = action.payload.filter;
    },

    /** Full reset back to idle (leaving the surface). */
    resetFastFire() {
      return initialState;
    },
  },
});

export const {
  openSetup,
  updateConfig,
  startDrill,
  beginRecording,
  advanceCard,
  commitAdvance,
  gradePending,
  gradeResolved,
  gradeSkipped,
  gradeFailed,
  setSessionAudio,
  setSessionReview,
  completeDrill,
  abandonDrill,
  setError,
  playCard,
  stopPlayback,
  setReviewFilter,
  resetFastFire,
} = fastFireSlice.actions;

export default fastFireSlice.reducer;
