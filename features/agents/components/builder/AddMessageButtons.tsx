"use client";

import { useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectAgentMessages } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentMessages } from "@/features/agents/redux/agent-definition/slice";
import type {
  AgentDefinitionMessage,
  TextBlock,
  PrimingMessageRole,
} from "@/features/agents/types/agent-message-types";

interface AddMessageButtonsProps {
  agentId: string;
}

export function AddMessageButtons({ agentId }: AddMessageButtonsProps) {
  const dispatch = useAppDispatch();
  const allMessages = useAppSelector((state) =>
    selectAgentMessages(state, agentId),
  );

  const handleAddMessage = useCallback(
    (role: PrimingMessageRole) => {
      if (!allMessages) return;
      const textBlock: TextBlock = { type: "text", text: "" };
      const newMessage: AgentDefinitionMessage = { role, content: [textBlock] };
      dispatch(
        setAgentMessages({
          id: agentId,
          messages: [...allMessages, newMessage],
        }),
      );
    },
    [agentId, allMessages, dispatch],
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => handleAddMessage("user")}
        disabled={!allMessages}
      >
        <Plus className="w-3 h-3 mr-1" />
        User
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => handleAddMessage("assistant")}
        disabled={!allMessages}
      >
        <Plus className="w-3 h-3 mr-1" />
        Assistant
      </Button>
    </>
  );
}
