"use client";

/**
 * useInstanceBootstrap — Execution-system bootstrap for the /demos/chat layout.
 *
 * Called ONCE from ChatPanelContent. Responsibilities:
 *
 *   1. Agent catalogue init:
 *      Dispatches initializeChatAgents() on mount — TTL-guarded (15 min).
 *      Tab-visibility stale-while-revalidate (4 hours).
 *
 *   2. Instance lifecycle — driven entirely by the URL:
 *      - agentId comes from the URL path or ?agent= param. Defaults to
 *        DEFAULT_AGENT_ID (welcome screen).
 *      - instanceId lives in ?instance=uuid in the URL. That is the ONLY
 *        place it is stored. No Redux field, no context, no ref that leaks
 *        to siblings — just the URL.
 *      - On URL change: if ?instance= is present AND that instance still
 *        exists in Redux (survives navigation, dies on refresh), reuse it.
 *      - If no ?instance= or the instance is gone: create a new one via
 *        createManualInstance, then router.replace the URL with the new id.
 *      - Per-agent reuse map (ref) prevents duplicate creation when switching
 *        back to a previously visited agent within the same session.
 *
 *   3. Conversation history:
 *      When the route is /c/[conversationId], dispatches
 *      fetchConversationHistory after instance creation/reuse. agentId must
 *      be in the URL as ?agent= (the sidebar sets this when clicking a chat).
 *
 * Why no "active instance" in Redux:
 *   The system supports many simultaneous instances (modals, sidebars, panels,
 *   the chat route itself). Tracking ONE as "active" is wrong — it would break
 *   the moment two instances coexist on screen. Every component that needs an
 *   instanceId gets it as a prop or reads it from the URL directly via
 *   useSearchParams(). There is no "active" concept.
 *
 * URL contract:
 *   /demos/chat                                      → default agent, no conversation
 *   /demos/chat/a/[agentId]                          → specific agent, no conversation
 *   /demos/chat/a/[agentId]?instance=uuid            → specific agent, reuse instance
 *   /demos/chat/c/[conversationId]?agent=uuid        → load conversation + agent
 *   /demos/chat/c/[conversationId]?agent=uuid&instance=uuid  → full resume
 */

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  initializeChatAgents,
  isChatListStale,
  fetchAgentExecutionMinimal,
} from "@/features/agents/redux/agent-definition/thunks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { DEFAULT_AGENT_ID } from "@/features/cx-chat/components/agent/local-agents";
import type { RootState } from "@/lib/redux/store";

// ── URL parsing ───────────────────────────────────────────────────────────────

interface ParsedChatUrl {
  agentId: string;
  conversationId: string | null;
  instanceId: string | null;
}

function parseChatUrl(
  pathname: string,
  searchParams: URLSearchParams,
): ParsedChatUrl {
  const agentPathMatch = pathname.match(/\/demos\/chat\/a\/([^/?]+)/);
  const convPathMatch = pathname.match(/\/demos\/chat\/c\/([^/?]+)/);

  const agentId =
    agentPathMatch?.[1] ?? searchParams.get("agent") ?? DEFAULT_AGENT_ID;

  return {
    agentId,
    conversationId: convPathMatch?.[1] ?? null,
    instanceId: searchParams.get("instance"),
  };
}

function withInstanceParam(
  pathname: string,
  searchParams: URLSearchParams,
  instanceId: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("instance", instanceId);
  return `${pathname}?${params.toString()}`;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useInstanceBootstrap() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Per-agent instance reuse map. Lives in a ref — purely session-local memory,
  // not Redux, not context. Maps agentId → instanceId for this session only.
  const instanceByAgentId = useRef<Map<string, string>>(new Map());

  // Guard against re-running for the same (agentId, conversationId) pair.
  const lastKey = useRef<string | null>(null);

  // ── Catalogue init ────────────────────────────────────────────────────────
  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);

  // ── Tab visibility stale-while-revalidate ─────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isChatListStale()) {
        dispatch(initializeChatAgents({ force: true }));
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [dispatch]);

  // ── Instance lifecycle — triggered by URL changes ─────────────────────────
  useEffect(() => {
    const {
      agentId,
      conversationId,
      instanceId: urlInstanceId,
    } = parseChatUrl(pathname, searchParams);

    const key = `${agentId}::${conversationId ?? ""}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    (async () => {
      // 1. Ensure agent execution data is loaded (idempotent).
      await dispatch(fetchAgentExecutionMinimal(agentId));

      // 2. Determine which instanceId to use.
      let resolvedId: string | null = null;

      // Check URL-specified instance — it may still be alive in Redux.
      if (urlInstanceId) {
        const stillAlive = await dispatch(
          (_: unknown, getState: () => RootState) =>
            !!getState().conversations.byConversationId[urlInstanceId],
        );
        if (stillAlive) resolvedId = urlInstanceId;
      }

      // Fall back to the per-agent reuse map (same session, different nav).
      if (!resolvedId) {
        const cached = instanceByAgentId.current.get(agentId);
        if (cached) {
          const stillAlive = await dispatch(
            (_: unknown, getState: () => RootState) =>
              !!getState().conversations.byConversationId[cached],
          );
          if (stillAlive) resolvedId = cached;
        }
      }

      // Create a fresh instance when nothing is reusable.
      if (!resolvedId) {
        const result = await dispatch(
          launchAgentExecution({
            surfaceKey: `cx-chat:${agentId}`,
            agentId,
            sourceFeature: "chat-interface",
            config: {
              autoRun: false,
              displayMode: "direct",
            },
          }),
        );
        if (launchAgentExecution.fulfilled.match(result)) {
          resolvedId = result.payload.conversationId;
          instanceByAgentId.current.set(agentId, resolvedId);
        }
      }

      if (!resolvedId) return;

      // 3. Write the instanceId into the URL (replace, no history entry).
      //    This is the only place instanceId is "stored" — it's the URL.
      if (searchParams.get("instance") !== resolvedId) {
        router.replace(withInstanceParam(pathname, searchParams, resolvedId), {
          scroll: false,
        });
      }

      // 4. Load the full conversation bundle for /c/ routes. loadConversation
      // rehydrates messages, variables, model overrides, display/context
      // (from metadata), and observability — superset of the legacy
      // fetchConversationHistory which only restored messages.
      if (conversationId) {
        dispatch(loadConversation({ conversationId }));
      }
    })();

    // Depend on the URL — pathname and searchParams trigger re-runs on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);
}
