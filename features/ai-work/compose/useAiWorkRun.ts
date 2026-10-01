"use client";

/**
 * useAiWorkRun — the /work composer's ONE conversation and its Send.
 *
 * The composer is a SmartAgentInput host in every way that matters: its
 * pickers (resources, skills, context) write into per-conversation slots that
 * only exist once the instance does. So the instance is created on mount — the
 * managed launcher's default, exactly like every SmartAgentInput host — and
 * Send goes through `smartExecute` on THAT instance.
 *
 * It used to mint the id with `ready: false` and create the instance at Run
 * via `launchAgent`. Nothing attached before Run survived: `addResource` drops
 * into a missing slot, and the launch's `createInstanceFull` resets the slots
 * it does find. Guard: __tests__/attached-before-send-reaches-the-request.
 */

import { useCallback } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";

export function aiWorkSurfaceKey(agentId: string): string {
  return `ai-work-composer:${agentId}`;
}

export interface AiWorkRun {
  /** The instance every picker on the form binds to. */
  conversationId: string | null;
  surfaceKey: string;
  /**
   * Send `text` on the composer's instance. Resolves true when a request was
   * admitted; false when a send gate (organization, scope) stopped it — the
   * gate has already told the person why.
   */
  send: (text: string) => Promise<boolean>;
}

export function useAiWorkRun(agentId: string): AiWorkRun {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const surfaceKey = aiWorkSurfaceKey(agentId);
  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: "chat",
    apiEndpointMode: "agent",
    config: { allowChat: true },
  });

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      if (!conversationId) return false;
      const requestCount = () =>
        store.getState().activeRequests.byConversationId[conversationId]
          ?.length ?? 0;
      const before = requestCount();
      dispatch(setUserInputText({ conversationId, text }));
      await dispatch(smartExecute({ conversationId, surfaceKey })).unwrap();
      return requestCount() > before;
    },
    [conversationId, dispatch, store, surfaceKey],
  );

  return { conversationId, surfaceKey, send };
}
