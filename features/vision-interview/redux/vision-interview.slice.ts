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

import {
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type { RevisionSummary } from "../service";
import {
  defaultRoleTab,
  normalizeStage,
  questionCategory,
  STAGES,
  type InterviewHoleRow,
  type InterviewQuestionRow,
  type InterviewSessionRow,
  type InterviewStageWire,
  type InterviewTurnRow,
  type DocView,
  type QuestionCategory,
  type RoleKey,
} from "../types";
// Durable ledger (never lose an answer to a reload) — see
// ../pendingAnswersStorage.ts for why this is write-through, not in-memory.
import {
  loadPendingAnswers,
  savePendingAnswers,
} from "../pendingAnswersStorage";

export type RunPhase =
  "idle" | "starting" | "running" | "waiting_human" | "complete" | "error";

export type RoleActivity = "active" | "done";

/** Lifecycle of the room's one required server call (see `resolvedRoleBindings`). */
export type RolesPhase = "idle" | "resolving" | "ready" | "failed";

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

  /**
   * Raw-audio capture (v2 §13.1). File ids of dictation recordings the
   * canonical recorder already saved durably (announced via
   * `dictationAudioRegistry`) that belong to the message currently being
   * composed — not yet tied to a sent turn.
   */
  pendingAudioFileIds: string[];
  /**
   * Snapshot taken the moment a send/start was ACCEPTED: these recordings
   * belong to the human turn the server is about to create. The attachment
   * effect stamps `interview.turn.audio_file_id` when that turn lands.
   * A dictation whose upload finishes AFTER the send joins here too (the
   * upload is independent of — and must never gate — the send, v2 §17.1).
   */
  awaitingTurnAudio: { fileIds: string[]; sentAtMs: number } | null;

  /**
   * Which stage tab is live in the centre panel — ONE role, ONE ordinary
   * agent conversation. Only this tab's chat is mounted (Redux holds one
   * conversation focus per surface), and the right-hand expert feed reads it
   * to know which role it must NOT duplicate.
   */
  activeRoleTab: RoleKey;

  /**
   * Which record is on screen over the chat — the Scribe's living document or
   * one of the finalize deliverables; `null` = the expert's chat. It lives
   * here rather than in `RoomChatPane`'s local state so the finish dialog can
   * OPEN a document it just told the Expert about (no dead ends).
   */
  docView: DocView | null;

  /**
   * Role bindings the SERVER resolved for this session via
   * `POST /vision-interview/sessions/{id}/roles` (v3). Every role's mandate
   * resolves to an agent + a stable conversation id there; nothing in the
   * client can resolve a mandate, so without this call every stage tab is a
   * dead room. Held here and merged OVER the session row's own
   * `role_bindings` (`selectRoleBindings`) so the tabs mount the moment the
   * call returns — never waiting on a realtime echo of the server's write.
   */
  resolvedRoleBindings: Record<string, unknown>;
  rolesPhase: RolesPhase;
  /** Honest failure text for the room — never a silent dead tab. */
  rolesError: string | null;

  /**
   * Answers the Expert wrote in the left-hand questions panel that have not
   * ridden a message yet. They are held HERE — never only in a composer —
   * so a failed send can never eat them (v3 answer-append rule). Keyed by
   * question id; the last write for a question wins.
   */
  pendingAnswers: Record<string, PendingAnswer>;
}

/** One answer written in the questions panel, waiting for the next message. */
export interface PendingAnswer {
  questionId: string;
  questionText: string;
  answerText: string;
  /** epoch ms of the last edit — the ledger order answers ride in. */
  updatedAt: number;
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
  pendingAudioFileIds: [],
  awaitingTurnAudio: null,
  activeRoleTab: "sounding_board",
  docView: null,
  pendingAnswers: {},
  resolvedRoleBindings: {},
  rolesPhase: "idle",
  rolesError: null,
};

/** A send this old can no longer claim a late-finishing upload. */
const AWAITING_AUDIO_TTL_MS = 5 * 60_000;

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
      // Answers written before a reload are still "ready to send".
      state.pendingAnswers = loadPendingAnswers(action.payload.sessionId);
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

    // ── Role bindings (v3: the room's one required server call) ────────────

    roleBindingsResolving(state) {
      state.rolesPhase = "resolving";
      state.rolesError = null;
    },

    /** The server resolved every role's mandate. Merged (never replaced) so a
     *  later partial response can only ever ADD a room, never remove one. */
    roleBindingsResolved(
      state,
      action: PayloadAction<{
        sessionId: string;
        roles: Record<string, unknown>;
      }>,
    ) {
      if (state.sessionId !== action.payload.sessionId) return;
      state.resolvedRoleBindings = {
        ...state.resolvedRoleBindings,
        ...action.payload.roles,
      };
      state.rolesPhase = "ready";
      state.rolesError = null;
    },

    roleBindingsFailed(state, action: PayloadAction<string>) {
      state.rolesPhase = "failed";
      state.rolesError = action.payload;
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

    // ── Raw-audio capture (v2 §13.1) ────────────────────────────────────────

    /** The recorder's canonical upload landed for a composer dictation. If a
     *  send was already accepted moments ago (upload finished late), the
     *  recording joins that send's awaiting set — otherwise it waits with the
     *  draft. Ids only; the audio itself is durably in cld_files. */
    dictationAudioSaved(
      state,
      action: PayloadAction<{ fileId: string; savedAtMs: number }>,
    ) {
      const { fileId, savedAtMs } = action.payload;
      const awaiting = state.awaitingTurnAudio;
      if (awaiting && savedAtMs - awaiting.sentAtMs < AWAITING_AUDIO_TTL_MS) {
        if (!awaiting.fileIds.includes(fileId)) awaiting.fileIds.push(fileId);
        return;
      }
      if (!state.pendingAudioFileIds.includes(fileId)) {
        state.pendingAudioFileIds.push(fileId);
      }
    },

    /** A send/start was ACCEPTED — the pending recordings now belong to the
     *  human turn the server creates for it. */
    dictationAudioQueuedForTurn(
      state,
      action: PayloadAction<{ sentAtMs: number }>,
    ) {
      if (state.pendingAudioFileIds.length === 0 && !state.awaitingTurnAudio) {
        // Nothing recorded for this send — but keep a marker so a dictation
        // whose upload lands seconds later still reaches this turn.
        state.awaitingTurnAudio = {
          fileIds: [],
          sentAtMs: action.payload.sentAtMs,
        };
        return;
      }
      state.awaitingTurnAudio = {
        fileIds: [
          ...(state.awaitingTurnAudio?.fileIds ?? []),
          ...state.pendingAudioFileIds,
        ],
        sentAtMs: action.payload.sentAtMs,
      };
      state.pendingAudioFileIds = [];
    },

    /** The awaiting recordings were stamped onto their turn (or expired). */
    turnAudioSettled(state) {
      state.awaitingTurnAudio = null;
    },

    // ── v3 room: stage tabs + pending answers ──────────────────────────────

    /** Show a record over the chat (or `null` to return to the chat). */
    docViewChanged(state, action: PayloadAction<DocView | null>) {
      state.docView = action.payload;
    },

    /** The Expert moved to another expert's room (stage tab click). */
    activeRoleTabChanged(state, action: PayloadAction<RoleKey>) {
      state.activeRoleTab = action.payload;
      // Moving to another expert always returns to their conversation.
      state.docView = null;
    },

    /** The tab a session opens on — its current stage's primary role. Only
     *  moves the tab while the Expert has not chosen one themselves (the
     *  caller owns that decision). */
    activeRoleTabDefaulted(
      state,
      action: PayloadAction<{ stage: InterviewStageWire }>,
    ) {
      state.activeRoleTab = defaultRoleTab(action.payload.stage);
    },

    /** An answer written in the questions panel — upsert, newest edit wins. */
    answerDrafted(
      state,
      action: PayloadAction<{
        questionId: string;
        questionText: string;
        answerText: string;
      }>,
    ) {
      const { questionId, questionText, answerText } = action.payload;
      if (!answerText.trim()) {
        delete state.pendingAnswers[questionId];
        savePendingAnswers(state.sessionId, state.pendingAnswers);
        return;
      }
      state.pendingAnswers[questionId] = {
        questionId,
        questionText,
        answerText,
        updatedAt: Date.now(),
      };
      savePendingAnswers(state.sessionId, state.pendingAnswers);
    },

    /** The Expert threw an answer away before it rode a message. */
    answerDiscarded(state, action: PayloadAction<{ questionId: string }>) {
      delete state.pendingAnswers[action.payload.questionId];
      savePendingAnswers(state.sessionId, state.pendingAnswers);
    },

    /** The answers reached the room — dispatched ONLY once the message they
     *  rode is durably persisted, never on send-click. */
    pendingAnswersCleared(state) {
      state.pendingAnswers = {};
      savePendingAnswers(state.sessionId, state.pendingAnswers);
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
  roleBindingsResolving,
  roleBindingsResolved,
  roleBindingsFailed,
  runStarting,
  runStarted,
  nodeStarted,
  nodeCompleted,
  runInterrupted,
  runResumed,
  runCompleted,
  runFailed,
  streamAdopted,
  dictationAudioSaved,
  dictationAudioQueuedForTurn,
  turnAudioSettled,
  activeRoleTabChanged,
  activeRoleTabDefaulted,
  docViewChanged,
  answerDrafted,
  answerDiscarded,
  pendingAnswersCleared,
} = visionInterviewSlice.actions;

export default visionInterviewSlice.reducer;

// ── Selectors (all memoized; one property, one selector) ────────────────────

const selectSelf = (state: RootState) => state.visionInterview;

export const selectRoomSessionId = (state: RootState) =>
  selectSelf(state).sessionId;
export const selectRoomSession = (state: RootState) =>
  selectSelf(state).session;
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
export const selectPendingAudioFileIds = (state: RootState) =>
  selectSelf(state).pendingAudioFileIds;
export const selectAwaitingTurnAudio = (state: RootState) =>
  selectSelf(state).awaitingTurnAudio;

/**
 * Every role binding known for this session: the server's `/roles` response
 * merged OVER whatever the session row carried. The room reads THIS, never
 * `session.role_bindings` directly, so a freshly-created session becomes
 * talkable the instant `/roles` returns instead of waiting for the realtime
 * echo of the server's write.
 */
export const selectRoleBindings = createSelector(
  [
    selectRoomSession,
    (state: RootState) => selectSelf(state).resolvedRoleBindings,
  ],
  (session, resolved): Record<string, unknown> => ({
    ...(session?.role_bindings ?? {}),
    ...resolved,
  }),
);

export const selectRolesPhase = (state: RootState) =>
  selectSelf(state).rolesPhase;
export const selectRolesError = (state: RootState) =>
  selectSelf(state).rolesError;

export const selectActiveRoleTab = (state: RootState): RoleKey =>
  selectSelf(state).activeRoleTab;

export const selectDocView = (state: RootState): DocView | null =>
  selectSelf(state).docView;

const selectPendingAnswersMap = (state: RootState) =>
  selectSelf(state).pendingAnswers;

/** Pending answers in the order they were written — the order they ride in. */
export const selectPendingAnswers = createSelector(
  [selectPendingAnswersMap],
  (answers): PendingAnswer[] =>
    Object.values(answers).sort(
      (a, b) =>
        a.updatedAt - b.updatedAt || a.questionId.localeCompare(b.questionId),
    ),
);

export const selectPendingAnswerCount = createSelector(
  [selectPendingAnswersMap],
  (answers) => Object.keys(answers).length,
);

/** The answer already written for one question, if any (answer-in-place).
 *  Plain lookup — the stored entry's identity is stable, so no memoization
 *  (and no per-question selector instance) is needed. */
export const selectPendingAnswerFor =
  (questionId: string) =>
  (state: RootState): PendingAnswer | null =>
    selectSelf(state).pendingAnswers[questionId] ?? null;

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
      a.round - b.round || a.position - b.position || a.id.localeCompare(b.id),
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
    h.status === "needs_human_arbitration" ? 0 : h.status === "open" ? 1 : 2;
  return Object.values(holes).sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.round_opened - b.round_opened ||
      a.id.localeCompare(b.id),
  );
});

export const selectOpenHoleCount = createSelector(
  [selectHolesMap],
  (holes) =>
    Object.values(holes).filter(
      (h) => h.status === "open" || h.status === "needs_human_arbitration",
    ).length,
);
