/**
 * Instance Model Override Selectors
 *
 * CRITICAL: All selectors take only conversationId — never agentId.
 * The agent's base settings are owned by the instance (copied at creation time).
 * The agentDefinition slice is never accessed from here.
 */

import type { RootState } from "@/lib/redux/store";
import type { InstanceModelOverrideState } from "@/features/agents/types/instance.types";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

// Keys that exist in the model's controls as UI capability flags (e.g.
// `{ allowed: true }`) but are NOT part of the LLMParams config_overrides
// sent to the Python backend. Actual tool definitions go through the
// separate `client_tools` field in the request payload — the `tools` entry
// here is just the model capability indicator, not the tools array.
const UI_CAPABILITY_KEYS = new Set([
  "tools",
  "image_urls",
  "file_urls",
  "youtube_videos",
  "multi_speaker",
]);

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
 */
export const selectCurrentSettings =
  (conversationId: string) =>
  (state: RootState): Partial<LLMParams> | undefined => {
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

    return merged as Partial<LLMParams>;
  };

/**
 * "Overrides Only" — for the API payload.
 *
 * Returns ONLY the keys that differ from the instance's snapshotted base settings.
 * This is what gets sent as config_overrides in the request.
 *
 * CRITICAL: Sending a base-value as an override causes an API error on some models.
 * This selector guarantees only true deltas are included.
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

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(overrideState.overrides)) {
      if (UI_CAPABILITY_KEYS.has(key)) continue;
      result[key] = value;
    }

    // Explicit nulls signal "remove this setting" to the API
    for (const key of overrideState.removals) {
      if (UI_CAPABILITY_KEYS.has(key)) continue;
      result[key] = null;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };

/**
 * "Settings for Chat API" — merged settings with UI-only capability flags removed.
 *
 * Same as selectCurrentSettings (base + overrides – removals) but strips
 * UI_CAPABILITY_KEYS before returning. Use this instead of selectCurrentSettings
 * when spreading the result flat into the chat endpoint payload.
 *
 * NOTE: UI_CAPABILITY_KEYS covers frontend capability indicators only (e.g.
 * `tools: { allowed: true }`, `image_urls: true`). The actual tool list sent
 * to the backend goes through the separate `tools` field in the request payload
 * (from agent.tools), not through LLMParams — so nothing in LLMParams is lost.
 */
export const selectSettingsForChatApi =
  (conversationId: string) =>
  (state: RootState): Partial<LLMParams> | undefined => {
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

    for (const key of UI_CAPABILITY_KEYS) {
      delete merged[key];
    }

    return Object.keys(merged).length > 0
      ? (merged as Partial<LLMParams>)
      : undefined;
  };

/**
 * Attachment capabilities derived from the merged settings.
 *
 * `image_urls`, `file_urls`, and `youtube_videos` are UI-only capability
 * flags — they live in the raw state (baseSettings + overrides) but are
 * stripped from the LLMParams type because they're never sent to the API.
 * Casting through unknown is intentional and the only way to reach them
 * without widening the LLMParams type.
 */
export const selectAttachmentCapabilities =
  (conversationId: string) =>
  (
    state: RootState,
  ): {
    supportsImageUrls: boolean;
    supportsFileUrls: boolean;
    supportsYoutubeVideos: boolean;
    supportsAudio: boolean;
  } => {
    const overrideState =
      state.instanceModelOverrides.byConversationId[conversationId];

    if (!overrideState) {
      return {
        supportsImageUrls: false,
        supportsFileUrls: false,
        supportsYoutubeVideos: false,
        supportsAudio: true,
      };
    }

    // Merge base + overrides - removals, same logic as selectCurrentSettings
    const merged: Record<string, unknown> = {
      ...(overrideState.baseSettings as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(overrideState.overrides)) {
      merged[key] = value;
    }
    for (const key of overrideState.removals) {
      delete merged[key];
    }

    return {
      supportsImageUrls: merged["image_urls"] === true,
      supportsFileUrls: merged["file_urls"] === true,
      supportsYoutubeVideos: merged["youtube_videos"] === true,
      supportsAudio: true,
    };
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

/**
 * Get the list of keys that have been explicitly changed or removed.
 * Useful for UI indicators showing "this setting is overridden."
 * Returns undefined when no override state exists — guard in component.
 */
export const selectOverriddenKeys =
  (conversationId: string) =>
  (state: RootState): { changed: string[]; removed: string[] } | undefined => {
    const entry = state.instanceModelOverrides.byConversationId[conversationId];
    if (!entry) return undefined;
    return {
      changed: Object.keys(entry.overrides),
      removed: [...entry.removals],
    };
  };
