import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { EditorFile } from "../types";

export interface CodeTabsState {
  /** Map of tabId → file. */
  byId: Record<string, EditorFile>;
  /** Ordered list of open tab ids (left-to-right in the strip). */
  order: string[];
  /** Active tab id. */
  activeId: string | null;
  /**
   * MRU stack of tab ids the user has opened or activated, most-recent
   * first, capped at RECENT_FILES_CAP. Survives tab close so an agent
   * can still see "the last 10 files this user touched" even if some
   * have been closed since.
   *
   * Stored as `${filesystemId}:${path}` (the same shape as `EditorFile.id`)
   * so we can resolve back to the originating filesystem if needed.
   */
  recentTabIds: string[];
}

export const RECENT_FILES_CAP = 10;

const initialState: CodeTabsState = {
  byId: {},
  order: [],
  activeId: null,
  recentTabIds: [],
};

function bumpRecent(state: CodeTabsState, id: string) {
  // MRU semantics: drop any earlier occurrence, push to front, trim
  // to the cap. We don't reach for `Set` here because the order matters
  // and arrays this small don't benefit from hash lookups.
  const idx = state.recentTabIds.indexOf(id);
  if (idx !== -1) state.recentTabIds.splice(idx, 1);
  state.recentTabIds.unshift(id);
  if (state.recentTabIds.length > RECENT_FILES_CAP) {
    state.recentTabIds.length = RECENT_FILES_CAP;
  }
}

const slice = createSlice({
  name: "codeTabs",
  initialState,
  reducers: {
    openTab(state, action: PayloadAction<EditorFile>) {
      const file = action.payload;
      if (!state.byId[file.id]) {
        state.byId[file.id] = { ...file, dirty: false };
        state.order.push(file.id);
      }
      state.activeId = file.id;
      bumpRecent(state, file.id);
    },
    closeTab(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (!state.byId[id]) return;
      delete state.byId[id];
      const idx = state.order.indexOf(id);
      if (idx !== -1) state.order.splice(idx, 1);
      if (state.activeId === id) {
        const next = state.order[idx] ?? state.order[idx - 1] ?? null;
        state.activeId = next;
      }
      // Closing a source tab also closes any paired render-preview tab —
      // a preview without its buffer is dead weight, and leaving it open
      // means the user has to close two things to dismiss one feature.
      const orphaned: string[] = [];
      for (const tabId of state.order) {
        const t = state.byId[tabId];
        if (t?.kind === "render-preview" && t.renderSourceTabId === id) {
          orphaned.push(tabId);
        }
      }
      for (const tabId of orphaned) {
        delete state.byId[tabId];
        const oIdx = state.order.indexOf(tabId);
        if (oIdx !== -1) state.order.splice(oIdx, 1);
        if (state.activeId === tabId) {
          state.activeId = state.order[oIdx] ?? state.order[oIdx - 1] ?? null;
        }
      }
    },
    setActiveTab(state, action: PayloadAction<string>) {
      if (state.byId[action.payload]) {
        state.activeId = action.payload;
        bumpRecent(state, action.payload);
      }
    },
    updateTabContent(
      state,
      action: PayloadAction<{
        id: string;
        content: string;
        /**
         * Where the mutation came from. Defaults to `"user"` so the
         * common Monaco-typing path doesn't have to thread it through
         * — only AI-driven dispatches (TabDiffView accept,
         * undo/revert thunks) need to flag themselves. The keyboard
         * undo binding reads this back to decide whether
         * `Cmd/Ctrl+Z` should fall through to Monaco (user typing) or
         * fire `undoLastEditThunk` (AI mutation).
         */
        source?: "user" | "ai" | "ai-undo";
      }>,
    ) {
      const tab = state.byId[action.payload.id];
      if (!tab) return;
      tab.content = action.payload.content;
      tab.dirty = tab.content !== tab.pristineContent;
      tab.lastMutationSource = action.payload.source ?? "user";
    },
    markTabSaved(state, action: PayloadAction<string>) {
      const tab = state.byId[action.payload];
      if (!tab) return;
      tab.pristineContent = tab.content;
      tab.dirty = false;
      tab.lastSavedAt = new Date().toISOString();
    },
    /** Refresh the `remoteUpdatedAt` stored alongside a tab — used by
     *  the source adapter save path to keep the optimistic guard in
     *  sync with the row after a successful write. */
    setTabRemoteUpdatedAt(
      state,
      action: PayloadAction<{ id: string; remoteUpdatedAt: string }>,
    ) {
      const tab = state.byId[action.payload.id];
      if (!tab) return;
      tab.remoteUpdatedAt = action.payload.remoteUpdatedAt;
    },
    /** Replace a tab's buffer wholesale — used when the user elects to
     *  "Reload from remote" after a conflict, or when an external
     *  source (e.g. the save-and-open helper) wants to refresh a tab
     *  whose row has moved on. */
    replaceTabContent(
      state,
      action: PayloadAction<{
        id: string;
        content: string;
        remoteUpdatedAt?: string;
      }>,
    ) {
      const tab = state.byId[action.payload.id];
      if (!tab) return;
      tab.content = action.payload.content;
      tab.pristineContent = action.payload.content;
      tab.dirty = false;
      if (action.payload.remoteUpdatedAt !== undefined) {
        tab.remoteUpdatedAt = action.payload.remoteUpdatedAt;
      }
    },
    /**
     * Convert a non-editor tab (`binary-preview` / `cloud-file-preview`)
     * into a real Monaco-backed editor tab with the supplied content. Used
     * by the "View as text" override on the binary viewer so users can
     * inspect (and edit) files the registry didn't recognize as text. The
     * tab keeps its id, name, and path — only `kind`, `language`,
     * `content`, and `pristineContent` change so the rest of the editor
     * surface (saves, AI patches, selection-as-context) lights up.
     */
    convertTabToEditor(
      state,
      action: PayloadAction<{
        id: string;
        content: string;
        language: string;
      }>,
    ) {
      const tab = state.byId[action.payload.id];
      if (!tab) return;
      tab.kind = "editor";
      tab.content = action.payload.content;
      tab.pristineContent = action.payload.content;
      tab.language = action.payload.language;
      tab.dirty = false;
      tab.mime = undefined;
      tab.cloudFileId = undefined;
    },
    moveTab(state, action: PayloadAction<{ id: string; toIndex: number }>) {
      const { id, toIndex } = action.payload;
      const from = state.order.indexOf(id);
      if (from === -1) return;
      state.order.splice(from, 1);
      state.order.splice(
        Math.max(0, Math.min(toIndex, state.order.length)),
        0,
        id,
      );
    },
    closeAllTabs(state) {
      state.byId = {};
      state.order = [];
      state.activeId = null;
      // Recent stack survives a "close all" — those file paths are still
      // historically interesting to the agent and the user might want to
      // reopen them. Cleared explicitly via `clearRecentTabs` if needed.
    },
    clearRecentTabs(state) {
      state.recentTabIds = [];
    },
    /**
     * Update a tab's user-visible identity (name / path / language) without
     * touching its content. Used after a successful rename — the underlying
     * row is the same, but the displayed filename and the Monaco virtual
     * path need to refresh so syntax highlighting / type-checking re-derive
     * from the new extension.
     *
     * The tab id stays stable (library-source tab ids are
     * `${prefix}:${rowId}` — they don't carry the filename).
     */
    renameTab(
      state,
      action: PayloadAction<{
        id: string;
        name?: string;
        path?: string;
        language?: string;
      }>,
    ) {
      const tab = state.byId[action.payload.id];
      if (!tab) return;
      if (action.payload.name !== undefined) tab.name = action.payload.name;
      if (action.payload.path !== undefined) tab.path = action.payload.path;
      if (action.payload.language !== undefined)
        tab.language = action.payload.language;
    },
  },
});

export const {
  openTab,
  closeTab,
  setActiveTab,
  updateTabContent,
  markTabSaved,
  setTabRemoteUpdatedAt,
  replaceTabContent,
  convertTabToEditor,
  moveTab,
  closeAllTabs,
  clearRecentTabs,
  renameTab,
} = slice.actions;

export default slice.reducer;

// ─── Selectors ──────────────────────────────────────────────────────────────

const emptyOrder: string[] = [];

type WithCodeTabs = { codeTabs: CodeTabsState };

export const selectCodeTabs = (state: WithCodeTabs) =>
  state.codeTabs ?? initialState;
export const selectTabOrder = (state: WithCodeTabs) =>
  selectCodeTabs(state).order ?? emptyOrder;
export const selectTabById = (id: string) => (state: WithCodeTabs) =>
  selectCodeTabs(state).byId[id];
export const selectActiveTabId = (state: WithCodeTabs) =>
  selectCodeTabs(state).activeId;
export const selectActiveTab = (state: WithCodeTabs) => {
  const tabs = selectCodeTabs(state);
  return tabs.activeId ? tabs.byId[tabs.activeId] : null;
};
export const selectRecentTabIds = (state: WithCodeTabs) =>
  selectCodeTabs(state).recentTabIds ?? emptyOrder;
