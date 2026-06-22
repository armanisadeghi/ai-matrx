/**
 * Instance Working Document selectors.
 *
 * Per-property selectors keyed by `(conversationId, kind)`. `kind` defaults to
 * "working" so every existing call site (which passes only a conversationId)
 * is unchanged. All return primitives or stable stored references (Immer only
 * swaps a reference when that exact sub-object is mutated), so none need
 * `createSelector` memoisation.
 */

import type { RootState } from "@/lib/redux/store";
import {
  DEFAULT_DOC_KIND,
  NO_BINDING,
  workingDocKey,
  type InstanceWorkingDocumentState,
  type WorkingDocumentBinding,
  type WorkingDocumentKind,
} from "./instance-working-document.slice";

const entryOf = (
  state: RootState,
  conversationId: string,
  kind: WorkingDocumentKind,
): InstanceWorkingDocumentState | undefined =>
  state.instanceWorkingDocument.byKey[workingDocKey(conversationId, kind)];

export const selectWorkingDocEntry =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: RootState): InstanceWorkingDocumentState | undefined =>
    entryOf(state, conversationId, kind);

export const selectWorkingDocEnabled =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: RootState): boolean =>
    // OPT-IN: off unless an entry says otherwise. The durable on/off is
    // restored from the cx_conversation_documents junction on mount; absent
    // any entry the document is off.
    entryOf(state, conversationId, kind)?.enabled ?? false;

export const selectWorkingDocContent =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: RootState): string =>
    entryOf(state, conversationId, kind)?.content ?? "";

export const selectWorkingDocTitle =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: RootState): string =>
    // Empty by default — the document is "unnamed" until the user names it.
    // Display surfaces fall back ("Working document" / "Scratchpad") for an
    // empty title; we never persist that fallback as a real title.
    entryOf(state, conversationId, kind)?.title ?? "";

export const selectWorkingDocBinding =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: RootState): WorkingDocumentBinding =>
    entryOf(state, conversationId, kind)?.binding ?? NO_BINDING;

export const selectWorkingDocSaving =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: RootState): boolean =>
    entryOf(state, conversationId, kind)?.saving ?? false;

export const selectWorkingDocError =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: RootState): string | null =>
    entryOf(state, conversationId, kind)?.lastError ?? null;

export const selectWorkingDocAgentRevision =
  (conversationId: string, kind: WorkingDocumentKind = DEFAULT_DOC_KIND) =>
  (state: RootState): number =>
    entryOf(state, conversationId, kind)?.agentRevision ?? 0;
