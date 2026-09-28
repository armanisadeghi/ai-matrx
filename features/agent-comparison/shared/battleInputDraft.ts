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
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  applyRequestDraft,
  captureRequestDraft,
  isRequestDraftSnapshot,
  type OmittedAttachment,
  type RequestDraftSnapshot,
} from "@/features/agents/redux/execution-system/thunks/request-draft-snapshot";

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

/**
 * The shared request as the person left it. `request` is the complete request
 * (attachments, context, run settings and model changes included) that a
 * reopened battle restores identically; `omittedAttachments` names anything
 * that could not be saved that way. `userMessage` and `variables` stay as the
 * readable summary; `resolvedVariables` are the values the run actually used —
 * their values over scope values over the agent's defaults — so a saved battle
 * records what ran even when every value was a default.
 */
export function readBattleInputDraft(
  state: RootState,
  conversationId: string | null,
): {
  userMessage: string;
  variables: Record<string, unknown>;
  resolvedVariables: Record<string, unknown>;
  request: RequestDraftSnapshot | null;
  omittedAttachments: OmittedAttachment[];
} {
  if (!conversationId) {
    return {
      userMessage: "",
      variables: {},
      resolvedVariables: {},
      request: null,
      omittedAttachments: [],
    };
  }
  const { snapshot, omitted } = captureRequestDraft(state, conversationId);
  return {
    request: snapshot,
    omittedAttachments: omitted,
    userMessage:
      state.instanceUserInput.byConversationId[conversationId]?.text ?? "",
    variables:
      state.instanceVariableValues.byConversationId[conversationId]
        ?.userValues ?? {},
    resolvedVariables: selectResolvedVariables(conversationId)(state),
  };
}

interface HydrateBattleInputDraftArgs {
  dispatch: AppDispatch;
  conversationId: string;
  userMessage: string;
  variables: Record<string, unknown>;
  /** The saved complete request; battles saved before it existed have none. */
  request?: unknown;
}

export function hydrateBattleInputDraft({
  dispatch,
  conversationId,
  userMessage,
  variables,
  request,
}: HydrateBattleInputDraftArgs): void {
  if (isRequestDraftSnapshot(request)) {
    dispatch(applyRequestDraft({ snapshot: request, conversationId }));
    return;
  }
  dispatch(setUserInputText({ conversationId, text: userMessage }));
  dispatch(setUserVariableValues({ conversationId, values: variables }));
}
