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
import { useAgentLauncher } from "../../agents/hooks/useAgentLauncher";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "../../agents/components/chat/chat-quick-actions.config";
import { resumeConversation } from "../../agents/redux/execution-system/thunks/resume-conversation.thunk";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { selectShouldPromptForOrganization } from "@ai-matrx/chat/host/ui-slots";
import { selectIsCacheOnly } from "../../agents/redux/execution-system/conversations/conversations.selectors";
import { replaceAddressWithoutNavigating } from "@ai-matrx/chat/ui/addressWithoutNavigating";
import { describeLaunchError } from "./describe-launch-error";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { selectOrganizationId, ensureOrganizationContext, isOrganizationSelectionCancelled } from "../../host/org";

export type CanvasWorkspaceConversation =
  | { state: "opening"; purpose: "new" | "open" }
  | { state: "needs-organization"; choose: () => void }
  | { state: "ready"; conversationId: string }
  | { state: "failed"; purpose: "new" | "open"; reason: string; retry: () => void };

type Request =
  | { kind: "new"; nonce: number; mandateKey?: AnyMandateKey }
  | { kind: "agent"; agentId: string; nonce: number }
  | {
      kind: "open";
      conversationId: string;
      agentId: string | null;
      nonce: number;
      /** Recalled from this chat's memory, not named by the address or the person. */
      recalled?: boolean;
    };

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
  /**
   * The query param this conversation lives at (`?chat=<id>`), so a reload
   * returns the person to it the way `/chat/<id>` does. Read once on mount
   * (it wins over the default new chat), written once the server has the
   * conversation, removed by New chat. With no `?<param>=`, the conversation
   * this chat last showed on this device opens instead (see
   * `recallWorkspaceConversation`). Omitted = neither the address nor the memory
   * is touched (board chat TILES: many conversations, one page).
   */
  addressParam?: string;
};

/** A conversation id, as an address may name one. Anything else is ignored. */
const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The conversation `?<param>=` names in the current address, or null. */
export function conversationInAddress(param: string, search: string): string | null {
  const value = new URLSearchParams(search).get(param);
  return value && CONVERSATION_ID.test(value) ? value : null;
}

/**
 * THIS CHAT'S LAST CONVERSATION, remembered on this device (2026-10-05).
 * `?<param>=` alone was not enough: any address without it — the board opened
 * from the sidebar or the boards list, a link, a reload of an address copied
 * before the first send — opened "New chat" and the conversation was gone from
 * the column. The address still wins; this answers only when it names none.
 * Forgotten by New chat (an unsent chat), and when it can no longer be opened.
 */
export function workspaceChatMemoryKey(surfaceKey: string): string {
  return `matrx:workspace-chat:${surfaceKey}`;
}

export function recallWorkspaceConversation(surfaceKey: string): string | null {
  try {
    const value = window.localStorage.getItem(workspaceChatMemoryKey(surfaceKey));
    return value && CONVERSATION_ID.test(value) ? value : null;
  } catch {
    return null; // storage unavailable: the address alone decides
  }
}

export function rememberWorkspaceConversation(surfaceKey: string, conversationId: string | null): void {
  try {
    const key = workspaceChatMemoryKey(surfaceKey);
    if (conversationId) window.localStorage.setItem(key, conversationId);
    else window.localStorage.removeItem(key);
  } catch {
    // storage unavailable: the address still carries the conversation
  }
}

/** `search` with `?<param>=` set to `conversationId`, or removed when null. */
export function addressWithConversation(
  param: string,
  search: string,
  conversationId: string | null,
): string {
  const params = new URLSearchParams(search);
  if (conversationId) params.set(param, conversationId);
  else params.delete(param);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** A bare start (`{ kind }`) — as opposed to the options form, which never carries `kind`. */
function isCanvasWorkspaceStart(
  input: CanvasWorkspaceStart | CanvasWorkspaceConversationOptions,
): input is CanvasWorkspaceStart {
  return "kind" in input;
}

function resolveStartOptions(
  input: CanvasWorkspaceStart | CanvasWorkspaceConversationOptions | undefined,
): {
  enabled: boolean;
  start: CanvasWorkspaceStart | undefined;
  ownSurface: boolean;
  addressParam: string | null;
} {
  if (!input) return { enabled: true, start: undefined, ownSurface: false, addressParam: null };
  if (isCanvasWorkspaceStart(input))
    return { enabled: true, start: input, ownSurface: false, addressParam: null };
  return {
    enabled: input.enabled ?? true,
    start: input.start,
    ownSurface: input.surfaceName === null,
    addressParam: input.addressParam ?? null,
  };
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
  const { enabled, start, ownSurface, addressParam } = resolveStartOptions(input);
  const dispatch = useAppDispatch();
  const { launchMandate, launchAgent } = useAgentLauncher();
  const [request, setRequest] = useState<Request>(() => initialRequest(start));
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  const organizationId = useAppSelector(selectOrganizationId);
  const promptForOrganization = useAppSelector(selectShouldPromptForOrganization);
  const waitingForOrganization = request.kind !== "open" && !organizationId;
  // Nothing launches until the address has been read: a reload must reopen the
  // conversation it names, never start a new one beside it.
  const [addressRead, setAddressRead] = useState(addressParam === null);
  const serverHasIt = useAppSelector((state) =>
    conversationId ? !selectIsCacheOnly(conversationId)(state) : false,
  );

  // Declared BEFORE the launch effect so it runs first in the same commit.
  useEffect(() => {
    if (addressRead || addressParam === null) return;
    const named = conversationInAddress(addressParam, window.location.search);
    const recalled = named ? null : recallWorkspaceConversation(surfaceKey);
    const target = named ?? recalled;
    if (target && !start) {
      setRequest((current) =>
        current.kind === "new" && current.nonce === 0
          ? { kind: "open", conversationId: target, agentId: null, nonce: 0, recalled: !named }
          : current,
      );
    }
    setAddressRead(true);
  }, [addressRead, addressParam, start, surfaceKey]);

  // The address follows the shown conversation: set once the server has it
  // (a reopened one always has), cleared when a new chat has not been sent.
  useEffect(() => {
    if (addressParam === null || !addressRead || !conversationId) return;
    const shown = request.kind === "open" || serverHasIt ? conversationId : null;
    rememberWorkspaceConversation(surfaceKey, shown);
    const search = addressWithConversation(addressParam, window.location.search, shown);
    if (search === window.location.search) return;
    replaceAddressWithoutNavigating(`${window.location.pathname}${search}${window.location.hash}`);
  }, [addressParam, addressRead, conversationId, request.kind, serverHasIt, surfaceKey]);

  useEffect(() => {
    if (!enabled || waitingForOrganization || !addressRead) return;
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
            if (request.recalled) {
              // Only this device's memory named it (archived, another account's,
              // gone): forget it and open the default new chat, as before.
              console.warn("[canvas-workspace] the remembered conversation could not be opened; starting a new chat", target, error);
              rememberWorkspaceConversation(surfaceKey, null);
              if (!stale()) setRequest((current) => ({ kind: "new", nonce: current.nonce + 1 }));
              return;
            }
            console.error("[canvas-workspace] could not load the conversation", target, error);
            if (!stale()) setFailure(describeLaunchError(error));
          },
        );
    }
  }, [enabled, surfaceKey, request, launchMandate, launchAgent, dispatch, waitingForOrganization, ownSurface, addressRead]);

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
