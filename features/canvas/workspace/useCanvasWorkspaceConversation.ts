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
 *   - mount / `startNew()` — launch a fresh conversation under the mandate
 *     (with `enabled: false`, nothing launches until the host enables it —
 *     a chat that starts closed costs nothing until it is first opened);
 *   - `openExisting(id)`   — reopen a history conversation IN PLACE through
 *     the canonical resume sequence (`resumeConversation`, the imperative twin
 *     of `useConversationResume` that /chat runs): hydrate, re-surface an
 *     unanswered client tool prompt, and REATTACH to a turn the server is
 *     still running — so a board tile reloaded mid-answer keeps streaming.
 *     Never a navigation, never `loadConversation` alone.
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
import { resumeConversation } from "@/features/agents/redux/execution-system/thunks/resume-conversation.thunk";
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
  | { kind: "open"; conversationId: string; agentId: string | null; nonce: number };

/** What to open on mount. Default: a new conversation under the mandate. */
export type CanvasWorkspaceStart =
  | { kind: "new" }
  | { kind: "agent"; agentId: string }
  | { kind: "open"; conversationId: string; agentId?: string | null };

function initialRequest(start: CanvasWorkspaceStart | undefined): Request {
  if (start?.kind === "agent") return { kind: "agent", agentId: start.agentId, nonce: 0 };
  if (start?.kind === "open")
    return { kind: "open", conversationId: start.conversationId, agentId: start.agentId ?? null, nonce: 0 };
  return { kind: "new", nonce: 0 };
}

/**
 * `CanvasWorkspaceStart` stays accepted directly for tile callers; hosts that
 * defer work until visible use the named options form.
 */
export type CanvasWorkspaceConversationOptions = {
  enabled?: boolean;
  start?: CanvasWorkspaceStart;
  /**
   * `null` = this conversation IS its host's own chat (a board chat tile), so
   * a new launch adopts no mounted surface — exactly /chat's own launcher
   * (`runtime: { surfaceName: null }`). Omitted = the default adoption.
   */
  surfaceName?: null;
};

/** A bare start (`{ kind }`) — as opposed to the options form, which never carries `kind`. */
function isCanvasWorkspaceStart(
  input: CanvasWorkspaceStart | CanvasWorkspaceConversationOptions,
): input is CanvasWorkspaceStart {
  return "kind" in input;
}

function resolveStartOptions(
  input: CanvasWorkspaceStart | CanvasWorkspaceConversationOptions | undefined,
): { enabled: boolean; start: CanvasWorkspaceStart | undefined; ownSurface: boolean } {
  if (!input) return { enabled: true, start: undefined, ownSurface: false };
  if (isCanvasWorkspaceStart(input)) return { enabled: true, start: input, ownSurface: false };
  return { enabled: input.enabled ?? true, start: input.start, ownSurface: input.surfaceName === null };
}

export interface CanvasWorkspaceConversationController {
  conversation: CanvasWorkspaceConversation;
  /** The id when ready, else null. */
  conversationId: string | null;
  startNew: () => void;
  /** `agentId` (when the caller knows it) builds a cold instance under that agent. */
  openExisting: (conversationId: string, agentId?: string | null) => void;
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
  input?: CanvasWorkspaceStart | CanvasWorkspaceConversationOptions,
): CanvasWorkspaceConversationController {
  const { enabled, start, ownSurface } = resolveStartOptions(input);
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
    if (!enabled || waitingForOrganization) return;
    const key = `${surfaceKey}#${request.kind}#${request.nonce}`;
    // Once per request: a re-run of this effect for any other reason never
    // launches twice. A result lands only if its request is still the latest.
    if (handled.current === key) return;
    handled.current = key;
    const stale = () => handled.current !== key;

    if (request.kind === "new" || request.kind === "agent") {
      const runtime = ownSurface ? { runtime: { surfaceName: null } } : {};
      const launch =
        request.kind === "agent"
          ? launchAgent(request.agentId, { surfaceKey, sourceFeature: "chat", ...runtime })
          : launchMandate(request.mandateKey ?? DEFAULT_NEW_CHAT_MANDATE_KEY, {
              surfaceKey,
              // A REGISTERED feature, never a new string: this surface IS the chat.
              sourceFeature: "chat",
              ...runtime,
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
      dispatch(resumeConversation({ conversationId: target, agentId: request.agentId, surfaceKey }))
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
  }, [enabled, surfaceKey, request, launchMandate, launchAgent, dispatch, waitingForOrganization, ownSurface]);

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
  const openExisting = (id: string, agentId?: string | null) => {
    if (id === conversationId) return;
    setConversationId(null);
    setFailure(null);
    setRequest((current) => ({ kind: "open", conversationId: id, agentId: agentId ?? null, nonce: current.nonce + 1 }));
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
