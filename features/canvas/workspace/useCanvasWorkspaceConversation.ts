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
 *   - `startWith(agentId)` — a fresh conversation with the chosen agent.
 * A host that owns SEVERAL conversations (one per board tile) passes `start`:
 * what to open on mount (a saved conversation, a chosen agent, or new). It is
 * read once, at mount.
 * A failure carries its real reason and a retry — nothing fails silently.
 *
 * A NEW chat waits for an active organization instead of racing its
 * hydration (a launch sent before it lands is refused with
 * `organization_context_required`). When the boot has settled with none, the
 * state says so and `choose()` opens the ONE organization gate
 * (`ensureOrganizationContext`) — the person picks, the launch proceeds. It
 * never picks an organization on the person's behalf.
 */

import { useEffect, useRef, useState } from "react";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectShouldPromptForOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { describeLaunchError } from "./describe-launch-error";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";

export type CanvasWorkspaceConversation =
  | { state: "opening"; purpose: "new" | "open" }
  | { state: "needs-organization"; choose: () => void }
  | { state: "ready"; conversationId: string }
  | { state: "failed"; purpose: "new" | "open"; reason: string; retry: () => void };

type Request =
  | { kind: "new"; nonce: number; mandateKey?: AnyMandateKey }
  | { kind: "agent"; agentId: string; nonce: number }
  | { kind: "open"; conversationId: string; nonce: number };

/** What to open on mount. Default: a new conversation under the mandate. */
export type CanvasWorkspaceStart =
  | { kind: "new" }
  | { kind: "agent"; agentId: string }
  | { kind: "open"; conversationId: string };

function initialRequest(start: CanvasWorkspaceStart | undefined): Request {
  if (start?.kind === "agent") return { kind: "agent", agentId: start.agentId, nonce: 0 };
  if (start?.kind === "open") return { kind: "open", conversationId: start.conversationId, nonce: 0 };
  return { kind: "new", nonce: 0 };
}

export interface CanvasWorkspaceConversationController {
  conversation: CanvasWorkspaceConversation;
  /** The id when ready, else null. */
  conversationId: string | null;
  startNew: () => void;
  openExisting: (conversationId: string) => void;
  /**
   * The composer's agent switch (ComposerAgentControl.onSelectAgent): a fresh
   * conversation with that agent — never a revival. `via.mandateKey` (Custom =
   * the default-chat job) launches through the job instead, the only launch
   * that applies the person's own default chat model.
   */
  startWith: (agentId: string, via?: { mandateKey: AnyMandateKey }) => void;
}

export function useCanvasWorkspaceConversation(
  surfaceKey: string,
  start?: CanvasWorkspaceStart,
): CanvasWorkspaceConversationController {
  const dispatch = useAppDispatch();
  const { launchMandate, launchAgent } = useAgentLauncher();
  const [request, setRequest] = useState<Request>(() => initialRequest(start));
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  const organizationId = useAppSelector(selectOrganizationId);
  const promptForOrganization = useAppSelector(selectShouldPromptForOrganization);
  const waitingForOrganization = request.kind !== "open" && !organizationId;

  useEffect(() => {
    if (waitingForOrganization) return;
    const key = `${surfaceKey}#${request.kind}#${request.nonce}`;
    // Once per request: a re-run of this effect for any other reason never
    // launches twice. A result lands only if its request is still the latest.
    if (handled.current === key) return;
    handled.current = key;
    const stale = () => handled.current !== key;

    if (request.kind === "new" || request.kind === "agent") {
      const launch =
        request.kind === "agent"
          ? launchAgent(request.agentId, { surfaceKey, sourceFeature: "chat" })
          : launchMandate(request.mandateKey ?? DEFAULT_NEW_CHAT_MANDATE_KEY, {
              surfaceKey,
              // A REGISTERED feature, never a new string: this surface IS the chat.
              sourceFeature: "chat",
            });
      launch.then(
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
  }, [surfaceKey, request, launchMandate, launchAgent, dispatch, waitingForOrganization]);

  const startNew = () => {
    setConversationId(null);
    setFailure(null);
    setRequest((current) => ({ kind: "new", nonce: current.nonce + 1 }));
  };
  const startWith = (agentId: string, via?: { mandateKey: AnyMandateKey }) => {
    setConversationId(null);
    setFailure(null);
    setRequest((current) =>
      via?.mandateKey
        ? { kind: "new", nonce: current.nonce + 1, mandateKey: via.mandateKey }
        : { kind: "agent", agentId, nonce: current.nonce + 1 },
    );
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
      purpose: request.kind === "open" ? "open" : "new",
      reason: failure,
      retry: () => {
        setFailure(null);
        setRequest((current) => ({ ...current, nonce: current.nonce + 1 }));
      },
    };
  } else if (waitingForOrganization && promptForOrganization) {
    conversation = {
      state: "needs-organization",
      choose: () => {
        ensureOrganizationContext().catch((error: unknown) => {
          if (isOrganizationSelectionCancelled(error)) return;
          console.error("[canvas-workspace] the organization gate could not open", error);
          setFailure(describeLaunchError(error));
        });
      },
    };
  } else conversation = { state: "opening", purpose: request.kind === "open" ? "open" : "new" };

  return { conversation, conversationId, startNew, openExisting, startWith };
}
