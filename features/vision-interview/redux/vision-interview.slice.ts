// features/vision-interview/redux/vision-interview.slice.ts
//
// Light room state for the Vision Interview room:
//   - room data (session / turns / questions / holes / revision summaries),
//     hydrated in ONE batched dispatch and merged row-by-row from realtime
//     through a timestamp-monotonic echo guard (supabase-realtime skill rule 1,
//     applied INSIDE the reducer merge so refetch races cannot bypass it);
//   - run choreography (phase, active speaker from node events, pending
//     human-input interrupt, sessionId → requestId adoption map).
//
// Live STREAMING state stays in `activeRequests` via adoptForeignStream —
// this slice never duplicates the execution system; it only remembers which
// requestId a session's run was adopted under.

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type { RevisionSummary } from "../service";
import {
  normalizeStage,
  questionCategory,
  STAGES,
  type InterviewHoleRow,
  type InterviewQuestionRow,
  type InterviewSessionRow,
  type InterviewTurnRow,
  type QuestionCategory,
  type RoleKey,
} from "../types";

export type RunPhase =
  | "idle"
  | "starting"
  | "running"
  | "waiting_human"
  | "complete"
  | "error";

export type RoleActivity = "active" | "done";

export interface PendingInterrupt {
  checkpointId: string;
  /** What the run is asking the human, when the interrupt payload carries it. */
  prompt: string | null;
}

interface VisionInterviewState {
  /** The session currently open in the room. One room at a time. */
  sessionId: string | null;
  session: InterviewSessionRow | null;
  turns: Record<string, InterviewTurnRow>;
  questions: Record<string, InterviewQuestionRow>;
  holes: Record<string, InterviewHoleRow>;
  revisions: RevisionSummary[];
  hydrated: boolean;

  runPhase: RunPhase;
  runId: string | null;
  runError: string | null;
  activeSpeaker: RoleKey | null;
  /** Which roles have spoken (or are speaking) this round — the room strip. */
  roleActivity: Partial<Record<RoleKey, RoleActivity>>;
  pendingInterrupt: PendingInterrupt | null;

  /** sessionId → requestId the run stream was adopted under (activeRequests). */
  requestIdBySession: Record<string, string>;

  /** Text another surface (e.g. a question's Answer button) asked the
   *  composer to append. The composer consumes and clears it. */
  composerInsert: string | null;
}

const initialState: VisionInterviewState = {
  sessionId: null,
  session: null,
  turns: {},
  questions: {},
  holes: {},
  revisions: [],
  hydrated: false,
  runPhase: "idle",
  runId: null,
  runError: null,
  activeSpeaker: null,
  roleActivity: {},
  pendingInterrupt: null,
  requestIdBySession: {},
  composerInsert: null,
};

/**
 * Timestamp-monotonic echo guard (skill rule 1):
 *   - strictly older `updated_at` than local → stale, drop;
 *   - equal `updated_at` → drop only when content also matches (a
 *     same-millisecond collaborator write must still land);
 *   - unparseable timestamps → degrade to DELIVERING unless byte-identical.
 */
function isStaleMerge(
  local: { updated_at: string } | undefined,
  incoming: { updated_at: string },
): boolean {
  if (!local) return false;
  const contentEqual = JSON.stringify(local) === JSON.stringify(incoming);
  const a = Date.parse(local.updated_at);
  const b = Date.parse(incoming.updated_at);
  if (Number.isNaN(a) || Number.isNaN(b)) return contentEqual;
  if (b < a) return true;
  if (b === a) return contentEqual;
  return false;
}

export interface RoomHydrationPayload {
  sessionId: string;
  session: InterviewSessionRow | null;
  turns: InterviewTurnRow[];
  questions: InterviewQuestionRow[];
  holes: InterviewHoleRow[];
  revisions: RevisionSummary[];
}

const visionInterviewSlice = createSlice({
  name: "visionInterview",
  initialState,
  reducers: {
    roomOpened(state, action: PayloadAction<{ sessionId: string }>) {
      if (state.sessionId === action.payload.sessionId) return;
      const keepAdoptions = state.requestIdBySession;
      Object.assign(state, initialState);
      state.requestIdBySession = keepAdoptions;
      state.sessionId = action.payload.sessionId;
    },

    /** ONE batched dispatch for the whole room load / catch-up refetch —
     *  never a dispatch-per-row loop (skill rule 2). */
    roomHydrated(state, action: PayloadAction<RoomHydrationPayload>) {
      const p = action.payload;
      if (state.sessionId !== p.sessionId) return;
      if (
        p.session &&
        (!state.session || !isStaleMerge(state.session, p.session))
      ) {
        state.session = p.session;
      }
      for (const t of p.turns) {
        if (!isStaleMerge(state.turns[t.id], t)) state.turns[t.id] = t;
      }
      for (const q of p.questions) {
        if (!isStaleMerge(state.questions[q.id], q)) state.questions[q.id] = q;
      }
      for (const h of p.holes) {
        if (!isStaleMerge(state.holes[h.id], h)) state.holes[h.id] = h;
      }
      state.revisions = p.revisions;
      state.hydrated = true;
    },

    // ── Row merges (realtime payloads AND optimistic write results) ─────────

    turnMerged(state, action: PayloadAction<InterviewTurnRow>) {
      const row = action.payload;
      if (row.session_id !== state.sessionId) return;
      if (isStaleMerge(state.turns[row.id], row)) return;
      state.turns[row.id] = row;
    },

    questionMerged(state, action: PayloadAction<InterviewQuestionRow>) {
      const row = action.payload;
      if (row.session_id !== state.sessionId) return;
      if (isStaleMerge(state.questions[row.id], row)) return;
      state.questions[row.id] = row;
    },

    holeMerged(state, action: PayloadAction<InterviewHoleRow>) {
      const row = action.payload;
      if (row.session_id !== state.sessionId) return;
      if (isStaleMerge(state.holes[row.id], row)) return;
      state.holes[row.id] = row;
    },

    /** Revert of a failed optimistic write — deliberately BYPASSES the
     *  monotonic guard (the revert target is older than the optimistic row). */
    questionForced(state, action: PayloadAction<InterviewQuestionRow>) {
      if (action.payload.session_id !== state.sessionId) return;
      state.questions[action.payload.id] = action.payload;
    },

    /** See questionForced. */
    holeForced(state, action: PayloadAction<InterviewHoleRow>) {
      if (action.payload.session_id !== state.sessionId) return;
      state.holes[action.payload.id] = action.payload;
    },

    sessionMerged(state, action: PayloadAction<InterviewSessionRow>) {
      const row = action.payload;
      if (row.id !== state.sessionId) return;
      if (state.session && isStaleMerge(state.session, row)) return;
      // Round rollover clears the per-round role strip.
      if (state.session && row.current_round !== state.session.current_round) {
        state.roleActivity = {};
      }
      state.session = row;
    },

    revisionsLoaded(state, action: PayloadAction<RevisionSummary[]>) {
      state.revisions = action.payload;
    },

    // ── Run choreography (from adopted workflow stream events) ──────────────

    runStarting(state) {
      state.runPhase = "starting";
      state.runError = null;
      state.pendingInterrupt = null;
    },

    runStarted(state, action: PayloadAction<{ runId: string | null }>) {
      state.runPhase = "running";
      if (action.payload.runId) state.runId = action.payload.runId;
      state.roleActivity = {};
      state.activeSpeaker = null;
    },

    nodeStarted(state, action: PayloadAction<{ role: RoleKey }>) {
      state.activeSpeaker = action.payload.role;
      state.roleActivity[action.payload.role] = "active";
      state.runPhase = "running";
    },

    nodeCompleted(state, action: PayloadAction<{ role: RoleKey }>) {
      state.roleActivity[action.payload.role] = "done";
      if (state.activeSpeaker === action.payload.role) {
        state.activeSpeaker = null;
      }
    },

    runInterrupted(state, action: PayloadAction<PendingInterrupt>) {
      state.runPhase = "waiting_human";
      state.activeSpeaker = null;
      state.pendingInterrupt = action.payload;
    },

    /** `run_resumed` on the events feed — the interrupt was answered
     *  (possibly by an earlier client). Also converges the SSE backlog
     *  replay: a stale `run_interrupted` replayed from history is cancelled
     *  by the `run_resumed` that follows it in seq order. */
    runResumed(state) {
      state.runPhase = "running";
      state.pendingInterrupt = null;
    },

    runCompleted(state) {
      state.runPhase = "complete";
      state.activeSpeaker = null;
      state.pendingInterrupt = null;
    },

    runFailed(state, action: PayloadAction<{ message: string }>) {
      state.runPhase = "error";
      state.activeSpeaker = null;
      state.runError = action.payload.message;
    },

    streamAdopted(
      state,
      action: PayloadAction<{ sessionId: string; requestId: string }>,
    ) {
      state.requestIdBySession[action.payload.sessionId] =
        action.payload.requestId;
    },

    /** A surface (e.g. a question's Answer button) hands text to the
     *  composer. Appends when an insert is already pending un-consumed. */
    composerInsertRequested(state, action: PayloadAction<{ text: string }>) {
      state.composerInsert = state.composerInsert
        ? `${state.composerInsert}\n\n${action.payload.text}`
        : action.payload.text;
    },

    composerInsertConsumed(state) {
      state.composerInsert = null;
    },
  },
});

export const {
  roomOpened,
  roomHydrated,
  turnMerged,
  questionMerged,
  holeMerged,
  questionForced,
  holeForced,
  sessionMerged,
  revisionsLoaded,
  runStarting,
  runStarted,
  nodeStarted,
  nodeCompleted,
  runInterrupted,
  runResumed,
  runCompleted,
  runFailed,
  streamAdopted,
  composerInsertRequested,
  composerInsertConsumed,
} = visionInterviewSlice.actions;

export default visionInterviewSlice.reducer;

// ── Selectors (all memoized; one property, one selector) ────────────────────

const selectSelf = (state: RootState) => state.visionInterview;

export const selectRoomSessionId = (state: RootState) =>
  selectSelf(state).sessionId;
export const selectRoomSession = (state: RootState) => selectSelf(state).session;
export const selectRoomHydrated = (state: RootState) =>
  selectSelf(state).hydrated;
export const selectRunPhase = (state: RootState) => selectSelf(state).runPhase;
export const selectRunError = (state: RootState) => selectSelf(state).runError;
export const selectRunId = (state: RootState) => selectSelf(state).runId;
export const selectActiveSpeaker = (state: RootState) =>
  selectSelf(state).activeSpeaker;
export const selectRoleActivity = (state: RootState) =>
  selectSelf(state).roleActivity;
export const selectPendingInterrupt = (state: RootState) =>
  selectSelf(state).pendingInterrupt;
export const selectRevisions = (state: RootState) =>
  selectSelf(state).revisions;
export const selectComposerInsert = (state: RootState) =>
  selectSelf(state).composerInsert;

export const selectRoomRequestId = (state: RootState): string | null => {
  const s = selectSelf(state);
  return s.sessionId ? (s.requestIdBySession[s.sessionId] ?? null) : null;
};

const selectTurnsMap = (state: RootState) => selectSelf(state).turns;
const selectQuestionsMap = (state: RootState) => selectSelf(state).questions;
const selectHolesMap = (state: RootState) => selectSelf(state).holes;

/** Transcript order: round, then position, then id — total order. */
export const selectTurnsOrdered = createSelector([selectTurnsMap], (turns) =>
  Object.values(turns).sort(
    (a, b) =>
      a.round - b.round ||
      a.position - b.position ||
      a.id.localeCompare(b.id),
  ),
);

/** The current stage's question category (legacy stage values normalized). */
export const selectStageCategory = createSelector(
  [selectRoomSession],
  (session): QuestionCategory | null =>
    session ? STAGES[normalizeStage(session.stage)].questionCategory : null,
);

const isLiveQuestion = (q: InterviewQuestionRow): boolean =>
  q.state !== "answered" && q.state !== "deferred";

/**
 * The composer's "next questions" strip: open questions whose category
 * matches the current stage's category (oldest first) — topped up with the
 * oldest OTHER open questions when fewer than 3 match. Null category on old
 * rows reads as `gap` (questionCategory).
 */
export const selectNextQuestions = createSelector(
  [selectQuestionsMap, selectStageCategory],
  (questions, category) => {
    const byAge = (a: InterviewQuestionRow, b: InterviewQuestionRow) =>
      a.round_raised - b.round_raised ||
      a.position - b.position ||
      a.id.localeCompare(b.id);
    const open = Object.values(questions).filter(isLiveQuestion);
    const matching = open
      .filter((q) => category !== null && questionCategory(q) === category)
      .sort(byAge);
    if (matching.length >= 3) return matching;
    const others = open
      .filter((q) => category === null || questionCategory(q) !== category)
      .sort(byAge);
    return [...matching, ...others.slice(0, 3 - matching.length)];
  },
);

/**
 * The full-panel ordering: current stage's category first (so the Expert can
 * answer ahead of schedule below), live before settled, then ledger position.
 */
export const selectQuestionsGroupedForStage = createSelector(
  [selectQuestionsMap, selectStageCategory],
  (questions, category) => {
    const rank = (q: InterviewQuestionRow): number => {
      const settled = q.state === "answered" ? 2 : 0;
      const offCategory =
        category !== null && questionCategory(q) !== category ? 1 : 0;
      return settled + offCategory;
    };
    return Object.values(questions).sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  },
);

export const selectOpenQuestionCount = createSelector(
  [selectQuestionsMap],
  (questions) =>
    Object.values(questions).filter(
      (q) => q.state !== "answered" && q.state !== "deferred",
    ).length,
);

/** Holes: arbitration-needed first, then open, then the rest; stable by id. */
export const selectHolesOrdered = createSelector([selectHolesMap], (holes) => {
  const rank = (h: InterviewHoleRow): number =>
    h.status === "needs_human_arbitration"
      ? 0
      : h.status === "open"
        ? 1
        : 2;
  return Object.values(holes).sort(
    (a, b) => rank(a) - rank(b) || a.round_opened - b.round_opened || a.id.localeCompare(b.id),
  );
});

export const selectOpenHoleCount = createSelector([selectHolesMap], (holes) =>
  Object.values(holes).filter(
    (h) => h.status === "open" || h.status === "needs_human_arbitration",
  ).length,
);
