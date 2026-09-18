/**
 * Copy the complete request draft between two initialized execution instances.
 *
 * This is the canonical fan-out primitive for multi-run surfaces. It copies
 * composer-owned request state (text, message parts, variables, resources,
 * context, run settings, and client tools). Comparison columns deliberately
 * keep target model overrides; chat handoffs opt into copying the user's
 * explicit overrides/removals while retaining the destination agent's base.
 */

import type { AppThunk } from "@/lib/redux/store";
import {
  setUserInputMessageParts,
  setUserInputText,
} from "../instance-user-input/instance-user-input.slice";
import {
  clearSubmittedVariableResourcePolicies,
  resetUserVariableValues,
  setRuntimeVariableResourcePolicy,
  setScopeVariableValues,
  setUserVariableValues,
} from "../instance-variable-values/instance-variable-values.slice";
import {
  addResource,
  clearAllResources,
  removeResource,
  reorderResources,
  setResourceEditedContent,
  setResourcePayload,
  setResourcePreview,
  setResourceStatus,
  setHandoffInheritedResourceIds,
} from "../instance-resources/instance-resources.slice";
import {
  clearInstanceContext,
  setContextEntries,
} from "../instance-context/instance-context.slice";
import { setClientTools } from "../instance-client-tools/instance-client-tools.slice";
import {
  setBuilderAdvancedSettings,
  setServerOverrideAuthToken,
  setServerOverrideAuthTokenError,
  setServerOverrideUrl,
} from "../instance-ui-state/instance-ui-state.slice";
import { replaceOverrides } from "../instance-model-overrides/instance-model-overrides.slice";
import { patchConversation } from "../conversations/conversations.slice";

interface CopyInstanceRequestDraftArgs {
  sourceConversationId: string;
  targetConversationId: string;
  copyVariables?: boolean;
  /** Chat changes who answers, not the person's explicit model choices. */
  chatSemantics?: boolean;
}

/** Mirror source resource lifecycle updates without touching destination input. */
export function syncInstanceRequestDraftResources({
  sourceConversationId,
  draftSourceConversationId = sourceConversationId,
  targetConversationId,
}: Pick<
  CopyInstanceRequestDraftArgs,
  "sourceConversationId" | "targetConversationId"
> & {
  draftSourceConversationId?: string;
}): AppThunk {
  return (dispatch, getState) => {
    const state = getState();
    const rootResources =
      state.instanceResources.byConversationId[sourceConversationId] ?? {};
    const draftResources =
      state.instanceResources.byConversationId[draftSourceConversationId] ?? {};
    const draftInherited = new Set(
      state.instanceResources.handoffInheritedIds[draftSourceConversationId] ??
        [],
    );
    const targetResources =
      state.instanceResources.byConversationId[targetConversationId] ?? {};
    const desired = new Map<string, (typeof rootResources)[string]>();
    for (const resource of Object.values(rootResources)) {
      if (
        draftSourceConversationId !== sourceConversationId &&
        draftInherited.has(resource.resourceId) &&
        !draftResources[resource.resourceId]
      ) {
        continue;
      }
      desired.set(resource.resourceId, resource);
    }
    for (const resource of Object.values(draftResources)) {
      if (!draftInherited.has(resource.resourceId)) {
        desired.set(resource.resourceId, resource);
      }
    }
    const targetInherited =
      state.instanceResources.handoffInheritedIds[targetConversationId] ?? [];
    const targetRemoved = new Set(
      state.instanceResources.handoffRemovedIds[targetConversationId] ?? [],
    );
    for (const resourceId of targetRemoved) {
      desired.delete(resourceId);
    }
    for (const resourceId of targetInherited) {
      if (!desired.has(resourceId)) {
        dispatch(
          removeResource({ conversationId: targetConversationId, resourceId }),
        );
      }
    }
    for (const resource of desired.values()) {
      // The initial full copy already created this resource. Do not recreate it
      // on each resolver tick: addResource resets destination edits/options and
      // moves its sort order, clobbering work done after the route switch.
      if (!targetResources[resource.resourceId]) {
        dispatch(
          addResource({
            conversationId: targetConversationId,
            blockType: resource.blockType,
            source: resource.source,
            options: resource.options,
            resourceId: resource.resourceId,
          }),
        );
      }
      if (resource.preview !== null)
        dispatch(
          setResourcePreview({
            conversationId: targetConversationId,
            resourceId: resource.resourceId,
            preview: resource.preview,
          }),
        );
      if (
        resource.userEdited &&
        !targetResources[resource.resourceId]?.userEdited
      )
        dispatch(
          setResourceEditedContent({
            conversationId: targetConversationId,
            resourceId: resource.resourceId,
            content: resource.editedContent,
          }),
        );
      if (resource.finalPayload !== null)
        dispatch(
          setResourcePayload({
            conversationId: targetConversationId,
            resourceId: resource.resourceId,
            payload: resource.finalPayload,
          }),
        );
      dispatch(
        setResourceStatus({
          conversationId: targetConversationId,
          resourceId: resource.resourceId,
          status: resource.status,
          errorMessage: resource.errorMessage ?? undefined,
        }),
      );
    }
    dispatch(
      setHandoffInheritedResourceIds({
        conversationId: targetConversationId,
        resourceIds: [...desired.keys()],
      }),
    );
  };
}

export function copyInstanceRequestDraft({
  sourceConversationId,
  targetConversationId,
  copyVariables = true,
  chatSemantics = false,
}: CopyInstanceRequestDraftArgs): AppThunk {
  return (dispatch, getState) => {
    if (sourceConversationId === targetConversationId) return;

    const state = getState();
    const sourceInput =
      state.instanceUserInput.byConversationId[sourceConversationId];
    const sourceVariables =
      state.instanceVariableValues.byConversationId[sourceConversationId];
    const sourceResources =
      state.instanceResources.byConversationId[sourceConversationId] ?? {};
    const sourceContext =
      state.instanceContext.byConversationId[sourceConversationId] ?? {};
    const sourceClientTools =
      state.instanceClientTools.byConversationId[sourceConversationId] ?? [];
    const sourceUi =
      state.instanceUIState.byConversationId[sourceConversationId];

    dispatch(
      setUserInputText({
        conversationId: targetConversationId,
        text: sourceInput?.text ?? "",
        userValues: sourceVariables?.userValues ?? {},
      }),
    );
    dispatch(
      setUserInputMessageParts({
        conversationId: targetConversationId,
        parts: sourceInput?.messageParts ? [...sourceInput.messageParts] : null,
      }),
    );

    if (copyVariables) {
      dispatch(resetUserVariableValues(targetConversationId));
      dispatch(
        setUserVariableValues({
          conversationId: targetConversationId,
          values: { ...(sourceVariables?.userValues ?? {}) },
        }),
      );
      dispatch(
        setScopeVariableValues({
          conversationId: targetConversationId,
          values: { ...(sourceVariables?.scopeValues ?? {}) },
        }),
      );
      const targetPolicies =
        state.instanceVariableValues.byConversationId[targetConversationId]
          ?.resourcePolicies ?? {};
      dispatch(
        clearSubmittedVariableResourcePolicies({
          conversationId: targetConversationId,
          submitted: { ...targetPolicies },
        }),
      );
      for (const [name, policy] of Object.entries(
        sourceVariables?.resourcePolicies ?? {},
      )) {
        dispatch(
          setRuntimeVariableResourcePolicy({
            conversationId: targetConversationId,
            name,
            policy,
          }),
        );
      }
    }

    dispatch(clearAllResources(targetConversationId));
    const orderedResources = Object.values(sourceResources).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    for (const resource of orderedResources) {
      dispatch(
        addResource({
          conversationId: targetConversationId,
          blockType: resource.blockType,
          source: resource.source,
          options: resource.options,
          resourceId: resource.resourceId,
        }),
      );
      if (resource.preview !== null) {
        dispatch(
          setResourcePreview({
            conversationId: targetConversationId,
            resourceId: resource.resourceId,
            preview: resource.preview,
          }),
        );
      }
      if (resource.userEdited) {
        dispatch(
          setResourceEditedContent({
            conversationId: targetConversationId,
            resourceId: resource.resourceId,
            content: resource.editedContent,
          }),
        );
      }
      if (resource.finalPayload !== null) {
        dispatch(
          setResourcePayload({
            conversationId: targetConversationId,
            resourceId: resource.resourceId,
            payload: resource.finalPayload,
          }),
        );
      }
      dispatch(
        setResourceStatus({
          conversationId: targetConversationId,
          resourceId: resource.resourceId,
          status: resource.status,
          errorMessage: resource.errorMessage ?? undefined,
        }),
      );
    }
    dispatch(
      reorderResources({
        conversationId: targetConversationId,
        orderedIds: orderedResources.map((resource) => resource.resourceId),
      }),
    );
    if (chatSemantics) {
      dispatch(
        setHandoffInheritedResourceIds({
          conversationId: targetConversationId,
          resourceIds: orderedResources.map((resource) => resource.resourceId),
        }),
      );
    }

    dispatch(clearInstanceContext(targetConversationId));
    dispatch(
      setContextEntries({
        conversationId: targetConversationId,
        entries: Object.values(sourceContext).map((entry) => ({ ...entry })),
      }),
    );
    dispatch(
      setClientTools({
        conversationId: targetConversationId,
        tools: [...sourceClientTools],
      }),
    );

    if (sourceUi) {
      dispatch(
        setBuilderAdvancedSettings({
          conversationId: targetConversationId,
          changes: sourceUi.builderAdvancedSettings,
        }),
      );
      dispatch(
        setServerOverrideUrl({
          conversationId: targetConversationId,
          url: sourceUi.serverOverrideUrl ?? null,
        }),
      );
      dispatch(
        setServerOverrideAuthToken({
          conversationId: targetConversationId,
          token: sourceUi.serverOverrideAuthToken ?? null,
        }),
      );
      dispatch(
        setServerOverrideAuthTokenError({
          conversationId: targetConversationId,
          error: sourceUi.serverOverrideAuthTokenError ?? null,
        }),
      );
    }
    if (chatSemantics) {
      const sourceOverrides =
        state.instanceModelOverrides.byConversationId[sourceConversationId];
      if (sourceOverrides) {
        // replaceOverrides intentionally keeps the target's base snapshot.
        dispatch(
          replaceOverrides({
            conversationId: targetConversationId,
            changes: {
              ...sourceOverrides.overrides,
              ...Object.fromEntries(
                sourceOverrides.removals.map((key) => [key, null]),
              ),
            },
          }),
        );
      }
      const sandboxBinding =
        state.conversations.byConversationId[sourceConversationId]
          ?.sandboxBinding;
      if (sandboxBinding) {
        dispatch(
          patchConversation({
            conversationId: targetConversationId,
            sandboxBinding,
            sandboxBindingPersisted: false,
          }),
        );
      }
    }
  };
}
