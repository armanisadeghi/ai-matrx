/**
 * Copy the complete request draft between two initialized execution instances.
 *
 * This is the canonical fan-out primitive for multi-run surfaces. It copies
 * composer-owned request state (text, message parts, variables, resources,
 * context, run settings, and client tools) while deliberately leaving the
 * target's model overrides untouched so comparison columns can vary them.
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
  reorderResources,
  setResourceEditedContent,
  setResourcePayload,
  setResourcePreview,
  setResourceStatus,
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

interface CopyInstanceRequestDraftArgs {
  sourceConversationId: string;
  targetConversationId: string;
  copyVariables?: boolean;
}

export function copyInstanceRequestDraft({
  sourceConversationId,
  targetConversationId,
  copyVariables = true,
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
  };
}
