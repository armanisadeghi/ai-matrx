"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";
import { ChatPageShell } from "./ChatPageShell";
import { AgentPickerLanding } from "./AgentPickerLanding";

/**
 * `/chat/new` — agent picker landing.
 *
 * Pure picker surface (no chameleon `if (agentId) return <ChatRoomClient>`
 * path). When the user selects an agent, navigates to `/chat/a/[agentId]`
 * — the dedicated new-conversation route.
 */
export function ChatNewClient() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  // Make sure the agents slice is hydrated so Pinned/Recent/All sections
  // have data when the user lands here directly (e.g. from a deep link).
  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);

  const handleSelect = (agentId: string) => {
    router.push(`/chat/a/${encodeURIComponent(agentId)}`);
  };

  return (
    <ChatPageShell pickerPlaceholder="New chat" onAgentSelect={handleSelect}>
      <AgentPickerLanding onSelect={handleSelect} />
    </ChatPageShell>
  );
}
