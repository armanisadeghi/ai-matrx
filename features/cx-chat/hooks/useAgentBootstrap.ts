"use client";

/**
 * useAgentBootstrap — Single orchestration point for all agent data fetching
 * within the ssr/chat layout.
 *
 * Called ONCE from ChatPanelContent (the first persistent client component in
 * the layout). Handles catalogue init and per-agent operational fetch:
 *
 *   Catalogue (Tier 1+):
 *     Dispatches initializeChatAgents() on mount — fetches owned + shared +
 *     builtins via agx_get_list_full(). TTL-guarded (15 min). Also wired
 *     to tab-visibility stale-while-revalidate (4-hour threshold).
 *
 *   Execution fetch (Tier 2):
 *     Triggered whenever an agentId appears in the URL — either the
 *     /demos/chat/a/[agentId] route or the ?agent=[agentId] search param.
 *     Dispatches fetchAgentExecutionMinimal (idempotent via the thunk's own
 *     guard), then hydrates activeChatSlice with the full config.
 *
 * Migration note (Phase 1):
 *   Previously used initializeAgents() + fetchAgentOperational() from the
 *   legacy agentCacheSlice / agentFetchThunks system. Both now point to the
 *   new features/agents/redux/agent-definition system, which fetches directly
 *   from the `agx_agent` table (agents have replaced prompts).
 */

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  initializeChatAgents,
  isChatListStale,
  fetchAgentExecutionMinimal,
} from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import {
  activeChatActions,
  selectActiveChatAgent,
  type ActiveChatAgent,
} from "../_legacy-stubs";
import type { LLMParams } from "@/lib/types/agent-chat";
import { DEFAULT_AGENTS } from "@/features/cx-chat/components/agent/local-agents";
import type { RootState } from "@/lib/redux/store";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract agentId from pathname + searchParams.
 * Supports /demos/chat/a/[agentId] and /demos/chat/c/[id]?agent=[agentId].
 */
function resolveAgentIdFromUrl(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  const agentRouteMatch = pathname.match(/\/demos\/chat\/a\/([^/]+)/);
  if (agentRouteMatch?.[1]) return agentRouteMatch[1];

  const agentParam = searchParams.get("agent");
  if (agentParam) return agentParam;

  return null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAgentBootstrap() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedAgent = useAppSelector(selectActiveChatAgent);

  // Track the last agentId we handled to prevent redundant execution fetches.
  const lastExecutionId = useRef<string | null>(null);

  // ── Catalogue init — once on mount, then TTL-guarded ─────────────────────
  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);

  // ── Tab visibility stale-while-revalidate ────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // isChatListStale() reads the module-level timestamp — no Redux read needed
      if (isChatListStale()) {
        dispatch(initializeChatAgents({ force: true }));
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [dispatch]);

  // ── Per-agent execution fetch — triggered by URL ──────────────────────────
  useEffect(() => {
    const agentId = resolveAgentIdFromUrl(pathname, searchParams);

    // No agent in URL — nothing to fetch
    if (!agentId) return;

    // Already handled this exact agentId — skip
    if (agentId === lastExecutionId.current) return;
    lastExecutionId.current = agentId;

    // Fast path: hardcoded DEFAULT_AGENT — no DB fetch needed
    const builtIn = DEFAULT_AGENTS.find((a) => a.promptId === agentId);
    if (builtIn) {
      if (selectedAgent.promptId !== agentId || !selectedAgent.configFetched) {
        dispatch(
          activeChatActions.setSelectedAgent({
            promptId: builtIn.promptId,
            name: builtIn.name,
            description: builtIn.description,
            variableDefaults: builtIn.variableDefaults,
            configFetched: true,
          }),
        );
      }
      return;
    }

    // Fetch minimal execution data from the agents table (variableDefinitions + contextSlots).
    // The thunk is idempotent — it skips the network call if the record is already ready.
    dispatch(fetchAgentExecutionMinimal(agentId)).then(() => {
      // Read the record from state after the thunk resolves
      dispatch((_: unknown, getState: () => RootState) => {
        const state = getState();
        const record = selectAgentById(state, agentId);

        if (!record) {
          // Agent not found — mark as fetched so UI doesn't keep waiting
          dispatch(
            activeChatActions.setSelectedAgent({
              promptId: agentId,
              name:
                selectedAgent.promptId === agentId ? selectedAgent.name : "",
              configFetched: true,
            }),
          );
          return;
        }

        // variableDefinitions is VariableDefinition[] — same shape as PromptVariable[]
        // (VariableDefinition is a superset; the cast is safe for activeChatSlice consumption)
        const variableDefaults =
          record.variableDefinitions as ActiveChatAgent["variableDefaults"];

        // Hydrate activeChatSlice with the agent config
        dispatch(
          activeChatActions.setSelectedAgent({
            promptId: record.id,
            name:
              record.name ||
              (selectedAgent.promptId === agentId ? selectedAgent.name : ""),
            description: record.description ?? undefined,
            variableDefaults,
            configFetched: true,
          }),
        );

        // If settings are already loaded (e.g. from a previous fetchAgentExecutionFull),
        // propagate model override and runtime settings to activeChatSlice.
        // LLMParams uses `model` (not model_id); tools live at agent level, not in LLMParams.
        if (record.settings && Object.keys(record.settings).length > 0) {
          const settings = record.settings as LLMParams;
          const {
            model,
            tools: _tools,
            ...runtimeSettings
          } = settings as LLMParams & { tools?: unknown };

          if (typeof model === "string" && model) {
            dispatch(activeChatActions.setModelOverride(model));
          }
          if (Object.keys(runtimeSettings).length > 0) {
            dispatch(
              activeChatActions.setAgentDefaultSettings(
                runtimeSettings as LLMParams,
              ),
            );
          }
        }
      });
    });

    // pathname and searchParams change on every navigation — that's our trigger.
    // Intentionally excluding dispatch + selectedAgent to avoid re-running on
    // Redux updates; lastExecutionId.current is our guard against duplicates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);
}
