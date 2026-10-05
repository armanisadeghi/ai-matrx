"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "../../../host/navigation";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { startNewConversation } from "../../redux/execution-system/thunks/create-instance.thunk";
import { PlusTapButton } from "@ai-matrx/tap-target/buttons";
import { selectFocusedConversation } from "../../redux/execution-system/conversation-focus/conversation-focus.selectors";
import { pushAddressWithoutNavigating } from "@ai-matrx/chat/ui/addressWithoutNavigating";

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
    pushAddressWithoutNavigating(`${pathname}?${params.toString()}`);

    dispatch(
      startNewConversation({
        currentConversationId: conversationId,
        surfaceKey,
      }),
    )
      .unwrap()
      .catch((err) => console.error("Failed to create new run:", err));
  }, [conversationId, surfaceKey, dispatch, pathname, router, searchParams]);

  return <PlusTapButton variant="transparent" onClick={handleNewRun} ariaLabel="New run" tooltip="New run" />;
}
