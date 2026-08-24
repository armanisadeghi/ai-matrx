"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { startNewConversation } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { PlusTapButton } from "@/components/icons/tap-buttons";
import { selectFocusedConversation } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";

interface AgentNewRunButtonProps {
  surfaceKey: string;
}

export function AgentNewRunButton({ surfaceKey }: AgentNewRunButtonProps) {
  const conversationId = useAppSelector(selectFocusedConversation(surfaceKey));
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleNewRun = useCallback(() => {
    if (!conversationId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("conversationId");
    // Discrete: starting a new run — Back returns to the run the user left.
    router.push(`${pathname}?${params.toString()}`);

    dispatch(
      startNewConversation({
        currentConversationId: conversationId,
        surfaceKey,
      }),
    )
      .unwrap()
      .catch((err) => console.error("Failed to create new run:", err));
  }, [conversationId, surfaceKey, dispatch, pathname, router, searchParams]);

  return <PlusTapButton onClick={handleNewRun} />;
}
