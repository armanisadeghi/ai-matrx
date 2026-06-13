/**
 * Instance Working Document selectors.
 *
 * Per-property selectors keyed by conversationId. All return either primitives
 * or stable stored references (Immer only swaps a reference when that exact
 * sub-object is mutated), so none need `createSelector` memoisation.
 */

import type { RootState } from "@/lib/redux/store";
import {
  NO_BINDING,
  type InstanceWorkingDocumentState,
  type WorkingDocumentBinding,
} from "./instance-working-document.slice";

export const selectWorkingDocEntry =
  (conversationId: string) =>
  (state: RootState): InstanceWorkingDocumentState | undefined =>
    state.instanceWorkingDocument.byConversationId[conversationId];

export const selectWorkingDocEnabled =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceWorkingDocument.byConversationId[conversationId]?.enabled ??
    false;

export const selectWorkingDocContent =
  (conversationId: string) =>
  (state: RootState): string =>
    state.instanceWorkingDocument.byConversationId[conversationId]?.content ??
    "";

export const selectWorkingDocTitle =
  (conversationId: string) =>
  (state: RootState): string =>
    state.instanceWorkingDocument.byConversationId[conversationId]?.title ??
    "Working document";

export const selectWorkingDocBinding =
  (conversationId: string) =>
  (state: RootState): WorkingDocumentBinding =>
    state.instanceWorkingDocument.byConversationId[conversationId]?.binding ??
    NO_BINDING;

export const selectWorkingDocSaving =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceWorkingDocument.byConversationId[conversationId]?.saving ??
    false;

export const selectWorkingDocError =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.instanceWorkingDocument.byConversationId[conversationId]?.lastError ??
    null;

export const selectWorkingDocAgentRevision =
  (conversationId: string) =>
  (state: RootState): number =>
    state.instanceWorkingDocument.byConversationId[conversationId]
      ?.agentRevision ?? 0;
