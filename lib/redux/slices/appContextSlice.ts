// lib/redux/slices/appContextSlice.ts
//
// CANONICAL location for the "where are you working" app-context slice.
// Moved here from features/agent-context/redux/appContextSlice.ts during the
// scopes module rebuild (see features/scopes/FEATURE.md).
//
// Why lib/redux/slices instead of a feature folder:
//   - Read by every consumer that runs an agent, fetches scoped data, or
//     renders a sidebar (notes, tasks, projects, research, agents, files,
//     agent-apps, code, conversation, ...).
//   - Owned by no single feature. The import path makes that explicit.
//   - Action creators are now imported (and dispatched) ONLY by Surface A
//     components under features/scopes/components/active-context/**.
//     Every other surface that wants to "tag this with a scope" goes
//     through features/scopes thunks against ctx_scope_assignments — it
//     never touches this slice directly.
//
// Hierarchy:
//   auth.users
//   └── organizations
//       └── scopes              (user-defined dimensions; see features/scopes)
//           └── projects
//               └── tasks       (nestable — parent_task_id)
//                   └── conversations
//
// All fields are nullable — none means "scope is just the current user".
// Setting org narrows scope; setting project narrows further; etc. The
// scope_selections map keys by scope_type_id and values are scope_ids —
// exactly one scope per scope_type (collisions are rejected at reducer).
//
// Stamped onto every API call by lib/api/call-api.ts → resolveScope.

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface AppContextState {
  /** Currently active organization */
  organization_id: string | null;
  organization_name: string | null;

  /**
   * Scope selections — MULTI-SELECT (2026-06-12). Keyed by scope id; value is
   * the same scope id (map shape kept for type-compatibility; null values are
   * tolerated and ignored). Any number of scopes across any scope types can
   * be active at once; consumers flatten with Object.values().
   *
   * History: previously keyed by scope_type_id with exactly one scope per
   * type — that cardinality is GONE. Do not reintroduce it.
   */
  scope_selections: Record<string, string | null>;

  /** Currently active project (lives under an org, scoped by scope_selections) */
  project_id: string | null;
  project_name: string | null;

  /** Currently active task (nestable, lives under a project) */
  task_id: string | null;
  task_name: string | null;

  /** Currently active conversation */
  conversation_id: string | null;
}

const initialState: AppContextState = {
  organization_id: null,
  organization_name: null,
  scope_selections: {},
  project_id: null,
  project_name: null,
  task_id: null,
  task_name: null,
  conversation_id: null,
};

const appContextSlice = createSlice({
  name: "appContext",
  initialState,
  reducers: {
    setOrganization: (
      state,
      action: PayloadAction<{ id: string | null; name?: string | null }>,
    ) => {
      state.organization_id = action.payload.id;
      state.organization_name = action.payload.name ?? null;
      state.scope_selections = {};
      state.project_id = null;
      state.project_name = null;
      state.task_id = null;
      state.task_name = null;
      state.conversation_id = null;
    },
    setScopeSelections: (
      state,
      action: PayloadAction<Record<string, string | null>>,
    ) => {
      state.scope_selections = action.payload;
      state.project_id = null;
      state.project_name = null;
      state.task_id = null;
      state.task_name = null;
    },
    setProject: (
      state,
      action: PayloadAction<{ id: string | null; name?: string | null }>,
    ) => {
      state.project_id = action.payload.id;
      state.project_name = action.payload.name ?? null;
      state.task_id = null;
      state.task_name = null;
      state.conversation_id = null;
    },
    setTask: (
      state,
      action: PayloadAction<{ id: string | null; name?: string | null }>,
    ) => {
      state.task_id = action.payload.id;
      state.task_name = action.payload.name ?? null;
      state.conversation_id = null;
    },
    setConversation: (state, action: PayloadAction<string | null>) => {
      state.conversation_id = action.payload;
    },
    /**
     * Set multiple context fields at once without cascading resets.
     * Use this when restoring a full saved context (e.g. page reload,
     * deep-link navigation) where all values are already known.
     */
    setFullContext: (
      state,
      action: PayloadAction<Partial<AppContextState>>,
    ) => {
      if (action.payload.organization_id !== undefined)
        state.organization_id = action.payload.organization_id;
      if (action.payload.organization_name !== undefined)
        state.organization_name = action.payload.organization_name;
      if (action.payload.scope_selections !== undefined)
        state.scope_selections = action.payload.scope_selections;
      if (action.payload.project_id !== undefined)
        state.project_id = action.payload.project_id;
      if (action.payload.project_name !== undefined)
        state.project_name = action.payload.project_name;
      if (action.payload.task_id !== undefined)
        state.task_id = action.payload.task_id;
      if (action.payload.task_name !== undefined)
        state.task_name = action.payload.task_name;
      if (action.payload.conversation_id !== undefined)
        state.conversation_id = action.payload.conversation_id;
    },
    clearContext: () => initialState,
  },
});

export const {
  setOrganization,
  setScopeSelections,
  setProject,
  setTask,
  setConversation,
  setFullContext,
  clearContext,
} = appContextSlice.actions;

export default appContextSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────

type StateWithAppContext = { appContext: AppContextState };

export const selectOrganizationId = (
  state: StateWithAppContext,
): string | null => state.appContext.organization_id;

export const selectScopeSelectionsContext = (
  state: StateWithAppContext,
): Record<string, string | null> => state.appContext.scope_selections;

export const selectProjectId = (state: StateWithAppContext): string | null =>
  state.appContext.project_id;

export const selectTaskId = (state: StateWithAppContext): string | null =>
  state.appContext.task_id;

export const selectConversationId = (
  state: StateWithAppContext,
): string | null => state.appContext.conversation_id;

export const selectOrganizationName = (
  state: StateWithAppContext,
): string | null => state.appContext.organization_name;

export const selectProjectName = (state: StateWithAppContext): string | null =>
  state.appContext.project_name;

export const selectTaskName = (state: StateWithAppContext): string | null =>
  state.appContext.task_name;

/**
 * Returns the full context object reference directly from state.
 * Stable — only changes when a context field is actually updated.
 * Only use when you need all fields at once; prefer individual
 * primitive selectors (selectOrganizationId, etc.) otherwise.
 */
export const selectAppContext = (state: StateWithAppContext): AppContextState =>
  state.appContext;
