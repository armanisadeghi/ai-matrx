/**
 * Instance Resources Slice
 *
 * Manages the content blocks being assembled for an instance's user_input.
 * Resources are things the user attaches: files, images, URLs, notes, tables, etc.
 *
 * Each resource has a lifecycle:
 *   pending → resolving → ready (or error)
 *
 * Some resources need client-side processing (e.g., scraping a URL and letting
 * the user preview/edit the result). The status field tracks this.
 *
 * Resources go into the `user_input` ContentBlock[] — the model sees them
 * immediately. This is distinct from instanceContext (deferred, model requests
 * via ctx_get).
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ManagedResource,
  ResourceBlockType,
  ResourceOptions,
  ResourceStatus,
} from "@/features/agents/types/instance.types";
import type { MessagePart } from "@/types/python-generated/stream-events";
import { generateResourceId } from "../utils/ids";
import { destroyInstance } from "../conversations/conversations.slice";
import { createInstanceFull } from "../create-instance-full";

// =============================================================================
// State
// =============================================================================

export interface InstanceResourcesState {
  byConversationId: Record<string, Record<string, ManagedResource>>;
  /**
   * Per-conversation snapshot of the resource ids that belonged to the LAST
   * submitted message — the resources equivalent of the input slice's
   * `lastSubmittedText`. Captured at submit (`markResourcesSubmitted`); consumed
   * by `clearSubmittedResources`, which removes ONLY these ids. Any resource the
   * user attaches AFTER submit (composing the next message while the response
   * streams) is, by construction, NOT in this set — so it can never be cleared
   * by a stream/conversation event. This is the data-loss guard for attachments
   * (pasted images, files), parallel to input-draft-protection.ts for text.
   */
  submittedIds: Record<string, string[]>;
}

const initialState: InstanceResourcesState = {
  byConversationId: {},
  submittedIds: {},
};

// =============================================================================
// Default options
// =============================================================================

const defaultOptions: ResourceOptions = {
  keepFresh: false,
  editable: false,
  convertToText: true,
  optionalContext: false,
};

// =============================================================================
// Slice
// =============================================================================

const instanceResourcesSlice = createSlice({
  name: "instanceResources",
  initialState,
  reducers: {
    /**
     * Initialize resources for a new instance.
     */
    initInstanceResources(
      state,
      action: PayloadAction<{ conversationId: string }>,
    ) {
      state.byConversationId[action.payload.conversationId] = {};
      state.submittedIds[action.payload.conversationId] = [];
    },

    /**
     * Add a new resource to an instance.
     */
    addResource(
      state,
      action: PayloadAction<{
        conversationId: string;
        blockType: ResourceBlockType;
        source: unknown;
        options?: Partial<ResourceOptions>;
        resourceId?: string;
      }>,
    ) {
      const {
        conversationId,
        blockType,
        source,
        options = {},
        resourceId = generateResourceId(),
      } = action.payload;

      const resources = state.byConversationId[conversationId];
      if (resources) {
        const existingCount = Object.keys(resources).length;
        resources[resourceId] = {
          resourceId,
          blockType,
          source,
          preview: null,
          status: "pending",
          errorMessage: null,
          userEdited: false,
          editedContent: null,
          options: { ...defaultOptions, ...options },
          finalPayload: null,
          sortOrder: existingCount,
        };
      }
    },

    /**
     * Update resource status (lifecycle transition).
     */
    setResourceStatus(
      state,
      action: PayloadAction<{
        conversationId: string;
        resourceId: string;
        status: ResourceStatus;
        errorMessage?: string;
      }>,
    ) {
      const { conversationId, resourceId, status, errorMessage } =
        action.payload;
      const resource = state.byConversationId[conversationId]?.[resourceId];
      if (resource) {
        resource.status = status;
        resource.errorMessage = errorMessage ?? null;
      }
    },

    /**
     * Set the client-resolved preview for a resource.
     */
    setResourcePreview(
      state,
      action: PayloadAction<{
        conversationId: string;
        resourceId: string;
        preview: unknown;
      }>,
    ) {
      const { conversationId, resourceId, preview } = action.payload;
      const resource = state.byConversationId[conversationId]?.[resourceId];
      if (resource) {
        resource.preview = preview;
        resource.status = "ready";
      }
    },

    /**
     * Mark a resource as user-edited and store the edited content.
     */
    setResourceEditedContent(
      state,
      action: PayloadAction<{
        conversationId: string;
        resourceId: string;
        content: unknown;
      }>,
    ) {
      const { conversationId, resourceId, content } = action.payload;
      const resource = state.byConversationId[conversationId]?.[resourceId];
      if (resource) {
        resource.userEdited = true;
        resource.editedContent = content;
      }
    },

    /**
     * Set the final API payload for a resource.
     * This is the ContentBlock that goes into user_input.
     */
    setResourcePayload(
      state,
      action: PayloadAction<{
        conversationId: string;
        resourceId: string;
        payload: MessagePart;
      }>,
    ) {
      const { conversationId, resourceId, payload } = action.payload;
      const resource = state.byConversationId[conversationId]?.[resourceId];
      if (resource) {
        resource.finalPayload = payload;
      }
    },

    /**
     * Update resource options (keepFresh, editable, etc.).
     */
    updateResourceOptions(
      state,
      action: PayloadAction<{
        conversationId: string;
        resourceId: string;
        options: Partial<ResourceOptions>;
      }>,
    ) {
      const { conversationId, resourceId, options } = action.payload;
      const resource = state.byConversationId[conversationId]?.[resourceId];
      if (resource) {
        Object.assign(resource.options, options);
      }
    },

    /**
     * Remove a resource from an instance.
     */
    removeResource(
      state,
      action: PayloadAction<{
        conversationId: string;
        resourceId: string;
      }>,
    ) {
      const { conversationId, resourceId } = action.payload;
      const resources = state.byConversationId[conversationId];
      if (resources) {
        delete resources[resourceId];
      }
    },

    /**
     * Reorder resources.
     */
    reorderResources(
      state,
      action: PayloadAction<{
        conversationId: string;
        orderedIds: string[];
      }>,
    ) {
      const { conversationId, orderedIds } = action.payload;
      const resources = state.byConversationId[conversationId];
      if (resources) {
        orderedIds.forEach((id, index) => {
          if (resources[id]) {
            resources[id].sortOrder = index;
          }
        });
      }
    },

    /**
     * Snapshot the resources that belong to the message being submitted RIGHT
     * NOW (parallel to the input slice's `markInputSubmitted`). Records every
     * current resource id as "sent"; `clearSubmittedResources` later removes
     * exactly these and nothing else. Call this at send time.
     */
    markResourcesSubmitted(state, action: PayloadAction<string>) {
      const conversationId = action.payload;
      const resources = state.byConversationId[conversationId];
      state.submittedIds[conversationId] = resources
        ? Object.keys(resources)
        : [];
    },

    /**
     * Clear ONLY the resources that were part of the last submitted message
     * (the `submittedIds` snapshot). Resources attached AFTER that submit — the
     * user's next-message draft (pasted images, files) — are left untouched.
     * This is the SACRED-DRAFT-safe replacement for `clearAllResources` on every
     * stream/conversation cleanup path. Idempotent: an empty/absent snapshot is
     * a no-op.
     */
    clearSubmittedResources(state, action: PayloadAction<string>) {
      const conversationId = action.payload;
      const resources = state.byConversationId[conversationId];
      const submitted = state.submittedIds[conversationId];
      if (resources && submitted) {
        for (const id of submitted) {
          delete resources[id];
        }
      }
      state.submittedIds[conversationId] = [];
    },

    /**
     * Remove ALL resources from an instance unconditionally (keep the registry
     * entry). For EXPLICIT user/UI "clear attachments" actions only — NEVER from
     * a stream/conversation event (use `clearSubmittedResources`, which protects
     * the next-message draft). See input-draft-protection.ts for the invariant.
     */
    clearAllResources(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        state.byConversationId[action.payload] = {};
      }
      state.submittedIds[action.payload] = [];
    },

    removeInstanceResources(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
      delete state.submittedIds[action.payload];
    },
  },

  extraReducers: (builder) => {
    builder.addCase(createInstanceFull, (state, action) => {
      state.byConversationId[action.payload.conversationId] = {};
      state.submittedIds[action.payload.conversationId] = [];
    });

    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
      delete state.submittedIds[action.payload];
    });
  },
});

export const {
  initInstanceResources,
  addResource,
  setResourceStatus,
  setResourcePreview,
  setResourceEditedContent,
  setResourcePayload,
  updateResourceOptions,
  removeResource,
  reorderResources,
  markResourcesSubmitted,
  clearSubmittedResources,
  clearAllResources,
  removeInstanceResources,
} = instanceResourcesSlice.actions;

export default instanceResourcesSlice.reducer;
