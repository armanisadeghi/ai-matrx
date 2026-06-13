"use client";

/**
 * AgentBuilderRightPanel — Test Run Panel
 *
 * Uses createManualInstance which reads from agentDefinition.agents[agentId] —
 * including dirty (unsaved) fields. So the test run always reflects the
 * current in-memory builder state, whether saved or not.
 */

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useBuilderContextSeed } from "@/features/agents/hooks/useBuilderContextSeed";
import {
  registerSurface,
  unregisterSurface,
} from "@/features/agents/redux/surfaces/surfaces.slice";
import { AgentConversationColumn } from "../shared/AgentConversationColumn";
import type { ConversationInvocation } from "@/features/agents/types/conversation-invocation.types";

interface AgentBuilderRightPanelProps {
  agentId: string;
}

export function AgentBuilderRightPanel({
  agentId,
}: AgentBuilderRightPanelProps) {
  const dispatch = useAppDispatch();
  const sourceFeature = "agent-builder";
  const surfaceKey = `${sourceFeature}:${agentId}`;

  // Register as a `window` surface — forking during a test run should
  // swap the test panel's conversation in place via setFocus, NOT
  // change the builder's URL (the builder route doesn't carry a
  // conversationId; it's keyed on the agent being edited).
  useEffect(() => {
    dispatch(
      registerSurface({
        surfaceKey,
        kind: "window",
      }),
    );
    return () => {
      dispatch(unregisterSurface(surfaceKey));
    };
  }, [dispatch, surfaceKey]);

  const agentOptions: ConversationInvocation = {
    identity: { surfaceKey },
    engine: { kind: "agent", agentId },
    routing: { apiEndpointMode: "manual" },
    origin: { origin: "manual", sourceFeature },
    display: {
      showAutoClearToggle: true,
      autoClearConversation: true,
      showVariablePanel: true,
    },
    behavior: {
      autoRun: false,
      allowChat: true,
    },
  };

  const { conversationId, displayConversationId } = useAgentLauncher(
    agentId,
    agentOptions,
  );

  // Seed the builder's saved context-slot values into every new conversation
  // (initial + reset + autoclear split) so the engineer's test data travels
  // with the instance without having to re-enter it.
  useBuilderContextSeed(conversationId, agentId);

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Initializing...</span>
      </div>
    );
  }

  return (
    <AgentConversationColumn
      conversationId={conversationId}
      displayConversationId={displayConversationId ?? undefined}
      surfaceKey={surfaceKey}
      smartInputProps={{
        showSubmitOnEnterToggle: true,
        // Match the live run/chat surfaces (AgentRunnerPage, ChatRoomClient,
        // scribe, etc.) which all use the blue send button. Without this the
        // builder test panel fell back to the legacy "default" black
        // bg-foreground button, which looked broken/disabled.
        sendButtonVariant: "blue",
      }}
    />
  );
}
