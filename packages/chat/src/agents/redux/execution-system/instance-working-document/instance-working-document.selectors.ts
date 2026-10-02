/**
 * Instance Working Document selectors.
 *
 * Per-property selectors keyed by `(conversationId, kind)`. `kind` defaults to
 * "working" so every existing call site (which passes only a conversationId)
 * is unchanged. All return primitives or stable stored references (Immer only
 * swaps a reference when that exact sub-object is mutated), so none need
 * `createSelector` memoisation.
 */

import type { ChatRootState } from "../../../../store/root-state";
import {
  DEFAULT_DOC_KIND,
  NO_BINDING,
  workingDocKey,
  type InstanceWorkingDocumentState,
  type WorkingDocumentBinding,
  type WorkingDocumentKind,
} from "./instance-working-document.slice";
import { selectPreferredScratchpadId } from "../../../../host/prefs";

const entryOf = (
  state: ChatRootState,
  conversationId: string,
  kind: WorkingDocumentKind,
): InstanceWorkingDocumentState | undefined =>
  state.instanceWorkingDocument.byKey[workingDocKey(conversationId, kind)];

export const selectWorkingDocEntry =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): InstanceWorkingDocumentState | undefined =>
    entryOf(state, conversationId, kind);

export const selectWorkingDocEnabled =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): boolean =>
    // OPT-IN: off unless an entry says otherwise. The durable on/off is
    // restored from the cx_conversation_documents junction on mount; absent
    // any entry the document is off.
    entryOf(state, conversationId, kind)?.enabled ?? false;

export const selectWorkingDocContent =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): string =>
    entryOf(state, conversationId, kind)?.content ?? "";

export const selectWorkingDocTitle =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): string =>
    // Empty by default — the document is "unnamed" until the user names it.
    // Display surfaces fall back ("Working document" / "Scratchpad") for an
    // empty title; we never persist that fallback as a real title.
    entryOf(state, conversationId, kind)?.title ?? "";

export const selectWorkingDocBinding =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): WorkingDocumentBinding =>
    entryOf(state, conversationId, kind)?.binding ?? NO_BINDING;

export const selectWorkingDocSaving =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): boolean =>
    entryOf(state, conversationId, kind)?.saving ?? false;

export const selectWorkingDocError =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): string | null =>
    entryOf(state, conversationId, kind)?.lastError ?? null;

export const selectWorkingDocAgentRevision =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): number =>
    entryOf(state, conversationId, kind)?.agentRevision ?? 0;

/** Whether the durable row exists yet (materialize-on-write). */
export const selectWorkingDocMaterialized =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): boolean =>
    entryOf(state, conversationId, kind)?.materialized ?? false;

/** The row `version` the local content is based on (conflict base). */
export const selectWorkingDocVersion =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): number =>
    entryOf(state, conversationId, kind)?.version ?? 0;

/**
 * The user's ACTIVE scratchpad id (durable, cross-device pointer). Lives in
 * the synced userPreferences store; null until the first scratchpad exists.
 */
export const selectActiveScratchpadId = (state: ChatRootState): string | null =>
  selectPreferredScratchpadId(state);

const NO_ATTACHED: string[] = [];

/** ADDITIONAL scratchpads attached to a conversation (active one excluded). */
export const selectAttachedScratchpadIds =
  (conversationId: string) =>
  (state: ChatRootState): string[] =>
    state.instanceWorkingDocument.attachedScratchByConversation[
      conversationId
    ] ?? NO_ATTACHED;

/** A pending concurrent-edit conflict the user must reconcile, or null. */
export const selectWorkingDocConflict =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: ChatRootState): { agentVersion: number; agentContent: string } | null =>
    entryOf(state, conversationId, kind)?.conflict ?? null;
