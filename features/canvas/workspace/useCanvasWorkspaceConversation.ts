"use client";

/**
 * The ONE conversation a ChatCanvasWorkspace shows — owned by the workspace,
 * not by the panel that draws it, so docking, floating, the mobile drawer and
 * full screen all show the same conversation with no relaunch.
 *
 * WHO ANSWERS a new chat: the `chat.default_new_chat` mandate — exactly what
 * /chat/new resolves (system default → org binding → user binding). No agent
 * id, no prompt in code.
 *
 * Three ways in:
 *   - mount / `startNew()` — launch a fresh conversation under the mandate;
 *   - `openExisting(id)`   — load a history conversation IN PLACE through the
 *     canonical `loadConversation` thunk (the path the agent-app shell and
 *     the tutor use), never a navigation.
 * A failure carries its real reason and a retry — nothing fails silently.
 */

import { useEffect, useRef, useState } from "react";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { useAppDispatch } from "@/lib/redux/hooks";
import { describeLaunchError } from "./describe-launch-error";

export type CanvasWorkspaceConversation =
  | { state: "opening"; purpose: "new" | "open" }
  | { state: "ready"; conversationId: string }
  | { state: "failed"; purpose: "new" | "open"; reason: string; retry: () => void };

type Request = { kind: "new"; nonce: number } | { kind: "open"; conversationId: string; nonce: number };

export interface CanvasWorkspaceConversationController {
  conversation: CanvasWorkspaceConversation;
  /** The id when ready, else null. */
  conversationId: string | null;
  startNew: () => void;
  openExisting: (conversationId: string) => void;
}

export function useCanvasWorkspaceConversation(surfaceKey: string): CanvasWorkspaceConversationController {
  const dispatch = useAppDispatch();
  const { launchMandate } = useAgentLauncher();
  const [request, setRequest] = useState<Request>({ kind: "new", nonce: 0 });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const key = `${surfaceKey}#${request.kind}#${request.nonce}`;
    // Once per request: a re-run of this effect for any other reason never
    // launches twice. A result lands only if its request is still the latest.
    if (handled.current === key) return;
    handled.current = key;
    const stale = () => handled.current !== key;

    if (request.kind === "new") {
      launchMandate(DEFAULT_NEW_CHAT_MANDATE_KEY, {
        surfaceKey,
        // A REGISTERED feature, never a new string: this surface IS the chat.
        sourceFeature: "chat",
      }).then(
        (result) => {
          if (!stale()) setConversationId(result.conversationId);
        },
        (error: unknown) => {
          console.error("[canvas-workspace] could not open a new conversation", error);
          if (!stale()) setFailure(describeLaunchError(error));
        },
      );
    } else {
      const target = request.conversationId;
      dispatch(loadConversation({ conversationId: target, surfaceKey }))
        .unwrap()
        .then(
          () => {
            if (!stale()) setConversationId(target);
          },
          (error: unknown) => {
            console.error("[canvas-workspace] could not load the conversation", target, error);
            if (!stale()) setFailure(describeLaunchError(error));
          },
        );
    }
  }, [surfaceKey, request, launchMandate, dispatch]);

  const startNew = () => {
    setConversationId(null);
    setFailure(null);
    setRequest((current) => ({ kind: "new", nonce: current.nonce + 1 }));
  };
  const openExisting = (id: string) => {
    if (id === conversationId) return;
    setConversationId(null);
    setFailure(null);
    setRequest((current) => ({ kind: "open", conversationId: id, nonce: current.nonce + 1 }));
  };

  let conversation: CanvasWorkspaceConversation;
  if (conversationId) conversation = { state: "ready", conversationId };
  else if (failure) {
    conversation = {
      state: "failed",
      purpose: request.kind,
      reason: failure,
      retry: () => {
        setFailure(null);
        setRequest((current) => ({ ...current, nonce: current.nonce + 1 }));
      },
    };
  } else conversation = { state: "opening", purpose: request.kind };

  return { conversation, conversationId, startNew, openExisting };
}
