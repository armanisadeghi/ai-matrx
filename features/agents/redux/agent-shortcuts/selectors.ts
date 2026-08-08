"use client";

import { createSelector } from "reselect";
import type { RootState } from "@/lib/redux/store";
import type {
  AgentShortcut,
  AgentShortcutRecord,
  AgentShortcutSliceState,
} from "./types";
import type { FieldFlags } from "../shared/field-flags";
import { hasField } from "../shared/field-flags";
import {
  matchesScope,
  scopeIndexKey,
  type Scope,
  type ScopeRef,
} from "../shared/scope";

// ---------------------------------------------------------------------------
// Slice root
// ---------------------------------------------------------------------------

const selectAgentShortcutSlice = (state: RootState) => state.agentShortcut;

// ---------------------------------------------------------------------------
// Registry & phase tracking
// ---------------------------------------------------------------------------

export const selectAllShortcuts = createSelector(
  [selectAgentShortcutSlice],
  (slice) => slice.shortcuts,
);

export const selectActiveShortcutId = createSelector(
  [selectAgentShortcutSlice],
  (slice) => slice.activeShortcutId,
);

export const selectShortcutsInitialLoaded = createSelector(
  [selectAgentShortcutSlice],
  (slice) => slice.initialLoaded,
);

export const selectShortcutsContextLoaded = createSelector(
  [selectAgentShortcutSlice],
  (slice) => slice.contextLoaded,
);

/**
 * Returns true if phase-2 has already been fetched for the given context key.
 * Key format: "workspace:{id}" | "project:{id}" | "task:{id}"
 */
export const selectIsContextLoaded = createSelector(
  [selectShortcutsContextLoaded, (_state: RootState, key: string) => key],
  (contextLoaded, key): boolean => contextLoaded[key] ?? false,
);

export const selectShortcutsSliceStatus = createSelector(
  [selectAgentShortcutSlice],
  (slice) => slice.status,
);

export const selectShortcutsSliceError = createSelector(
  [selectAgentShortcutSlice],
  (slice) => slice.error,
);

// ---------------------------------------------------------------------------
// Single shortcut by id
// ---------------------------------------------------------------------------

/**
 * Imperative lookup for thunks, sagas, and middleware.
 * The normalized registry is `state.agentShortcut.shortcuts` — never index
 * `state.agentShortcut[shortcutId]` (wrong shape; almost always undefined at runtime).
 *
 * For `useSelector` / `useAppSelector`, prefer memoized {@link selectShortcutById}.
 */
export function getShortcutRecordFromState(
  state: RootState,
  shortcutId: string,
): AgentShortcutRecord | undefined {
  const registry: AgentShortcutSliceState["shortcuts"] =
    state.agentShortcut.shortcuts;
  return registry[shortcutId];
}

/** Returns the full record (including runtime flags) or undefined. */
export const selectShortcutById = createSelector(
  [selectAllShortcuts, (_state: RootState, id: string) => id],
  (shortcuts, id): AgentShortcutRecord | undefined => shortcuts[id],
);

/** Returns the pure domain fields (no _ prefixed runtime flags). */
export const selectShortcutDefinition = createSelector(
  [selectShortcutById],
  (record): AgentShortcut | undefined => {
    if (!record) return undefined;
    const {
      _dirty,
      _dirtyFields,
      _fieldHistory,
      _loadedFields,
      _loading,
      _error,
      ...definition
    } = record;
    return definition;
  },
);

// ---------------------------------------------------------------------------
// Execution — version reference resolution
// ---------------------------------------------------------------------------

/**
 * Returns the stable agent id (agents table) for display / drift detection.
 * NOT the id to pass to the backend for execution — use selectShortcutResolvedRef.
 */
export const selectShortcutAgentId = createSelector(
  [selectShortcutById],
  (record): string | null => record?.agentId ?? null,
);

/**
 * Returns the version reference config fields for editing the shortcut.
 *   agentId        — FK → agents (display identity)
 *   agentVersionId — FK → agx_version (the pinned version, if any)
 *   useLatest      — true = always resolve to live agent
 */
export const selectShortcutVersionRef = createSelector(
  [selectShortcutById],
  (record) => {
    if (!record) return null;
    return {
      agentId: record.agentId,
      agentVersionId: record.agentVersionId,
      useLatest: record.useLatest,
    };
  },
);

/**
 * Returns the execution config fields embedded on the shortcut.
 * These control how the result is displayed after the agent runs.
 */
export const selectShortcutExecutionConfig = createSelector(
  [selectShortcutById],
  (record) => {
    if (!record) return null;
    return {
      displayMode: record.displayMode,
      allowChat: record.allowChat,
      autoRun: record.autoRun,
      showVariablePanel: record.showVariablePanel,
      showPreExecutionGate: record.showPreExecutionGate,
    };
  },
);

// ---------------------------------------------------------------------------
// Individual fields
// ---------------------------------------------------------------------------

export const selectShortcutLabel = createSelector(
  [selectShortcutById],
  (record) => record?.label ?? null,
);

export const selectShortcutDescription = createSelector(
  [selectShortcutById],
  (record) => record?.description ?? null,
);

export const selectShortcutIconName = createSelector(
  [selectShortcutById],
  (record) => record?.iconName ?? null,
);

export const selectShortcutKeyboardShortcut = createSelector(
  [selectShortcutById],
  (record) => record?.keyboardShortcut ?? null,
);

export const selectShortcutEnabledFeatures = createSelector(
  [selectShortcutById],
  (record) => record?.enabledFeatures,
);

export const selectShortcutScopeMappings = createSelector(
  [selectShortcutById],
  (record) => record?.scopeMappings ?? null,
);

export const selectShortcutContextMappings = createSelector(
  [selectShortcutById],
  (record) => record?.contextMappings ?? null,
);

export const selectShortcutCategoryId = createSelector(
  [selectShortcutById],
  (record) => record?.categoryId ?? null,
);

export const selectShortcutSortOrder = createSelector(
  [selectShortcutById],
  (record) => record?.sortOrder ?? 0,
);

// ---------------------------------------------------------------------------
// Status flags
// ---------------------------------------------------------------------------

export const selectShortcutIsDirty = createSelector(
  [selectShortcutById],
  (record): boolean => record?._dirty ?? false,
);

export const selectShortcutDirtyFields = createSelector(
  [selectShortcutById],
  (record): FieldFlags<keyof AgentShortcut> | undefined => record?._dirtyFields,
);

export const selectShortcutFieldHistory = createSelector(
  [selectShortcutById],
  (record) => record?._fieldHistory,
);

export const selectShortcutLoadedFields = createSelector(
  [selectShortcutById],
  (record): FieldFlags<keyof AgentShortcut> | undefined =>
    record?._loadedFields,
);

export const selectShortcutIsLoading = createSelector(
  [selectShortcutById],
  (record): boolean => record?._loading ?? false,
);

export const selectShortcutError = createSelector(
  [selectShortcutById],
  (record): string | null => record?._error ?? null,
);

export const selectShortcutIsActive = createSelector(
  [selectShortcutById],
  (record): boolean => record?.isActive ?? false,
);

/** True if a specific field has been fetched from the DB. */
export const selectShortcutFieldIsLoaded = createSelector(
  [
    selectShortcutById,
    (_state: RootState, _id: string, field: keyof AgentShortcut) => field,
  ],
  (record, field): boolean =>
    record ? hasField(record._loadedFields, field) : false,
);

/** Returns the original (pre-edit) value for a single dirty field. */
export const selectShortcutFieldOriginalValue = createSelector(
  [
    selectShortcutById,
    (_state: RootState, _id: string, field: keyof AgentShortcut) => field,
  ],
  (record, field) => record?._fieldHistory[field] ?? undefined,
);

// ---------------------------------------------------------------------------
// Ownership / visibility classification
// ---------------------------------------------------------------------------

/**
 * System shortcuts: no user_id AND no org_id.
 * These are read-only for all users.
 */
export const selectShortcutIsSystem = createSelector(
  [selectShortcutById],
  (record): boolean =>
    record != null && record.userId === null && record.organizationId === null,
);

/**
 * Returns true if the shortcut belongs to the given user.
 * Pass the current user's id as the second argument.
 */
export const selectShortcutIsOwnedByUser = createSelector(
  [
    selectShortcutById,
    (_state: RootState, _id: string, userId: string) => userId,
  ],
  (record, userId): boolean => record?.userId === userId,
);

// ---------------------------------------------------------------------------
// List-level selectors (all shortcuts)
// ---------------------------------------------------------------------------

export const selectAllShortcutIds = createSelector(
  [selectAllShortcuts],
  (shortcuts): string[] => Object.keys(shortcuts),
);

export const selectAllShortcutsArray = createSelector(
  [selectAllShortcuts],
  (shortcuts): AgentShortcutRecord[] => Object.values(shortcuts),
);

/** System shortcuts — user_id IS NULL AND org_id IS NULL. Read-only. */
export const selectSystemShortcuts = createSelector(
  [selectAllShortcutsArray],
  (shortcuts) =>
    shortcuts.filter((s) => s.userId === null && s.organizationId === null),
);

/** User-owned shortcuts — user_id matches. Pass the current user id. */
export const selectUserOwnedShortcuts = createSelector(
  [selectAllShortcutsArray, (_state: RootState, userId: string) => userId],
  (shortcuts, userId) => shortcuts.filter((s) => s.userId === userId),
);

/** Org-scoped shortcuts (not system, not personal). */
export const selectOrgShortcuts = createSelector(
  [selectAllShortcutsArray],
  (shortcuts) =>
    shortcuts.filter((s) => s.organizationId !== null && s.userId === null),
);

/** Active shortcuts only (isActive = true). */
export const selectActiveShortcuts = createSelector(
  [selectAllShortcutsArray],
  (shortcuts) => shortcuts.filter((s) => s.isActive),
);

/**
 * Shortcuts that are active and enabled for a given feature/surface key.
 * e.g. selectShortcutsForFeature(state, "chat")
 */
export const selectShortcutsForFeature = createSelector(
  [selectActiveShortcuts, (_state: RootState, feature: string) => feature],
  (shortcuts, feature) =>
    shortcuts.filter(
      (s) =>
        s.enabledFeatures.includes(
          feature as AgentShortcut["enabledFeatures"][number],
        ) ||
        s.enabledFeatures.includes(
          "general" as AgentShortcut["enabledFeatures"][number],
        ),
    ),
);

/** Shortcuts pointing to a specific agent id (stable identity). */
export const selectShortcutsByAgentId = createSelector(
  [selectAllShortcutsArray, (_state: RootState, agentId: string) => agentId],
  (shortcuts, agentId) => shortcuts.filter((s) => s.agentId === agentId),
);

/**
 * Shortcuts that are pinned to a specific agx_version.id.
 * Useful for showing which shortcuts would be affected by a version change.
 */
export const selectShortcutsByVersionId = createSelector(
  [
    selectAllShortcutsArray,
    (_state: RootState, versionId: string) => versionId,
  ],
  (shortcuts, versionId) =>
    shortcuts.filter((s) => s.agentVersionId === versionId),
);

/** Shortcuts that always follow the live agent (use_latest = true). */
export const selectLatestShortcuts = createSelector(
  [selectAllShortcutsArray],
  (shortcuts) => shortcuts.filter((s) => s.useLatest),
);

/** Shortcuts that are pinned to a specific version (use_latest = false, agentVersionId set). */
export const selectPinnedShortcuts = createSelector(
  [selectAllShortcutsArray],
  (shortcuts) =>
    shortcuts.filter((s) => !s.useLatest && s.agentVersionId !== null),
);

/** Shortcuts with unsaved local changes. */
export const selectDirtyShortcuts = createSelector(
  [selectAllShortcutsArray],
  (shortcuts) => shortcuts.filter((s) => s._dirty),
);

/**
 * Shortcuts grouped by category id.
 * Returns a map: { [categoryId]: AgentShortcutRecord[] }
 */
export const selectShortcutsGroupedByCategory = createSelector(
  [selectActiveShortcuts],
  (shortcuts) =>
    shortcuts.reduce<Record<string, AgentShortcutRecord[]>>((acc, s) => {
      if (!acc[s.categoryId]) acc[s.categoryId] = [];
      acc[s.categoryId].push(s);
      return acc;
    }, {}),
);

// ---------------------------------------------------------------------------
// Active shortcut (shorthand — requires activeShortcutId to be set)
// ---------------------------------------------------------------------------

export const selectActiveShortcut = createSelector(
  [selectAllShortcuts, selectActiveShortcutId],
  (shortcuts, id): AgentShortcutRecord | undefined =>
    id != null ? shortcuts[id] : undefined,
);

export const selectActiveShortcutIsDirty = createSelector(
  [selectActiveShortcut],
  (record): boolean => record?._dirty ?? false,
);

export const selectActiveShortcutIsLoading = createSelector(
  [selectActiveShortcut],
  (record): boolean => record?._loading ?? false,
);

export const selectActiveShortcutAgentId = createSelector(
  [selectActiveShortcut],
  (record): string | null => record?.agentId ?? null,
);

// ---------------------------------------------------------------------------
// Scope-aware selectors
// ---------------------------------------------------------------------------

const selectShortcutScopeLoadedMap = (state: RootState) =>
  state.agentShortcut.scopeLoaded;

export const selectIsShortcutScopeLoaded = createSelector(
  [
    selectShortcutScopeLoadedMap,
    (_s: RootState, scope: Scope, scopeId?: string | null) =>
      scopeIndexKey({ scope, scopeId: scopeId ?? null }),
  ],
  (scopeLoaded, key) => scopeLoaded[key] ?? false,
);

export const selectShortcutsByScope = createSelector(
  [
    selectAllShortcutsArray,
    (_s: RootState, scope: Scope, _scopeId?: string | null) => scope,
    (_s: RootState, _scope: Scope, scopeId?: string | null) => scopeId ?? null,
  ],
  (shortcuts, scope, scopeId): AgentShortcutRecord[] =>
    shortcuts.filter((s) =>
      matchesScope(s, { scope, scopeId: scopeId ?? null }),
    ),
);

export const selectShortcutsByScopeRef = createSelector(
  [selectAllShortcutsArray, (_s: RootState, ref: ScopeRef) => ref],
  (shortcuts, ref) => shortcuts.filter((s) => matchesScope(s, ref)),
);

export const selectActiveShortcutsByScope = createSelector(
  [selectShortcutsByScope],
  (shortcuts) => shortcuts.filter((s) => s.isActive),
);

// ---------------------------------------------------------------------------
// Re-exports — unified selector surface for shortcuts + categories + content blocks
// ---------------------------------------------------------------------------

export {
  selectAllCategoriesMap,
  selectAllCategoriesArray,
  selectCategoryById,
  selectCategoryDefinition,
  selectCategoryIsDirty,
  selectCategoryIsLoading,
  selectCategoryError,
  selectCategoriesByScope,
  selectCategoriesByScopeRef,
  selectCategoriesByPlacementType,
  selectCategoryTreeByScope,
  selectCategoryTreeStructuredByScope,
  selectCategoryIdsByScopeMap,
  selectCategoriesStatus,
  selectCategoriesError,
  selectCategoryScopeLoaded,
  selectIsCategoryScopeLoaded,
  selectActiveCategoryId,
  selectGlobalCategories,
  selectUserCategories,
  selectOrgCategories,
} from "../agent-shortcut-categories/selectors";

// Content blocks are canonical `skill.render_definition` rows served by the
// skl slice; these names read through the compatibility layer.
export {
  selectAllContentBlocksArray,
  selectContentBlocksByScope,
  selectContentBlocksByScopeRef,
  selectActiveContentBlocks,
} from "@/features/agent-connections/redux/skl/content-block-compat";

export type { CategoryTree } from "../agent-shortcut-categories/selectors";
