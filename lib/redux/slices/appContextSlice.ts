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
// Setting org narrows scope; setting project narrows further; etc.
//
// scope_selections is MULTI-SELECT (2026-06-12): any number of scopes across
// any number of scope types can be active at once (keyed by scope id). The old
// "exactly one scope per scope_type" cardinality is GONE — do not reintroduce
// it. See the AppContextState.scope_selections doc below.
//
// ⚠️ ACTIVE (passive) context vs USER-SELECTED context — load-bearing:
// this slice is the user's ACTIVE working context ("ground rules"), written
// ONLY by Surface A (features/scopes/components/active-context/**). It is NOT
// what the user is setting ON a specific object. Object-level assignment (the
// "tag THIS with…" action) goes through features/scopes against
// ctx_scope_assignments / canonical associations and MUST read the user's
// explicit UI selection — never reach into this slice just because it's loaded.
//
// Stamped onto every API call by lib/api/call-api.ts → resolveScope.

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { definePolicy } from "@/lib/sync/policies/define";
import {
  REHYDRATE_ACTION_TYPE,
  type RehydrateAction,
} from "@/lib/sync/engine/rehydrate";

export interface AppContextState {
  /** Currently active organization */
  organization_id: string | null;
  organization_name: string | null;

  /**
   * The user's PERSONAL organization id (is_personal = true). Set once at
   * shell hydration by the active-org bootstrap; it is NOT the active org and
   * is NEVER reset by setOrganization. It exists so the API layer can fall
   * back to a guaranteed-valid org while org enforcement is still soft —
   * see selectEffectiveOrganizationId. A user always has exactly one.
   */
  personal_organization_id: string | null;

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

  /**
   * Active scope TYPES with NO specific scope chosen (2026-06-30). Rare but
   * real: "I'm working in the Clients dimension" / an HR manager activating
   * "Departments" / a parent activating "Kids" — without narrowing to one
   * instance. Independent of `scope_selections` (which holds chosen scope
   * instances): a type id here means "this whole dimension is in play." A type
   * that already has a chosen scope in `scope_selections` does NOT need to be
   * listed here. Flatten both for the full active picture.
   */
  active_scope_type_ids: string[];

  /** Currently active project (lives under an org, scoped by scope_selections) */
  project_id: string | null;
  project_name: string | null;

  /** Currently active task (nestable, lives under a project) */
  task_id: string | null;
  task_name: string | null;

  /** Currently active conversation */
  conversation_id: string | null;

  /**
   * True once the active-org bootstrap has run to completion (whether or not it
   * selected an org). The UI gates the "no org" cues (red avatar ring + the
   * drop-down reminder) on this so they only appear after we genuinely know the
   * user has no org — never as a flash during boot before the default/personal
   * org has had a chance to resolve. Set only by bootstrapActiveOrganization.
   */
  orgBootstrapResolved: boolean;
}

const initialState: AppContextState = {
  organization_id: null,
  organization_name: null,
  personal_organization_id: null,
  scope_selections: {},
  active_scope_type_ids: [],
  project_id: null,
  project_name: null,
  task_id: null,
  task_name: null,
  conversation_id: null,
  orgBootstrapResolved: false,
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
      state.active_scope_type_ids = [];
      state.project_id = null;
      state.project_name = null;
      state.task_id = null;
      state.task_name = null;
      state.conversation_id = null;
    },
    /**
     * Set the user's personal org id. Independent of the active org — does NOT
     * touch organization_id or reset any descendants. Set once at hydration.
     */
    setPersonalOrganization: (state, action: PayloadAction<string | null>) => {
      state.personal_organization_id = action.payload;
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
    /**
     * Set the active scope TYPES that have no specific scope chosen (the "whole
     * dimension is in play" case). Surface A only. Independent of
     * scope_selections — does NOT touch chosen scopes, project, or task.
     */
    setActiveScopeTypes: (state, action: PayloadAction<string[]>) => {
      state.active_scope_type_ids = action.payload;
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
     * Mark the active-org bootstrap as complete. Set once at hydration by
     * bootstrapActiveOrganization (after it has tried default → single-org →
     * give up) so the "no org" UI cues stop suppressing themselves.
     */
    setOrgBootstrapResolved: (state, action: PayloadAction<boolean>) => {
      state.orgBootstrapResolved = action.payload;
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
      if (action.payload.personal_organization_id !== undefined)
        state.personal_organization_id =
          action.payload.personal_organization_id;
      if (action.payload.scope_selections !== undefined)
        state.scope_selections = action.payload.scope_selections;
      if (action.payload.active_scope_type_ids !== undefined)
        state.active_scope_type_ids = action.payload.active_scope_type_ids;
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
  extraReducers: (builder) => {
    // Sync engine rehydrate — `appContextPolicy` (warm-cache) persists the org
    // identity fields (organization_id / _name / personal_organization_id) to
    // IDB→LS keyed by identity, and on boot the engine reads them back (cache
    // primary, else `remote.fetch` → resolveActiveOrgContext) and dispatches
    // REHYDRATE. This is what makes the active org PRESENT before any
    // service/selector runs — the single, always-there source of truth.
    //
    // Only the org identity fields are persisted (partialize). Working context
    // (project/task/scope/conversation) is intentionally NOT restored here —
    // it stays at initialState on a fresh boot.
    builder.addCase(REHYDRATE_ACTION_TYPE, (state, action: RehydrateAction) => {
      if (action.payload.sliceName !== "appContext") return;
      const loaded = action.payload.state as
        | Partial<AppContextState>
        | undefined;
      // Mark resolved even on an empty payload — the engine ran, so the "no
      // org" cues may stop suppressing themselves (selectShouldPromptForOrganization).
      state.orgBootstrapResolved = true;
      if (!loaded) return;
      if (loaded.personal_organization_id !== undefined) {
        state.personal_organization_id = loaded.personal_organization_id;
      }
      // Respect an org the user has already actively selected this session
      // (deep-link / restored context beat the async refresh here).
      if (state.organization_id == null) {
        if (loaded.organization_id !== undefined) {
          state.organization_id = loaded.organization_id;
        }
        if (loaded.organization_name !== undefined) {
          state.organization_name = loaded.organization_name;
        }
      }
    });
  },
});

export const {
  setOrganization,
  setPersonalOrganization,
  setScopeSelections,
  setActiveScopeTypes,
  setProject,
  setTask,
  setConversation,
  setOrgBootstrapResolved,
  setFullContext,
  clearContext,
} = appContextSlice.actions;

export default appContextSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────

type StateWithAppContext = { appContext: AppContextState };

export const selectOrganizationId = (
  state: StateWithAppContext,
): string | null => state.appContext.organization_id;

export const selectPersonalOrganizationId = (
  state: StateWithAppContext,
): string | null => state.appContext.personal_organization_id;

/**
 * The org id that should ride along on API calls. Returns the explicitly
 * selected org when set, otherwise falls back to the user's personal org.
 * This is the SOFT-enforcement fallback: while we work toward always having
 * an org selected, every request still carries a valid org id. Read this in
 * the API/scope layer instead of selectOrganizationId.
 */
export const selectEffectiveOrganizationId = (
  state: StateWithAppContext,
): string | null =>
  state.appContext.organization_id ?? state.appContext.personal_organization_id;

/**
 * True when the user has EXPLICITLY chosen an active org. False means we are
 * silently falling back to the personal org — the UI surfaces this as a
 * reminder (red ring on the avatar) so the user picks one.
 */
export const selectHasExplicitOrganization = (
  state: StateWithAppContext,
): boolean => state.appContext.organization_id != null;

/**
 * True once the active-org bootstrap has finished resolving. Gate the "no org"
 * UI cues (red avatar ring + drop-down reminder) on this so they never flash
 * during boot before the default/personal org has had a chance to load.
 */
export const selectOrgBootstrapResolved = (
  state: StateWithAppContext,
): boolean => state.appContext.orgBootstrapResolved;

/**
 * True when the UI should actively nudge the user to choose an org: the
 * bootstrap has resolved AND no org is explicitly selected. The single source
 * of truth for showing the red avatar ring and the header reminder peek.
 */
export const selectShouldPromptForOrganization = (
  state: StateWithAppContext,
): boolean =>
  state.appContext.orgBootstrapResolved &&
  state.appContext.organization_id == null;

export const selectScopeSelectionsContext = (
  state: StateWithAppContext,
): Record<string, string | null> => state.appContext.scope_selections;

const EMPTY_ACTIVE_SCOPE_TYPES: string[] = [];

/**
 * Active scope TYPES with no specific scope chosen (the "whole dimension is in
 * play" case). Independent of scope_selections. Stable empty array reference.
 */
export const selectActiveScopeTypeIds = (
  state: StateWithAppContext,
): string[] =>
  state.appContext.active_scope_type_ids.length > 0
    ? state.appContext.active_scope_type_ids
    : EMPTY_ACTIVE_SCOPE_TYPES;

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

// ---- Sync engine policy --------------------------------------------------
//
// `appContextPolicy` makes the ACTIVE ORGANIZATION a first-class, always-present
// citizen of the unified sync engine — the same machinery behind userPreferences
// / userProfile. This REPLACES the old ActiveOrgBootstrap island + per-launch
// multi-round-trip bootstrap. It:
//   - persists the org IDENTITY fields (organization_id / _name /
//     personal_organization_id) to IDB→localStorage, keyed by identity, so on a
//     hard refresh the active org rehydrates BEFORE any service/selector runs —
//     impossible to be missing;
//   - on cold-boot (and after `staleAfter`) runs `remote.fetch` →
//     resolveActiveOrgContext to reconcile against the durable default-org
//     preference + current memberships;
//   - broadcasts org switches across tabs in <20ms.
//
// `partialize` deliberately persists ONLY the org identity fields. Working
// context (scope/project/task/conversation) and the transient
// `orgBootstrapResolved` flag are NOT persisted — REHYDRATE sets the flag true.
//
// NOTE: there is no `remote.write` — the durable cross-device "which org" truth
// is the default-org PREFERENCE (owned by userPreferences), not a column here.
// The local cache restores the last active org instantly; `remote.fetch`
// reconciles. Switching orgs durably = set your default.

export const appContextPolicy = definePolicy<AppContextState>({
  sliceName: "appContext",
  preset: "warm-cache",
  version: 1, // Bump destroys client caches; Phase 6 adds migration hooks.
  broadcast: {
    actions: [
      "appContext/setOrganization",
      "appContext/setPersonalOrganization",
      "appContext/setFullContext",
      "appContext/clearContext",
    ],
  },
  storageKey: "matrx:appContext",
  partialize: [
    "organization_id",
    "organization_name",
    "personal_organization_id",
  ],
  serialize: (state) => ({
    organization_id: state.organization_id,
    organization_name: state.organization_name,
    personal_organization_id: state.personal_organization_id,
  }),
  deserialize: (raw) => {
    if (!raw || typeof raw !== "object") return {};
    const r = raw as Record<string, unknown>;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.length > 0 ? v : null;
    return {
      organization_id: str(r.organization_id),
      organization_name: str(r.organization_name),
      personal_organization_id: str(r.personal_organization_id),
    };
  },
  staleAfter: 5 * 60_000, // reconcile against default-pref / membership after 5 min idle
  remote: {
    fetch: async ({ identity, signal }) => {
      if (identity.type !== "auth") return null; // guests have no server org
      const { resolveActiveOrgContext } = await import(
        "@/lib/organizations/resolveActiveOrgContext"
      );
      const resolved = await resolveActiveOrgContext(identity.userId);
      if (signal.aborted || !resolved) return null;
      return resolved as Partial<AppContextState>;
    },
  },
});
