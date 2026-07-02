/**
 * Text Diff Redux Slice
 *
 * Manages diff session state for text editing with AI assistance
 */

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  DiffState,
  PendingDiff,
  AcceptedDiff,
  RejectedDiff,
} from "@/features/text-diff/types";
import type { TextDiff } from "@/features/text-diff/lib/parseDiff";
import { applyDiffs, previewDiff } from "@/features/text-diff/lib/applyDiff";

const initialState: DiffState = {
  sourceId: null,
  sourceType: "note",
  originalText: "",
  currentText: "",
  pendingDiffs: [],
  acceptedDiffs: [],
  rejectedDiffs: [],
  isDirty: false,
  lastSaved: null,
  isProcessing: false,
  error: null,
};

const textDiffSlice = createSlice({
  name: "textDiff",
  initialState,
  reducers: {
    // Initialize a diff session
    initializeDiffSession: (
      state,
      action: PayloadAction<{
        sourceId: string;
        sourceType: "note" | "custom";
        initialText: string;
      }>,
    ) => {
      state.sourceId = action.payload.sourceId;
      state.sourceType = action.payload.sourceType;
      state.originalText = action.payload.initialText;
      state.currentText = action.payload.initialText;
      state.pendingDiffs = [];
      state.acceptedDiffs = [];
      state.rejectedDiffs = [];
      state.isDirty = false;
      state.lastSaved = new Date().toISOString();
      state.isProcessing = false;
      state.error = null;
    },

    // Add new diffs from AI response
    addPendingDiffs: (state, action: PayloadAction<TextDiff[]>) => {
      state.isProcessing = true;
      state.error = null;

      const newPendingDiffs: PendingDiff[] = [];
      const failedDiffs: string[] = [];

      for (const diff of action.payload) {
        // Generate preview
        const preview = previewDiff(state.currentText, diff);

        if (preview.success && preview.before && preview.after) {
          newPendingDiffs.push({
            id: diff.id,
            diff,
            preview: {
              before: preview.before,
              after: preview.after,
              lineRange: preview.lineRange,
            },
            status: "pending",
            createdAt: new Date().toISOString(),
          });
        } else {
          // Collect failed diffs for user-facing error message
          failedDiffs.push(`${diff.id}: ${preview.error || "Unknown error"}`);
        }
      }

      // Set user-friendly error if any diffs failed
      if (failedDiffs.length > 0) {
        if (failedDiffs.length === action.payload.length) {
          // All failed
          state.error = `All ${failedDiffs.length} diff(s) failed to match the current text. The AI's suggested changes may not match your content exactly.`;
        } else {
          // Some failed
          state.error = `${failedDiffs.length} of ${action.payload.length} diff(s) could not be matched. Successfully loaded ${newPendingDiffs.length} change(s).`;
        }
      }

      state.pendingDiffs = [...state.pendingDiffs, ...newPendingDiffs];
      state.isProcessing = false;
    },

    // Accept a single diff
    acceptDiff: (state, action: PayloadAction<string>) => {
      const diffId = action.payload;
      const pendingIndex = state.pendingDiffs.findIndex((d) => d.id === diffId);

      if (pendingIndex === -1) {
        state.error = `Diff ${diffId} not found in pending`;
        return;
      }

      const pendingDiff = state.pendingDiffs[pendingIndex];

      // Apply the diff
      const result = applyDiffs(state.currentText, [pendingDiff.diff]);

      if (result.success && result.newText) {
        state.currentText = result.newText;
        state.isDirty = true;

        // Move to accepted
        state.acceptedDiffs.push({
          id: pendingDiff.id,
          diff: pendingDiff.diff,
          acceptedAt: new Date().toISOString(),
          appliedText: result.newText,
        });

        // Remove from pending
        state.pendingDiffs.splice(pendingIndex, 1);
        state.error = null;
      } else {
        state.error = result.error || "Failed to apply diff";
      }
    },

    // Reject a single diff
    rejectDiff: (
      state,
      action: PayloadAction<{ diffId: string; reason?: string }>,
    ) => {
      const { diffId, reason } = action.payload;
      const pendingIndex = state.pendingDiffs.findIndex((d) => d.id === diffId);

      if (pendingIndex === -1) {
        state.error = `Diff ${diffId} not found in pending`;
        return;
      }

      const pendingDiff = state.pendingDiffs[pendingIndex];

      // Move to rejected
      state.rejectedDiffs.push({
        id: pendingDiff.id,
        diff: pendingDiff.diff,
        rejectedAt: new Date().toISOString(),
        reason,
      });

      // Remove from pending
      state.pendingDiffs.splice(pendingIndex, 1);
      state.error = null;
    },

    // Accept all pending diffs
    acceptAllDiffs: (state) => {
      if (state.pendingDiffs.length === 0) return;

      const diffsToApply = state.pendingDiffs.map((pd) => pd.diff);
      const result = applyDiffs(state.currentText, diffsToApply);

      if (result.success && result.newText) {
        const newText = result.newText;
        state.currentText = newText;
        state.isDirty = true;

        // Move all to accepted
        const timestamp = new Date().toISOString();
        state.acceptedDiffs = [
          ...state.acceptedDiffs,
          ...state.pendingDiffs.map((pd) => ({
            id: pd.id,
            diff: pd.diff,
            acceptedAt: timestamp,
            appliedText: newText,
          })),
        ];

        state.pendingDiffs = [];
        state.error = null;
      } else {
        state.error = result.error || "Failed to apply all diffs";
      }
    },

    // Reject all pending diffs
    rejectAllDiffs: (state, action: PayloadAction<string | undefined>) => {
      const reason = action.payload;
      const timestamp = new Date().toISOString();

      // Move all to rejected
      state.rejectedDiffs = [
        ...state.rejectedDiffs,
        ...state.pendingDiffs.map((pd) => ({
          id: pd.id,
          diff: pd.diff,
          rejectedAt: timestamp,
          reason,
        })),
      ];

      state.pendingDiffs = [];
      state.error = null;
    },

    // Undo last accepted diff
    undoLastAccept: (state) => {
      if (state.acceptedDiffs.length === 0) {
        state.error = "No diffs to undo";
        return;
      }

      // Get the last accepted diff
      const lastAccepted = state.acceptedDiffs[state.acceptedDiffs.length - 1];

      // Restore text to before this diff was applied
      // We need to reapply all diffs except the last one
      const diffsToReapply = state.acceptedDiffs
        .slice(0, -1)
        .map((ad) => ad.diff);

      if (diffsToReapply.length > 0) {
        const result = applyDiffs(state.originalText, diffsToReapply);
        if (result.success && result.newText) {
          state.currentText = result.newText;
        } else {
          state.error = "Failed to undo diff";
          return;
        }
      } else {
        // No more diffs, restore to original
        state.currentText = state.originalText;
        state.isDirty = false;
      }

      // Remove from accepted
      state.acceptedDiffs.pop();
    },

    // Mark as saved
    markSaved: (state) => {
      state.isDirty = false;
      state.lastSaved = new Date().toISOString();
      state.originalText = state.currentText; // Update baseline
      state.acceptedDiffs = []; // Clear history after save
      state.rejectedDiffs = [];
    },

    // Reset the session
    resetDiffSession: (state) => {
      Object.assign(state, initialState);
    },

    // Update current text manually (for user edits)
    updateCurrentText: (state, action: PayloadAction<string>) => {
      state.currentText = action.payload;
      state.isDirty = state.currentText !== state.originalText;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  initializeDiffSession,
  addPendingDiffs,
  acceptDiff,
  rejectDiff,
  acceptAllDiffs,
  rejectAllDiffs,
  undoLastAccept,
  markSaved,
  resetDiffSession,
  updateCurrentText,
  clearError,
} = textDiffSlice.actions;

// Selectors
type WithTextDiff = { textDiff: DiffState };

export const selectDiffState = (state: WithTextDiff) => state.textDiff;
export const selectPendingDiffs = (state: WithTextDiff) =>
  state.textDiff.pendingDiffs;
export const selectAcceptedDiffs = (state: WithTextDiff) =>
  state.textDiff.acceptedDiffs;
export const selectRejectedDiffs = (state: WithTextDiff) =>
  state.textDiff.rejectedDiffs;
export const selectIsDirty = (state: WithTextDiff) => state.textDiff.isDirty;
export const selectCurrentText = (state: WithTextDiff) =>
  state.textDiff.currentText;
export const selectCanUndo = (state: WithTextDiff) =>
  state.textDiff.acceptedDiffs.length > 0;
export const selectDiffError = (state: WithTextDiff) => state.textDiff.error;

export default textDiffSlice.reducer;
