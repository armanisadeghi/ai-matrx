// lib/redux/slices/artifactsSlice.ts
//
// Universal artifact registry for all AI-generated content.
//
// An artifact is any structured content produced from a chat message:
// HTML pages, flashcard decks, org charts, diagrams, etc.
//
// State structure uses secondary indexes (byMessageId, byConversationId,
// byProjectId) to enable O(1) lookups without scanning the full artifact map.
// Thunks maintain these indexes whenever artifacts are upserted or removed.
//
// Parallel to agentCacheSlice — same pattern of byId + id-list indexes.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  CxArtifactRecord,
  ArtifactType,
  ArtifactStatus,
} from "@/features/artifacts/types";

// ── State shape ───────────────────────────────────────────────────────────────

export type ArtifactFetchStatus = "idle" | "loading" | "succeeded" | "failed";
export type ArtifactOpStatus = "loading" | "succeeded" | "failed";

export interface ArtifactsState {
  // Primary index: artifact id → record
  artifacts: Record<string, CxArtifactRecord>;

  // Secondary indexes for O(1) lookups (arrays of artifact IDs)
  byMessageId: Record<string, string[]>; // messageId → artifactId[]
  byConversationId: Record<string, string[]>; // conversationId → artifactId[]
  byProjectId: Record<string, string[]>; // projectId → artifactId[]
  byTaskId: Record<string, string[]>; // taskId → artifactId[]

  // Ordered ID list for list views (sorted by updatedAt desc)
  allIds: string[];

  // Global fetch status (for initial load / refresh)
  fetchStatus: ArtifactFetchStatus;
  fetchError: string | null;

  // Per-artifact operation status (create/update/delete in-flight)
  operationStatus: Record<string, ArtifactOpStatus>;
}

const initialState: ArtifactsState = {
  artifacts: {},
  byMessageId: {},
  byConversationId: {},
  byProjectId: {},
  byTaskId: {},
  allIds: [],
  fetchStatus: "idle",
  fetchError: null,
  operationStatus: {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Add artifactId to an index bucket (deduplicated). */
function addToIndex(
  index: Record<string, string[]>,
  key: string | null | undefined,
  artifactId: string,
): void {
  if (!key) return;
  if (!index[key]) {
    index[key] = [];
  }
  if (!index[key].includes(artifactId)) {
    index[key].push(artifactId);
  }
}

/** Remove artifactId from an index bucket. */
function removeFromIndex(
  index: Record<string, string[]>,
  key: string | null | undefined,
  artifactId: string,
): void {
  if (!key || !index[key]) return;
  index[key] = index[key].filter((id) => id !== artifactId);
  if (index[key].length === 0) {
    delete index[key];
  }
}

// ── Slice ─────────────────────────────────────────────────────────────────────

const artifactsSlice = createSlice({
  name: "artifacts",
  initialState,
  reducers: {
    /**
     * Insert or update a single artifact.
     * Maintains all secondary indexes automatically.
     */
    upsertArtifact(state, action: PayloadAction<CxArtifactRecord>) {
      const artifact = action.payload;
      const existing = state.artifacts[artifact.id];

      // If replacing an existing record with different context values,
      // remove from old index buckets first.
      if (existing) {
        if (existing.messageId !== artifact.messageId) {
          removeFromIndex(state.byMessageId, existing.messageId, artifact.id);
        }
        if (existing.conversationId !== artifact.conversationId) {
          removeFromIndex(
            state.byConversationId,
            existing.conversationId,
            artifact.id,
          );
        }
        if (existing.projectId !== artifact.projectId) {
          removeFromIndex(state.byProjectId, existing.projectId, artifact.id);
        }
        if (existing.taskId !== artifact.taskId) {
          removeFromIndex(state.byTaskId, existing.taskId, artifact.id);
        }
      }

      // Store the record
      state.artifacts[artifact.id] = artifact;

      // Add to secondary indexes
      addToIndex(state.byMessageId, artifact.messageId, artifact.id);
      addToIndex(state.byConversationId, artifact.conversationId, artifact.id);
      addToIndex(state.byProjectId, artifact.projectId, artifact.id);
      addToIndex(state.byTaskId, artifact.taskId, artifact.id);

      // Maintain ordered list (insert or move to front for recency)
      state.allIds = [
        artifact.id,
        ...state.allIds.filter((id) => id !== artifact.id),
      ];
    },

    /**
     * Bulk upsert — used when loading the initial artifact list.
     * Replaces allIds with the new sorted order.
     */
    upsertManyArtifacts(state, action: PayloadAction<CxArtifactRecord[]>) {
      const incoming = action.payload;

      for (const artifact of incoming) {
        const existing = state.artifacts[artifact.id];

        if (existing) {
          removeFromIndex(state.byMessageId, existing.messageId, artifact.id);
          removeFromIndex(
            state.byConversationId,
            existing.conversationId,
            artifact.id,
          );
          removeFromIndex(state.byProjectId, existing.projectId, artifact.id);
          removeFromIndex(state.byTaskId, existing.taskId, artifact.id);
        }

        state.artifacts[artifact.id] = artifact;
        addToIndex(state.byMessageId, artifact.messageId, artifact.id);
        addToIndex(
          state.byConversationId,
          artifact.conversationId,
          artifact.id,
        );
        addToIndex(state.byProjectId, artifact.projectId, artifact.id);
        addToIndex(state.byTaskId, artifact.taskId, artifact.id);
      }

      // Rebuild allIds sorted by updatedAt descending
      state.allIds = Object.values(state.artifacts)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((a) => a.id);
    },

    /**
     * Remove an artifact from the store (used after soft-delete or archive).
     * Does not call the API — use the thunks for that.
     */
    removeArtifact(state, action: PayloadAction<string>) {
      const id = action.payload;
      const existing = state.artifacts[id];
      if (!existing) return;

      removeFromIndex(state.byMessageId, existing.messageId, id);
      removeFromIndex(state.byConversationId, existing.conversationId, id);
      removeFromIndex(state.byProjectId, existing.projectId, id);
      removeFromIndex(state.byTaskId, existing.taskId, id);

      delete state.artifacts[id];
      state.allIds = state.allIds.filter((i) => i !== id);
      delete state.operationStatus[id];
    },

    setFetchStatus(
      state,
      action: PayloadAction<{ status: ArtifactFetchStatus; error?: string }>,
    ) {
      state.fetchStatus = action.payload.status;
      state.fetchError = action.payload.error ?? null;
    },

    setOperationStatus(
      state,
      action: PayloadAction<{ id: string; status: ArtifactOpStatus }>,
    ) {
      state.operationStatus[action.payload.id] = action.payload.status;
    },

    clearOperationStatus(state, action: PayloadAction<string>) {
      delete state.operationStatus[action.payload];
    },

    /** Reset the entire slice — for sign-out. */
    clearArtifacts() {
      return initialState;
    },
  },
});

export const {
  upsertArtifact,
  upsertManyArtifacts,
  removeArtifact,
  setFetchStatus,
  setOperationStatus,
  clearOperationStatus,
  clearArtifacts,
} = artifactsSlice.actions;

export default artifactsSlice.reducer;

// ── Base selectors (used by artifactSelectors.ts) ─────────────────────────────

type WithArtifacts = { artifacts: ArtifactsState };

export const selectArtifactsState = (state: WithArtifacts): ArtifactsState =>
  state.artifacts;

export const selectArtifactsById = (
  state: WithArtifacts,
): Record<string, CxArtifactRecord> => state.artifacts.artifacts;

export const selectArtifactAllIds = (state: WithArtifacts): string[] =>
  state.artifacts.allIds;

export const selectArtifactsByMessageIdIndex = (
  state: WithArtifacts,
): Record<string, string[]> => state.artifacts.byMessageId;

export const selectArtifactsByConversationIdIndex = (
  state: WithArtifacts,
): Record<string, string[]> => state.artifacts.byConversationId;

export const selectArtifactsByProjectIdIndex = (
  state: WithArtifacts,
): Record<string, string[]> => state.artifacts.byProjectId;

export const selectArtifactsByTaskIdIndex = (
  state: WithArtifacts,
): Record<string, string[]> => state.artifacts.byTaskId;

export const selectArtifactFetchStatus = (
  state: WithArtifacts,
): ArtifactFetchStatus => state.artifacts.fetchStatus;

export const selectArtifactFetchError = (state: WithArtifacts): string | null =>
  state.artifacts.fetchError;

export const selectArtifactOperationStatus = (
  state: WithArtifacts,
  id: string,
): ArtifactOpStatus | undefined => state.artifacts.operationStatus[id];

// Re-export types consumers need
export type { CxArtifactRecord, ArtifactType, ArtifactStatus };
