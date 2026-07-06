"use client";

/**
 * AgentRunPage
 *
 * Full execution page for an agent run. Creates an execution instance via
 * useAgentLauncher (managed mode). Conversation history sidebar is now
 * handled by the shell sidebar's Large Route system (AgentRunSidebarMenu).
 *
 * This page only renders the header strip, conversation area, and mobile drawers.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  registerSurface,
  unregisterSurface,
  selectPendingNavigation,
  clearPendingNavigation,
} from "@/features/agents/redux/surfaces/surfaces.slice";
import {
  selectAgentExecutionPayload,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectAuthReady } from "@/lib/redux/selectors/userSelectors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useCreatorOwnershipSync } from "@/features/agents/hooks/useCreatorOwnershipSync";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { clearFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { AgentConversationColumn } from "../shared/AgentConversationColumn";
import { AlertTriangle, Loader2, RotateCw, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgentRunHeader } from "./AgentRunHeader";
import { DebugSessionActivator } from "@/features/agents/components/debug/DebugSessionActivator";
import type { SourceFeature } from "@/features/agents/types/instance.types";

interface AgentRunnerPageProps {
  agentId: string;
  /**
   * Trace + sandbox-binding scope for conversations created here. Defaults to
   * `"agent-runner"` for standalone `/agents/.../run` routes. The `/code`
   * workspace passes `"code-editor"` so `resolveAgentSandboxRef` attaches the
   * connected sandbox to chat turns (see `lib/sandbox/active-binding.ts`).
   */
  sourceFeature?: SourceFeature;
  /**
   * Focus-registry key for this surface. Defaults to
   * `${sourceFeature ?? "agent-runner"}:${agentId}`. The code workspace keeps
   * the legacy `agent-runner:${agentId}` key so editor bridges and history
   * slots stay aligned while `sourceFeature` is `"code-editor"`.
   */
  surfaceKey?: string;
  /** Back-link target shown in the run header. Defaults to `/agents`. */
  backHref?: string;
  /** Base path used by the mode switcher inside the header. Defaults to
   *  `/agents`. Admin passes `/administration/system-agents/agents`. */
  basePath?: string;
  /**
   * Optional URL builder for fork / retry navigation. When the embedding
   * route's URL pattern doesn't match `${basePath}/${agentId}/run`
   * (e.g. the code workspace lives at `/code?agentId=X` with no nested
   * `/run` segment), pass a builder so router.replace targets the right
   * URL. Default: `${basePath}/${agentId}/run?conversationId={cid}`.
   */
  buildConversationUrl?: (conversationId: string) => string;
  /**
   * When true and no `?conversationId=` in the URL, the launcher mints a
   * brand-new conversation on every fresh-session bump (+) instead of
   * reviving the surface's last focus. Used by the /code workspace.
   */
  preferFresh?: boolean;
  /** Drives launcher remint when `preferFresh` is active. Pass the code
   *  workspace fresh-session nonce (or 0 to disable). */
  freshSessionKey?: number;
}

export function AgentRunnerPage({
  agentId,
  sourceFeature = "agent-runner",
  surfaceKey: surfaceKeyProp,
  backHref = "/agents/all",
  basePath = "/agents",
  buildConversationUrl,
  preferFresh = false,
  freshSessionKey = 0,
}: AgentRunnerPageProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  useCreatorOwnershipSync(agentId);

  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );

  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);

  const conversationIdFromUrl = searchParams.get("conversationId") ?? undefined;
  const surfaceKey = surfaceKeyProp ?? `${sourceFeature}:${agentId}`;
  const isFreshRoute = preferFresh && !conversationIdFromUrl;

  useEffect(() => {
    if (!isFreshRoute) return;
    dispatch(clearFocus(surfaceKey));
  }, [isFreshRoute, surfaceKey, dispatch, agentId]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setIsInitializing(true);
      setInitError(null);
      try {
        if (!executionPayload.isReady) {
          await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
        }
      } catch (err) {
        console.error("Failed to load agent execution payload:", err);
        if (!cancelled) {
          setInitError(
            err instanceof Error ? err.message : "Failed to load agent.",
          );
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, initAttempt]);

  // Register this page as a `page` surface so action bars and shared
  // components can route fork/retry navigation outcomes correctly. The
  // basePath is what the routing thunk references when a navigation
  // intent fires; the effect below resolves it against the live agentId.
  useEffect(() => {
    dispatch(
      registerSurface({
        surfaceKey,
        kind: "page",
        basePath: `${basePath}/[agentId]/run`,
      }),
    );
    return () => {
      dispatch(unregisterSurface(surfaceKey));
    };
  }, [dispatch, surfaceKey, basePath]);

  // Pending navigation handler — when a shared action (fork, retry) wants
  // to jump us to a different conversationId, it writes here. We turn it
  // into a router.replace and clear the slot so consumers stay idempotent.
  const pendingNavigation = useAppSelector(selectPendingNavigation(surfaceKey));
  useEffect(() => {
    if (!pendingNavigation) return;
    const target = buildConversationUrl
      ? buildConversationUrl(pendingNavigation.conversationId)
      : `${basePath}/${agentId}/run?conversationId=${pendingNavigation.conversationId}`;
    router.replace(target);
    dispatch(clearPendingNavigation({ surfaceKey }));
  }, [
    pendingNavigation,
    router,
    dispatch,
    surfaceKey,
    basePath,
    agentId,
    buildConversationUrl,
  ]);

  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature,
    ready: !isInitializing,
    preferFresh: isFreshRoute,
    freshSessionKey: isFreshRoute ? freshSessionKey : 0,
    config: preferFresh ? { responseDensity: "compact" } : undefined,
  });

  // Completely unrelated to the normal run.
  const sidebarSurfaceKey = `${sourceFeature}-sidebar:${agentId}`;

  const agentName = useAppSelector((state) => selectAgentName(state, agentId));
  // Wait for the browser Supabase session to hydrate before issuing the
  // bundle queries — RLS denials look like empty `{}` errors otherwise.
  const authReady = useAppSelector(selectAuthReady);
  // Sync ?conversationId= URL param → focus registry + load history.
  // When the user clicks a past conversation in the sidebar, the URL updates
  // and this effect creates/reuses an instance keyed by that server UUID,
  // loads the full message history, and switches focus.
  const lastSyncedUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationIdFromUrl || isInitializing || !authReady) return;
    if (conversationIdFromUrl === lastSyncedUrl.current) return;
    if (conversationIdFromUrl === conversationId) return;
    lastSyncedUrl.current = conversationIdFromUrl;

    (async () => {
      const exists =
        !!store.getState().conversations?.byConversationId[
          conversationIdFromUrl
        ];
      if (!exists) {
        try {
          await dispatch(
            createManualInstance({
              agentId,
              conversationId: conversationIdFromUrl,
              apiEndpointMode: "agent",
              sourceFeature,
              surfaceKey,
            }),
          ).unwrap();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[AgentRunnerPage] createManualInstance failed", err);
          return;
        }
      }
      try {
        await dispatch(
          loadConversation({
            conversationId: conversationIdFromUrl,
            surfaceKey,
          }),
        ).unwrap();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[AgentRunnerPage] loadConversation failed", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationIdFromUrl, isInitializing, conversationId, authReady]);

  if (initError && !isInitializing) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md w-full rounded-lg border border-destructive/40 bg-destructive/5 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">
              Couldn&apos;t reach the agent service
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-snug">
            {initError}
          </p>
          <p className="text-xs text-muted-foreground leading-snug">
            Your work is safe — anything you had typed will be restored once the
            agent loads.
          </p>
          <Button
            size="sm"
            className="self-start gap-1.5"
            onClick={() => setInitAttempt((n) => n + 1)}
          >
            <RotateCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isInitializing || !conversationId) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Loading agent...</span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <DebugSessionActivator />
      {/* <AgentRunHeader
        agentId={agentId}
        agentName={agentName}
        surfaceKey={surfaceKey}
        backHref={backHref}
        basePath={basePath}
      /> */}

      {/* Main conversation area */}
      <div className="flex-1 overflow-hidden flex justify-center min-w-0">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          constrainWidth
          edgeToEdgeScroll
          smartInputProps={{
            sendButtonVariant: "blue",
            showSubmitOnEnterToggle: true,
          }}
        />
      </div>
    </div>
  );
}
