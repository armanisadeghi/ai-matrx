/**
 * Shared lifecycle helpers for the cache-only Smart Agent Input instance used
 * by locked-axis Agent Battle modes.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { destroyInstance } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { copyInstanceRequestDraft } from "@/features/agents/redux/execution-system/thunks/copy-instance-request-draft.thunk";
import { setSubmitOnEnter } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { generateConversationId } from "@/features/agents/redux/execution-system/utils/ids";

const BATTLE_SOURCE_FEATURE = "agent-comparison" as const;

interface CreateBattleInputDraftArgs {
  dispatch: AppDispatch;
  agentId: string;
  agentVersionId: string | null;
}

export async function createBattleInputDraft({
  dispatch,
  agentId,
  agentVersionId,
}: CreateBattleInputDraftArgs): Promise<string> {
  const conversationId = generateConversationId();
  await dispatch(
    createManualInstance({
      agentId,
      conversationId,
      initialAgentVersionId: agentVersionId,
      apiEndpointMode: "agent",
      sourceFeature: BATTLE_SOURCE_FEATURE,
    }),
  ).unwrap();
  dispatch(setSubmitOnEnter({ conversationId, value: false }));
  return conversationId;
}

interface ReplaceBattleInputDraftArgs extends CreateBattleInputDraftArgs {
  previousConversationId: string | null;
  copyVariables?: boolean;
}

export async function replaceBattleInputDraft({
  dispatch,
  agentId,
  agentVersionId,
  previousConversationId,
  copyVariables = true,
}: ReplaceBattleInputDraftArgs): Promise<string> {
  const conversationId = await createBattleInputDraft({
    dispatch,
    agentId,
    agentVersionId,
  });
  if (previousConversationId) {
    dispatch(
      copyInstanceRequestDraft({
        sourceConversationId: previousConversationId,
        targetConversationId: conversationId,
        copyVariables,
      }),
    );
    dispatch(destroyInstance(previousConversationId));
  }
  return conversationId;
}

export function readBattleInputDraft(
  state: RootState,
  conversationId: string | null,
): { userMessage: string; variables: Record<string, unknown> } {
  if (!conversationId) {
    return { userMessage: "", variables: {} };
  }
  return {
    userMessage:
      state.instanceUserInput.byConversationId[conversationId]?.text ?? "",
    variables:
      state.instanceVariableValues.byConversationId[conversationId]
        ?.userValues ?? {},
  };
}

interface HydrateBattleInputDraftArgs {
  dispatch: AppDispatch;
  conversationId: string;
  userMessage: string;
  variables: Record<string, unknown>;
}

export function hydrateBattleInputDraft({
  dispatch,
  conversationId,
  userMessage,
  variables,
}: HydrateBattleInputDraftArgs): void {
  dispatch(setUserInputText({ conversationId, text: userMessage }));
  dispatch(setUserVariableValues({ conversationId, values: variables }));
}
