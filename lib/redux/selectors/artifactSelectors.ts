// lib/redux/selectors/artifactSelectors.ts
//
// Memoized selectors for the artifacts slice.
//
// Pattern: simple selectors are plain functions; parametric selectors
// use createSelector for memoization. Factory functions (makeSelect*)
// return stable selector instances — create them once outside a component
// or in useMemo with a stable ID to ensure proper memoization.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  selectArtifactsById,
  selectArtifactAllIds,
  selectArtifactsByMessageIdIndex,
  selectArtifactsByConversationIdIndex,
  selectArtifactsByProjectIdIndex,
  selectArtifactsByTaskIdIndex,
  selectArtifactFetchStatus,
  selectArtifactFetchError,
  selectArtifactOperationStatus,
} from "@/lib/redux/slices/artifactsSlice";
import type {
  CxArtifactRecord,
  ArtifactType,
  ArtifactStatus,
} from "@/features/artifacts/types";

const EMPTY_ARTIFACT_IDS: string[] = [];

// Re-export base selectors for convenience
export {
  selectArtifactFetchStatus,
  selectArtifactFetchError,
  selectArtifactOperationStatus,
};

// ── Simple lookups ────────────────────────────────────────────────────────────

/** All artifacts as an ordered array (sorted by updatedAt desc). */
export const selectAllArtifacts = createSelector(
  selectArtifactsById,
  selectArtifactAllIds,
  (byId, ids) =>
    ids.map((id) => byId[id]).filter(Boolean) as CxArtifactRecord[],
);

/** Single artifact by ID. */
export const selectArtifactById = (
  state: RootState,
  id: string,
): CxArtifactRecord | undefined => selectArtifactsById(state)[id];

// ── Message-based lookups ─────────────────────────────────────────────────────

/** All artifacts linked to a specific message. */
export const selectArtifactsByMessageId = createSelector(
  selectArtifactsById,
  selectArtifactsByMessageIdIndex,
  (_state: RootState, messageId: string) => messageId,
  (byId, index, messageId) => {
    const ids = index[messageId] ?? EMPTY_ARTIFACT_IDS;
    return ids.map((id) => byId[id]).filter(Boolean) as CxArtifactRecord[];
  },
);

/**
 * Returns the first HTML page artifact for a given message.
 * Used by HtmlPreviewBridge to determine if publishedPageId exists.
 */
export const selectHtmlPageArtifactForMessage = createSelector(
  selectArtifactsById,
  selectArtifactsByMessageIdIndex,
  (_state: RootState, messageId: string) => messageId,
  (byId, index, messageId): CxArtifactRecord | undefined => {
    const ids = index[messageId] ?? EMPTY_ARTIFACT_IDS;
    return ids
      .map((id) => byId[id])
      .filter(Boolean)
      .find((a) => a.artifactType === "html_page") as
      | CxArtifactRecord
      | undefined;
  },
);

// ── Conversation-based lookups ────────────────────────────────────────────────

/** All artifacts for a conversation. */
export const selectArtifactsByConversationId = createSelector(
  selectArtifactsById,
  selectArtifactsByConversationIdIndex,
  (_state: RootState, conversationId: string) => conversationId,
  (byId, index, conversationId) => {
    const ids = index[conversationId] ?? EMPTY_ARTIFACT_IDS;
    return ids.map((id) => byId[id]).filter(Boolean) as CxArtifactRecord[];
  },
);

// ── Project / Task lookups ────────────────────────────────────────────────────

/** All artifacts scoped to a project. */
export const selectArtifactsByProjectId = createSelector(
  selectArtifactsById,
  selectArtifactsByProjectIdIndex,
  (_state: RootState, projectId: string) => projectId,
  (byId, index, projectId) => {
    const ids = index[projectId] ?? EMPTY_ARTIFACT_IDS;
    return ids.map((id) => byId[id]).filter(Boolean) as CxArtifactRecord[];
  },
);

/** All artifacts scoped to a task. */
export const selectArtifactsByTaskId = createSelector(
  selectArtifactsById,
  selectArtifactsByTaskIdIndex,
  (_state: RootState, taskId: string) => taskId,
  (byId, index, taskId) => {
    const ids = index[taskId] ?? EMPTY_ARTIFACT_IDS;
    return ids.map((id) => byId[id]).filter(Boolean) as CxArtifactRecord[];
  },
);

// ── Type-based lookups ────────────────────────────────────────────────────────

/** All artifacts of a specific type. */
export const selectArtifactsByType = createSelector(
  selectAllArtifacts,
  (_state: RootState, type: ArtifactType) => type,
  (artifacts, type) => artifacts.filter((a) => a.artifactType === type),
);

/** All published artifacts. */
export const selectPublishedArtifacts = createSelector(
  selectAllArtifacts,
  (artifacts) => artifacts.filter((a) => a.status === "published"),
);

/** All draft artifacts. */
export const selectDraftArtifacts = createSelector(
  selectAllArtifacts,
  (artifacts) => artifacts.filter((a) => a.status === "draft"),
);

// ── Status / count helpers ────────────────────────────────────────────────────

/** Count of artifacts per type. */
export const selectArtifactCountByType = createSelector(
  selectAllArtifacts,
  (artifacts): Record<ArtifactType, number> => {
    const counts = {} as Record<ArtifactType, number>;
    for (const a of artifacts) {
      counts[a.artifactType] = (counts[a.artifactType] ?? 0) + 1;
    }
    return counts;
  },
);

/** Total artifact count for the current user. */
export const selectTotalArtifactCount = createSelector(
  selectArtifactAllIds,
  (ids) => ids.length,
);

/** Whether any artifact for a given message has been published. */
export const selectHasPublishedArtifactForMessage = createSelector(
  selectArtifactsById,
  selectArtifactsByMessageIdIndex,
  (_state: RootState, messageId: string) => messageId,
  (byId, index, messageId): boolean => {
    const ids = index[messageId] ?? EMPTY_ARTIFACT_IDS;
    return ids
      .map((id) => byId[id])
      .filter(Boolean)
      .some((a) => a.status === "published");
  },
);

// ── Factory selectors (for parametric memoization) ────────────────────────────

/**
 * Creates a stable selector that filters artifacts by multiple criteria.
 * Create once outside the component (or in useMemo with a stable key).
 *
 * @example
 *   const selectMyHtmlPages = makeSelectFilteredArtifacts('cms-html');
 *   // In component:
 *   const pages = useAppSelector((state) => selectMyHtmlPages(state, { artifactType: 'html_page' }));
 */
export function makeSelectFilteredArtifacts(_instanceId: string) {
  return createSelector(
    selectAllArtifacts,
    (
      _state: RootState,
      filters: {
        artifactType?: ArtifactType;
        status?: ArtifactStatus;
        projectId?: string;
        taskId?: string;
        conversationId?: string;
      },
    ) => filters,
    (artifacts, filters) => {
      let result = artifacts;

      if (filters.artifactType) {
        result = result.filter((a) => a.artifactType === filters.artifactType);
      }
      if (filters.status) {
        result = result.filter((a) => a.status === filters.status);
      }
      if (filters.projectId) {
        result = result.filter((a) => a.projectId === filters.projectId);
      }
      if (filters.taskId) {
        result = result.filter((a) => a.taskId === filters.taskId);
      }
      if (filters.conversationId) {
        result = result.filter(
          (a) => a.conversationId === filters.conversationId,
        );
      }

      return result;
    },
  );
}
