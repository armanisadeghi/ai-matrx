/**
 * Instance Model Override Selectors
 *
 * CRITICAL: All selectors take only conversationId — never agentId.
 * The agent's base settings are owned by the instance (copied at creation time).
 * The agentDefinition slice is never accessed from here.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { InstanceModelOverrideState } from "@/features/agents/types/instance.types";
import type {
  LLMParams,
  FeLlmParams,
} from "@/features/agents/types/agent-api-types";

/**
 * Raw override state for an instance.
 */
export const selectInstanceOverrideState =
  (conversationId: string) =>
  (state: RootState): InstanceModelOverrideState | undefined =>
    state.instanceModelOverrides.byConversationId[conversationId];

/**
 * "All Current Settings" — for the settings UI.
 *
 * Merges the instance's snapshotted base settings + overrides, then strips removals.
 * Uses the instance-owned baseSettings — no agentId needed.
 *
 * Returns Partial<FeLlmParams> so the settings UI can work with legacy/alias keys
 * (size, quality, ratio, etc.) that Python accepts via its aliasing layer but that
 * are not in the canonical LLMParams OpenAPI schema.
 */
export const selectCurrentSettings =
  (conversationId: string) =>
  (state: RootState): Partial<FeLlmParams> | undefined => {
    const overrideState =
      state.instanceModelOverrides.byConversationId[conversationId];
    if (!overrideState) return undefined;

    const merged: Record<string, unknown> = { ...overrideState.baseSettings };

    for (const [key, value] of Object.entries(overrideState.overrides)) {
      merged[key] = value;
    }

    for (const key of overrideState.removals) {
      delete merged[key];
    }

    return merged as Partial<FeLlmParams>;
  };

/**
 * "Overrides Only" — for the API payload.
 *
 * Returns ONLY the keys that differ from the instance's snapshotted base settings.
 * This is what gets sent as config_overrides in the request.
 *
 * CRITICAL: Sending a base value disguised as an override causes an API error on
 * some models (the backend rejects a default supplied as an override). This
 * selector RE-DIFFS every override against baseSettings here, so a base-equal
 * value can never reach the wire — no matter what a UI wrote into `overrides`.
 * `model` is included via this same path (baseSettings carries the agent's model),
 * so picking the agent's own model produces no override.
 */
export const selectSettingsOverridesForApi =
  (conversationId: string) =>
  (state: RootState): Record<string, unknown> | undefined => {
    const overrideState =
      state.instanceModelOverrides.byConversationId[conversationId];
    if (!overrideState) return undefined;

    const hasOverrides = Object.keys(overrideState.overrides).length > 0;
    const hasRemovals = overrideState.removals.length > 0;

    if (!hasOverrides && !hasRemovals) return undefined;

    const base = overrideState.baseSettings as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(overrideState.overrides)) {
      // Genuine delta only — drop anything equal to the agent's default. Matches
      // the JSON.stringify-diff convention used by computeOverrideDiff in the
      // agent-settings slice. NOTE: stringify is key-order sensitive, so an
      // object value (e.g. response_format) must be built with the same key
      // order as the base snapshot to compare equal — true today since both
      // originate from the agent definition.
      if (JSON.stringify(value) === JSON.stringify(base[key])) continue;
      result[key] = value;
    }

    // Explicit nulls signal "remove this setting" to the API. (Left as-is: a
    // removal can null out a model-level default that isn't in baseSettings.)
    for (const key of overrideState.removals) {
      result[key] = null;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };

/**
 * "Settings for Chat API" — merged model settings.
 *
 * UI capabilities cannot appear here because they live in the independent
 * `instanceInputCapabilities` slice. This selector contains no filtering shim:
 * separation at ingestion is the contract.
 */
export const selectSettingsForChatApi =
  (conversationId: string) =>
  (state: RootState): Partial<FeLlmParams> | undefined => {
    const overrideState =
      state.instanceModelOverrides.byConversationId[conversationId];
    if (!overrideState) return undefined;

    const merged: Record<string, unknown> = { ...overrideState.baseSettings };

    for (const [key, value] of Object.entries(overrideState.overrides)) {
      merged[key] = value;
    }

    for (const key of overrideState.removals) {
      delete merged[key];
    }

    return Object.keys(merged).length > 0
      ? (merged as Partial<FeLlmParams>)
      : undefined;
  };

/**
 * Check if an instance has any overrides at all.
 */
export const selectHasOverrides =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const entry = state.instanceModelOverrides.byConversationId[conversationId];
    if (!entry) return false;
    return Object.keys(entry.overrides).length > 0 || entry.removals.length > 0;
  };

export type OverriddenKeysView = {
  changed: string[];
  removed: string[];
};

const overriddenKeysSelectorsByConversationId = new Map<
  string,
  (state: RootState) => OverriddenKeysView | undefined
>();

/**
 * Get the list of keys that have been explicitly changed or removed.
 * Useful for UI indicators showing "this setting is overridden."
 * Returns undefined when no override state exists — guard in component.
 *
 * Memoized per conversationId — stable refs for useAppSelector.
 */
export const selectOverriddenKeys = (
  conversationId: string,
): ((state: RootState) => OverriddenKeysView | undefined) => {
  let selector = overriddenKeysSelectorsByConversationId.get(conversationId);
  if (!selector) {
    selector = createSelector(
      [
        (state: RootState) =>
          state.instanceModelOverrides.byConversationId[conversationId],
      ],
      (entry): OverriddenKeysView | undefined => {
        if (!entry) return undefined;
        return {
          changed: Object.keys(entry.overrides),
          removed: [...entry.removals],
        };
      },
    );
    overriddenKeysSelectorsByConversationId.set(conversationId, selector);
  }
  return selector;
};
