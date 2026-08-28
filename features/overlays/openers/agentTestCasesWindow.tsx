"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "agentTestCasesWindow" as const;

export interface OpenAgentTestCasesWindowOptions {
  agentId: string;
  conversationId: string;
}

export interface AgentTestCasesWindowHandle {
  close: () => void;
}

export function useOpenAgentTestCasesWindow() {
  const dispatch = useAppDispatch();

  return (
    options: OpenAgentTestCasesWindowOptions,
  ): AgentTestCasesWindowHandle => {
    dispatch(
      openOverlay({
        overlayId: OVERLAY_ID,
        data: {
          agentId: options.agentId,
          conversationId: options.conversationId,
        },
      }),
    );

    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  };
}

export function AgentTestCasesWindowController({
  agentId,
  conversationId,
}: OpenAgentTestCasesWindowOptions): null {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(
      openOverlay({
        overlayId: OVERLAY_ID,
        data: { agentId, conversationId },
      }),
    );
    return () => {
      dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
    };
  }, [agentId, conversationId, dispatch]);

  return null;
}
