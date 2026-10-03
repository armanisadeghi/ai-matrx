/**
 * documentSessions — the metadata of each OPEN cloud document's one in-memory
 * model (`../document-model/documentModel.ts`), keyed by document id.
 *
 * The body is Univer's (the model relays it between views and saves it once);
 * what every view must agree on — is this document saving, saved, failed — is
 * here, so a board tile and the document's own page show one status for one
 * document instead of one per editor.
 */

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type DocumentSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface DocumentSessionMeta {
  saveStatus: DocumentSaveStatus;
  /** Editors showing this document in this tab right now. */
  views: number;
  /** ISO time of the last snapshot this tab wrote. */
  lastSavedAt: string | null;
}

interface DocumentSessionsState {
  byId: Record<string, DocumentSessionMeta>;
}

const initialState: DocumentSessionsState = { byId: {} };

const documentSessionsSlice = createSlice({
  name: "documentSessions",
  initialState,
  reducers: {
    documentSessionChanged(
      state,
      action: PayloadAction<{ id: string; patch: Partial<DocumentSessionMeta> }>,
    ) {
      const { id, patch } = action.payload;
      const current = state.byId[id] ?? { saveStatus: "idle", views: 0, lastSavedAt: null };
      state.byId[id] = { ...current, ...patch };
    },
    documentSessionClosed(state, action: PayloadAction<string>) {
      delete state.byId[action.payload];
    },
  },
});

export const { documentSessionChanged, documentSessionClosed } = documentSessionsSlice.actions;
export default documentSessionsSlice.reducer;

type WithDocumentSessions = { documentSessions?: DocumentSessionsState };

const selectSessions = (state: WithDocumentSessions) => state.documentSessions?.byId;

const statusSelectors = new Map<string, (state: WithDocumentSessions) => DocumentSaveStatus | undefined>();

/** One document's save status, shared by every view of it. */
export const selectDocumentSaveStatus = (documentId: string) => {
  let selector = statusSelectors.get(documentId);
  if (!selector) {
    selector = createSelector(selectSessions, (byId) => byId?.[documentId]?.saveStatus);
    statusSelectors.set(documentId, selector);
  }
  return selector;
};
