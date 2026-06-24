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
}

const initialState: InstanceResourcesState = {
  byConversationId: {},
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

    /** Remove all resources from an instance (keep the registry entry). Used after send. */
    clearAllResources(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        state.byConversationId[action.payload] = {};
      }
    },

    removeInstanceResources(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },

  extraReducers: (builder) => {
    builder.addCase(createInstanceFull, (state, action) => {
      state.byConversationId[action.payload.conversationId] = {};
    });

    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
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
  clearAllResources,
  removeInstanceResources,
} = instanceResourcesSlice.actions;

export default instanceResourcesSlice.reducer;
