import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { UiGates } from "@/lib/redux/slices/agent-settings/ui-gates";

export const selectInputCapabilitiesState =
  (conversationId: string) =>
  (state: RootState) =>
    state.instanceInputCapabilities.byConversationId[conversationId];

export interface AttachmentCapabilities {
  supportsImageUrls: boolean;
  supportsFileUrls: boolean;
  supportsYoutubeVideos: boolean;
  supportsAudio: boolean;
}

const DEFAULT_ATTACHMENT_CAPABILITIES: AttachmentCapabilities = {
  supportsImageUrls: false,
  supportsFileUrls: false,
  supportsYoutubeVideos: false,
  supportsAudio: true,
};

const selectorsByConversationId = new Map<
  string,
  (state: RootState) => AttachmentCapabilities
>();

/** Effective UI configuration: stored agent base plus conversation deltas. */
export const selectAttachmentCapabilities = (
  conversationId: string,
): ((state: RootState) => AttachmentCapabilities) => {
  let selector = selectorsByConversationId.get(conversationId);
  if (!selector) {
    selector = createSelector(
      [
        (state: RootState) =>
          state.instanceInputCapabilities.byConversationId[conversationId],
      ],
      (entry): AttachmentCapabilities => {
        if (!entry) return DEFAULT_ATTACHMENT_CAPABILITIES;
        const effective: UiGates = { ...entry.base, ...entry.overrides };
        return {
          supportsImageUrls: effective.image_urls === true,
          supportsFileUrls: effective.file_urls === true,
          supportsYoutubeVideos: effective.youtube_videos === true,
          supportsAudio: true,
        };
      },
    );
    selectorsByConversationId.set(conversationId, selector);
  }
  return selector;
};

export const selectInputCapabilityOverrides =
  (conversationId: string) =>
  (state: RootState): Partial<UiGates> | undefined =>
    state.instanceInputCapabilities.byConversationId[conversationId]?.overrides;
