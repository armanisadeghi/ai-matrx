/**
 * Instance User Input Slice
 *
 * Manages the message the user is composing for each instance.
 * Can be plain text or mixed content blocks (text + inline images, etc.).
 *
 * Includes a lightweight undo/redo stack that snapshots { text, userValues }
 * together so both are restored atomically on Cmd+Z / Ctrl+Z.
 *
 * Undo behaviour:
 *   - Each setUserInputText push is coalesced if the previous entry was < 800ms ago
 *   - Variable value changes (pushed via pushInputSnapshot) are always committed
 *   - Stack is capped at 100 entries
 *   - Clear-on-send wipes the future stack but preserves past so the user can
 *     undo back to what they were typing before they sent
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { InstanceUserInputState } from "@/features/agents/types/instance.types";
import type { MessagePart } from "@/types/python-generated/stream-events";
import { destroyInstance } from "../conversations/conversations.slice";
import {
  isInputDraftProtected,
  reportInputDraftViolation,
} from "./input-draft-protection";

// =============================================================================
// Undo types
// =============================================================================

const UNDO_MAX = 100;
const COALESCE_MS = 800;

export interface InputSnapshot {
  text: string;
  userValues: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// State
// =============================================================================

export interface InstanceUserInputEntryWithUndo extends InstanceUserInputState {
  _undoPast: InputSnapshot[];
  _undoFuture: InputSnapshot[];
}

export interface InstanceUserInputSliceState {
  byConversationId: Record<string, InstanceUserInputEntryWithUndo>;
}

const initialState: InstanceUserInputSliceState = {
  byConversationId: {},
};

// =============================================================================
// Helpers
// =============================================================================

function captureSnapshot(
  entry: InstanceUserInputEntryWithUndo,
  userValues: Record<string, unknown>,
): InputSnapshot {
  return {
    text: entry.text,
    userValues: { ...userValues },
    timestamp: Date.now(),
  };
}

function pushSnapshot(
  entry: InstanceUserInputEntryWithUndo,
  snapshot: InputSnapshot,
  forceCommit = false,
): void {
  const top = entry._undoPast[entry._undoPast.length - 1];

  if (!forceCommit && top && snapshot.timestamp - top.timestamp < COALESCE_MS) {
    // Coalesce: update timestamp but don't push a new entry
    top.timestamp = snapshot.timestamp;
    return;
  }

  entry._undoPast.push(snapshot);
  entry._undoFuture = [];

  if (entry._undoPast.length > UNDO_MAX) {
    entry._undoPast.shift();
  }
}

// =============================================================================
// Slice
// =============================================================================

const instanceUserInputSlice = createSlice({
  name: "instanceUserInput",
  initialState,
  reducers: {
    initInstanceUserInput(
      state,
      action: PayloadAction<{
        conversationId: string;
        text?: string;
        lastSubmittedText?: string;
        lastSubmittedUserValues?: Record<string, unknown>;
        originalSubmittedText?: string;
        originalSubmittedUserValues?: Record<string, unknown>;
      }>,
    ) {
      const {
        conversationId,
        text = "",
        lastSubmittedText = "",
        lastSubmittedUserValues = {},
        originalSubmittedText,
        originalSubmittedUserValues,
      } = action.payload;
      state.byConversationId[conversationId] = {
        conversationId,
        text,
        messageParts: null,
        submissionPhase: "idle",
        lastSubmittedText,
        lastSubmittedUserValues: { ...lastSubmittedUserValues },
        originalSubmittedText,
        originalSubmittedUserValues: originalSubmittedUserValues
          ? { ...originalSubmittedUserValues }
          : undefined,
        _undoPast: [],
        _undoFuture: [],
      };
    },

    setUserInputText(
      state,
      action: PayloadAction<{
        conversationId: string;
        text: string;
        /** Current userValues — required so undo snapshots both fields together */
        userValues?: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, text, userValues = {} } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry) return;

      const snapshot = captureSnapshot(entry, userValues);
      pushSnapshot(entry, snapshot);

      entry.text = text;
      // User is composing new content — exit any lingering pending/persisted phase.
      if (entry.submissionPhase !== "idle") {
        entry.submissionPhase = "idle";
      }
    },

    setUserInputMessageParts(
      state,
      action: PayloadAction<{
        conversationId: string;
        parts: MessagePart[];
      }>,
    ) {
      const { conversationId, parts } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        entry.messageParts = parts;
      }
    },

    /**
     * Push an explicit snapshot — call this from the variable value thunk
     * so that variable edits are also undoable alongside text.
     */
    pushInputSnapshot(
      state,
      action: PayloadAction<{
        conversationId: string;
        text: string;
        userValues: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, text, userValues } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry) return;

      const snapshot: InputSnapshot = {
        text,
        userValues: { ...userValues },
        timestamp: Date.now(),
      };
      pushSnapshot(entry, snapshot, true); // always commit variable changes
    },

    undoInputEdit(
      state,
      action: PayloadAction<{
        conversationId: string;
        /** Callback receives the restored values — caller must also update variable slice */
        _apply?: never;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (!entry || entry._undoPast.length === 0) return;

      const current: InputSnapshot = {
        text: entry.text,
        userValues: {}, // variables are applied by the hook via a separate dispatch
        timestamp: Date.now(),
      };
      entry._undoFuture.push(current);

      const prev = entry._undoPast.pop()!;
      entry.text = prev.text;
      // userValues are stored on the snapshot but applied to the variable slice
      // by the hook (see useInstanceInputUndoRedo)
    },

    redoInputEdit(state, action: PayloadAction<{ conversationId: string }>) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (!entry || entry._undoFuture.length === 0) return;

      const current: InputSnapshot = {
        text: entry.text,
        userValues: {},
        timestamp: Date.now(),
      };
      entry._undoPast.push(current);

      const next = entry._undoFuture.pop()!;
      entry.text = next.text;
    },

    clearUserInput(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (!entry) return;

      // SACRED INVARIANT — never wipe a live next-message draft. If the user has
      // started composing a new message (text diverged from what was submitted),
      // the conversation/stream MUST NOT clear it. See input-draft-protection.ts.
      // We still reset submissionPhase/messageParts so downstream UI state is
      // consistent, but the text itself is preserved. This is a LOUD recovery:
      // a clear reaching protected content means a real bug slipped through.
      if (isInputDraftProtected(entry)) {
        reportInputDraftViolation(
          "clearUserInput",
          entry.conversationId,
          entry.text.length,
        );
        entry.submissionPhase = "idle";
        return;
      }

      entry.text = "";
      entry.messageParts = null;
      entry.submissionPhase = "idle";
      // Intentionally KEEP lastSubmittedText/lastSubmittedUserValues so the
      // /build "Re-apply last input" affordance survives stream completion.
      // They are overwritten on the next submit and fully dropped when the
      // instance is destroyed.
      entry._undoFuture = [];
    },

    /**
     * Phase 1 → pending. Captures the text + userValues being submitted
     * without clearing the textarea (data-protection window before the
     * server has acknowledged persistence).
     */
    markInputSubmitted(
      state,
      action: PayloadAction<{
        conversationId: string;
        userValues: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, userValues } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry) return;
      entry.submissionPhase = "pending";
      entry.lastSubmittedText = entry.text;
      entry.lastSubmittedUserValues = { ...userValues };

      // Capture the ORIGINAL submit (first time only) — the exact inputs the
      // engineer had when they first clicked submit. Never overwritten; carried
      // forward across autoclear splits via initInstanceUserInput so the
      // auto-clear toggle can always restore the original test state.
      if (entry.originalSubmittedText === undefined) {
        entry.originalSubmittedText = entry.text;
        entry.originalSubmittedUserValues = { ...userValues };
      }
    },

    /**
     * Phase 2 → persisted. Server confirmed cx_user_request record reserved —
     * safe to clear the textarea. lastSubmittedText is intentionally preserved
     * so a "re-apply" action can restore it if the user (or an auto-clear
     * reset) wants to resubmit the same content.
     *
     * CRITICAL: this fires ~1s after submit, on a stream event, on the SAME
     * conversationId the user types into (chat/run). By then the user may have
     * already started their next message. We clear ONLY if `text` is still the
     * just-submitted message; if a new draft is present it is SACRED and
     * preserved (loud recovery). See input-draft-protection.ts.
     */
    markInputPersisted(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (!entry) return;

      if (isInputDraftProtected(entry)) {
        reportInputDraftViolation(
          "markInputPersisted",
          entry.conversationId,
          entry.text.length,
        );
        // Do NOT mark "persisted" or touch the text — the user has moved on to a
        // new message and `submissionPhase` is already "idle" (set when they
        // typed). Leave the draft completely untouched.
        return;
      }

      entry.submissionPhase = "persisted";
      entry.text = "";
      entry.messageParts = null;
      entry._undoFuture = [];
    },

    /**
     * Error/abort path. Returns phase to idle but keeps `text` intact so
     * the user doesn't lose their input on a failed submission.
     */
    resetSubmissionPhase(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (!entry) return;
      entry.submissionPhase = "idle";
    },

    /**
     * Carry the last-submitted snapshot onto a new conversation id (used when
     * `startNewConversation` replaces the conversation id after a reset).
     */
    transferLastSubmittedInput(
      state,
      action: PayloadAction<{
        fromConversationId: string;
        toConversationId: string;
      }>,
    ) {
      const { fromConversationId, toConversationId } = action.payload;
      const from = state.byConversationId[fromConversationId];
      if (!from || !from.lastSubmittedText) return;
      const to = state.byConversationId[toConversationId];
      if (to) {
        to.lastSubmittedText = from.lastSubmittedText;
        to.lastSubmittedUserValues = { ...from.lastSubmittedUserValues };
        to.originalSubmittedText = from.originalSubmittedText;
        to.originalSubmittedUserValues = from.originalSubmittedUserValues
          ? { ...from.originalSubmittedUserValues }
          : undefined;
      } else {
        state.byConversationId[toConversationId] = {
          conversationId: toConversationId,
          text: "",
          messageParts: null,
          submissionPhase: "idle",
          lastSubmittedText: from.lastSubmittedText,
          lastSubmittedUserValues: { ...from.lastSubmittedUserValues },
          originalSubmittedText: from.originalSubmittedText,
          originalSubmittedUserValues: from.originalSubmittedUserValues
            ? { ...from.originalSubmittedUserValues }
            : undefined,
          _undoPast: [],
          _undoFuture: [],
        };
      }
    },

    removeInstanceUserInput(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },

  extraReducers: (builder) => {
    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
    });
  },
});

export const {
  initInstanceUserInput,
  setUserInputText,
  setUserInputMessageParts,
  pushInputSnapshot,
  undoInputEdit,
  redoInputEdit,
  clearUserInput,
  markInputSubmitted,
  markInputPersisted,
  resetSubmissionPhase,
  transferLastSubmittedInput,
  removeInstanceUserInput,
} = instanceUserInputSlice.actions;

export default instanceUserInputSlice.reducer;
