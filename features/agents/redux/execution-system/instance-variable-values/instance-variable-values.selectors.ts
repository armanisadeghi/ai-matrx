/**
 * Instance Variable Values Selectors
 *
 * CRITICAL: All selectors take only conversationId — never agentId.
 * Variable definitions are owned by the instance (copied at creation time).
 * The agent definition slice is never accessed from here.
 *
 * Stable empty constants are hoisted at module level so selectors always return
 * the same reference when the instance entry doesn't exist yet — preventing
 * spurious re-renders from inline `?? []` / `?? {}` literals.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

// Stable references returned when the instance hasn't been initialized yet.
const EMPTY_DEFINITIONS: VariableDefinition[] = [];
const EMPTY_RECORD: Record<string, unknown> = {};
const EMPTY_NAMES: string[] = [];
const EMPTY_PROVENANCE: Record<string, "user" | "scope" | "default" | "none"> =
  {};

/**
 * The instance's snapshotted variable definitions (copied from agent at creation).
 * Safe to call even if the source agent no longer exists.
 */
export const selectInstanceVariableDefinitions =
  (conversationId: string) =>
  (state: RootState): VariableDefinition[] =>
    state.instanceVariableValues.byConversationId[conversationId]
      ?.definitions ?? EMPTY_DEFINITIONS;

/**
 * Raw user-provided values for an instance.
 */
export const selectUserVariableValues =
  (conversationId: string) =>
  (state: RootState): Record<string, unknown> =>
    state.instanceVariableValues.byConversationId[conversationId]?.userValues ??
    EMPTY_RECORD;

/**
 * Raw scope-resolved values for an instance.
 */
export const selectScopeVariableValues =
  (conversationId: string) =>
  (state: RootState): Record<string, unknown> =>
    state.instanceVariableValues.byConversationId[conversationId]
      ?.scopeValues ?? EMPTY_RECORD;

/**
 * Fully resolved variables — the three-tier merge.
 * Priority: user-provided > scope-resolved > definition defaults
 *
 * Memoized with createSelector so the derived object is only rebuilt when
 * the underlying entry actually changes.
 */
export const selectResolvedVariables = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceVariableValues.byConversationId[conversationId],
    (entry) => {
      if (!entry) return EMPTY_RECORD;

      const { definitions, userValues, scopeValues } = entry;
      const resolved: Record<string, unknown> = {};

      for (const def of definitions) {
        if (def.name in userValues) {
          resolved[def.name] = userValues[def.name];
        } else if (def.name in scopeValues) {
          resolved[def.name] = scopeValues[def.name];
        } else if (
          def.defaultValue !== undefined &&
          def.defaultValue !== null
        ) {
          resolved[def.name] = def.defaultValue;
        } else {
          resolved[def.name] = null;
        }
      }

      return resolved;
    },
  );

/**
 * Variables to PUT ON THE REQUEST — the three-tier merge, but a scope-bound variable
 * the user hasn't explicitly set is OMITTED. The server resolves bound variables
 * authoritatively from the active scope; sending an unfilled (null) value would clobber
 * that scope value (client value wins). A user override (present in userValues) is sent
 * and correctly wins. Unbound variables keep their exact prior behavior (incl. null).
 */
export const selectVariablesForRequest = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceVariableValues.byConversationId[conversationId],
    (entry) => {
      if (!entry) return EMPTY_RECORD;
      const { definitions, userValues, scopeValues } = entry;
      const out: Record<string, unknown> = {};
      for (const def of definitions) {
        const isBound = !!(def.binding?.itemKey || def.binding?.contextItemId);
        if (def.name in userValues) {
          out[def.name] = userValues[def.name];
          continue;
        }
        // Bound + no explicit override → let the server fill it from scope.
        if (isBound) continue;
        if (def.name in scopeValues) {
          out[def.name] = scopeValues[def.name];
        } else if (def.defaultValue !== undefined && def.defaultValue !== null) {
          out[def.name] = def.defaultValue;
        } else {
          out[def.name] = null;
        }
      }
      return Object.keys(out).length === 0 ? EMPTY_RECORD : out;
    },
  );

/**
 * Variables that are required but have no value.
 * Used by the UI to show validation errors before execution.
 */
export const selectMissingRequiredVariables = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceVariableValues.byConversationId[conversationId],
    (entry) => {
      if (!entry) return EMPTY_NAMES;

      const { definitions, userValues, scopeValues } = entry;

      // Empty includes the multi-select picklist case: an empty array (nothing chosen).
      const isEmpty = (v: unknown) =>
        v === null ||
        v === undefined ||
        v === "" ||
        (Array.isArray(v) && v.length === 0);

      const missing = definitions
        .filter((def) => {
          if (!def.required) return false;
          // A scope-bound variable is NEVER a hard requirement — when no context provides
          // it, it falls back to an ordinary (optional) input. The server fills it from
          // scope when available. Bound vars must never block a run.
          if (def.binding?.itemKey || def.binding?.contextItemId) return false;
          if (def.name in userValues) {
            return isEmpty(userValues[def.name]);
          }
          if (def.name in scopeValues) {
            return isEmpty(scopeValues[def.name]);
          }
          return isEmpty(def.defaultValue);
        })
        .map((def) => def.name);

      return missing.length === 0 ? EMPTY_NAMES : missing;
    },
  );

/**
 * For each variable, where did its value come from?
 * Useful for the UI to show provenance indicators.
 */
export const selectVariableProvenance = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceVariableValues.byConversationId[conversationId],
    (entry) => {
      if (!entry) return EMPTY_PROVENANCE;

      const { definitions, userValues, scopeValues } = entry;
      const provenance: Record<string, "user" | "scope" | "default" | "none"> =
        {};

      for (const def of definitions) {
        if (def.name in userValues) {
          provenance[def.name] = "user";
        } else if (def.name in scopeValues) {
          provenance[def.name] = "scope";
        } else if (
          def.defaultValue !== undefined &&
          def.defaultValue !== null
        ) {
          provenance[def.name] = "default";
        } else {
          provenance[def.name] = "none";
        }
      }

      return provenance;
    },
  );
