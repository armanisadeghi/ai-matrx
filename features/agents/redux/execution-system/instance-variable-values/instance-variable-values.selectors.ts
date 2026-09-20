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
import type {
  VariableDefinition,
  VariableResourceContextConfig,
} from "@/features/agents/types/agent-definition.types";
import { resolveVariablesForRequest } from "./resolve-variables-for-request";

// Stable references returned when the instance hasn't been initialized yet.
const EMPTY_DEFINITIONS: VariableDefinition[] = [];
const EMPTY_RECORD: Record<string, unknown> = {};
const EMPTY_RESOURCE_POLICIES: Record<string, VariableResourceContextConfig> = {};
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
 * The names in `userValues` the HOST wired at launch — see the field's own
 * header in the slice. Never rendered as the person's own words.
 */
export const selectHostVariableNames =
  (conversationId: string) =>
  (state: RootState): string[] =>
    state.instanceVariableValues.byConversationId[conversationId]
      ?.hostValueNames ?? EMPTY_NAMES;

/**
 * The launch values a conversation may present AS THE PERSON'S OWN — the user
 * tier with every host-wired name removed.
 *
 * 🚨 This is the one primitive the user bubble reads, for EVERY audience. The
 * Conductor's `rulebook_document`, the Scout interview's `interview_probes` and
 * every other value a surface wired on the person's behalf are correct as named
 * launch variables and ship unchanged — they are simply not hers to show. When
 * a surface wires everything (which is the normal case for a purpose-built
 * conversation) this is empty and the strip renders nothing at all.
 *
 * KNOWN LIMIT, deliberately not hidden: a conversation REHYDRATED from
 * `cx_conversation.variables` cannot tell host values from typed ones — the DB
 * column stores the merged payload and carries no authorship. On that path the
 * audience gate is still what keeps them away from an Expert. Closing it needs
 * authorship persisted with the row.
 */
export const selectOwnVariableValues = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceVariableValues.byConversationId[conversationId],
    (entry) => {
      if (!entry) return EMPTY_RECORD;
      const hostNames = entry.hostValueNames ?? [];
      if (hostNames.length === 0) return entry.userValues;
      const own: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(entry.userValues)) {
        if (!hostNames.includes(name)) own[name] = value;
      }
      return Object.keys(own).length === 0 ? EMPTY_RECORD : own;
    },
  );

/** Immutable first-turn values, excluding names the host supplied. */
export const selectOwnSubmittedFirstTurnValues = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceVariableValues.byConversationId[conversationId],
    (entry) => {
      if (!entry?.submittedFirstTurnValues) return EMPTY_RECORD;
      const hostNames = entry.submittedFirstTurnHostValueNames ?? [];
      const own: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(entry.submittedFirstTurnValues)) {
        if (!hostNames.includes(name)) own[name] = value;
      }
      return Object.keys(own).length > 0 ? own : EMPTY_RECORD;
    },
  );

/**
 * Raw scope-resolved values for an instance.
 */
export const selectScopeVariableValues =
  (conversationId: string) =>
  (state: RootState): Record<string, unknown> =>
    state.instanceVariableValues.byConversationId[conversationId]
      ?.scopeValues ?? EMPTY_RECORD;

export const selectRuntimeVariableResourcePolicies =
  (conversationId: string) =>
  (state: RootState): Record<string, VariableResourceContextConfig> =>
    state.instanceVariableValues.byConversationId[conversationId]
      ?.resourcePolicies ?? EMPTY_RESOURCE_POLICIES;

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
/**
 * Variables to PUT ON THE REQUEST — three-tier merge via
 * `resolveVariablesForRequest`. Explicit userValues are never dropped, even
 * when instance definitions have not hydrated yet.
 */
export const selectVariablesForRequest = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceVariableValues.byConversationId[conversationId],
    (entry) => {
      if (!entry) return EMPTY_RECORD;
      const out = resolveVariablesForRequest(entry);
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
