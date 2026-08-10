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
import { ChatRoomSkeleton } from "@/features/agents/components/chat/ChatRoomSkeleton";
import { AlertTriangle, Loader2, RotateCw, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgentRunHeader } from "./AgentRunHeader";
import { DebugSessionActivator } from "@/features/agents/components/debug/DebugSessionActivator";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useAgentRunSurfaceScope } from "@/features/agents/hooks/useAgentRunSurfaceScope";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { setVariableValuesWithUndo } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.thunks";
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  selectIsExecuting,
  selectIsStreaming,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { isMediaVariableType } from "@/features/agents/types/agent-definition.types";
import { readStructuredList } from "@/features/agents/utils/variable-customcomponent";
import type { SourceFeature } from "@/features/agents/types/instance.types";

const RUN_INITIAL_MESSAGE_LIMIT = 12;

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
   * Focus-registry key for this surface. The `/code` workspace passes
   * `code-route:<agentId>` (see `codeWorkspaceSurfaceKey`). Standalone
   * `/agents/.../run` defaults to `${sourceFeature}:${agentId}`.
   */
  surfaceKey?: string;
  /** Back-link target shown in the run header. Defaults to `/agents`. */
  backHref?: string;
  /** Base path used by the mode switcher inside the header. Defaults to
   *  `/agents`. Admin passes `/administration/agents/system-agents/agents`. */
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
  /**
   * Keep started conversations alive across unmount (chat route uses this so
   * URL promotion does not clobber an in-flight stream).
   */
  retainOnUnmount?: boolean;
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
  retainOnUnmount = false,
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
  const [coldLoadingConversationId, setColdLoadingConversationId] = useState<
    string | null
  >(null);
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
    ready: !isInitializing && (!preferFresh || isFreshRoute),
    preferFresh: isFreshRoute,
    freshSessionKey: isFreshRoute ? freshSessionKey : 0,
    config: preferFresh ? { responseDensity: "compact" } : undefined,
    retainOnUnmount,
  });

  // Completely unrelated to the normal run.
  const sidebarSurfaceKey = `${sourceFeature}-sidebar:${agentId}`;

  // Live scope for the `matrx-user/agent-run` surface. Declared here (above
  // the early returns) because hooks cannot be conditional; only MOUNTED for
  // the standalone run route — `/code` embeds this same component under its
  // own surface and must not claim this one.
  const isAgentRunSurface = sourceFeature === "agent-runner";
  const getAgentRunScope = useAgentRunSurfaceScope({
    agentId,
    conversationId: conversationIdFromUrl ?? conversationId ?? undefined,
    sourceFeature,
  });

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
    lastSyncedUrl.current = conversationIdFromUrl;
    setColdLoadingConversationId(conversationIdFromUrl);

    (async () => {
      const alreadyLoadedCount =
        store.getState().messages?.byConversationId?.[conversationIdFromUrl]
          ?.orderedIds?.length ?? 0;
      if (alreadyLoadedCount > 0) {
        setColdLoadingConversationId(null);
        return;
      }
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
          setColdLoadingConversationId(null);
          console.error("[AgentRunnerPage] createManualInstance failed", err);
          return;
        }
      }
      try {
        await dispatch(
          loadConversation({
            conversationId: conversationIdFromUrl,
            surfaceKey,
            messageLimit: RUN_INITIAL_MESSAGE_LIMIT,
          }),
        ).unwrap();
        setColdLoadingConversationId(null);
      } catch (err) {
        setColdLoadingConversationId(null);
        console.error("[AgentRunnerPage] loadConversation failed", err);
      }
    })();
  }, [
    conversationIdFromUrl,
    isInitializing,
    authReady,
    store,
    agentId,
    dispatch,
    sourceFeature,
    surfaceKey,
  ]);

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

  const activeConversationId = conversationIdFromUrl ?? conversationId;
  const isColdLoadingConversation =
    !!conversationIdFromUrl &&
    coldLoadingConversationId === conversationIdFromUrl;

  if (isInitializing || !activeConversationId) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Loading agent...</span>
      </div>
    );
  }

  if (conversationIdFromUrl && isColdLoadingConversation) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <ChatRoomSkeleton />
      </div>
    );
  }

  // Write half of the `matrx-user/agent-run` surface (manifest `writeTargets`).
  // Both targets stage the run's INPUTS through the exact paths the user's own
  // typing uses — `setUserInputText` is what `AgentTextarea.handleTextChange`
  // dispatches, and `setVariableValuesWithUndo` wraps the same
  // `setUserVariableValues` the variable panels dispatch, adding the combined
  // { text, userValues } undo snapshot so the user can Cmd+Z an agent's fill.
  // Nothing here sends: the user still presses Send.
  //
  // Both refuse mid-flight. That is not politeness — a mid-run write does not
  // survive: `process-stream` dispatches `resetUserVariableValues` when the turn
  // completes, and text staged during a run is queued/steered into the RUNNING
  // turn by the next Enter instead of being sent as a fresh request. Silently
  // staging a value that is about to vanish is worse than refusing loudly.
  //
  // Fresh closures per call (the getWriteHandlers contract); state is read from
  // the store at apply time, never captured at render.
  const getSurfaceWriteHandlers = () => {
    const cid = activeConversationId;

    const assertRunIdle = (target: string) => {
      const state = store.getState();
      if (selectIsExecuting(cid)(state) || selectIsStreaming(cid)(state)) {
        throw new Error(
          `${target} cannot be applied while this run is in flight (is_executing / is_streaming). Wait for the turn to finish and try again.`,
        );
      }
    };

    return {
      user_input_draft: (value: unknown) => {
        if (typeof value !== "string" || !value.trim()) {
          throw new Error("user_input_draft expects a non-empty string.");
        }
        assertRunIdle("user_input_draft");
        dispatch(
          setUserInputText({
            conversationId: cid,
            text: value,
            userValues: selectUserVariableValues(cid)(store.getState()),
          }),
        );
      },

      variable_values: async (value: unknown) => {
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          throw new Error(
            "variable_values expects an object of { variableName: value }.",
          );
        }
        const incoming = value as Record<string, unknown>;
        const names = Object.keys(incoming);
        if (names.length === 0) {
          throw new Error(
            "variable_values expects at least one variable to set.",
          );
        }

        assertRunIdle("variable_values");

        const definitions = selectInstanceVariableDefinitions(cid)(
          store.getState(),
        );
        if (definitions.length === 0) {
          throw new Error(
            "This run's agent declares no variables, so there is nothing to fill.",
          );
        }
        const declared = definitions.map((d) => d.name).join(" | ");

        for (const name of names) {
          const def = definitions.find((d) => d.name === name);
          if (!def) {
            throw new Error(
              `"${name}" is not a variable this agent declares. Declared variables: ${declared}.`,
            );
          }
          // Context-bound: the server resolves this one from the active scope,
          // and a client value would clobber it.
          if (def.binding?.itemKey || def.binding?.contextItemId) {
            throw new Error(
              `"${name}" is bound to a context slot and is resolved from the active scope — it cannot be set from here.`,
            );
          }
          // Structured-list options hydrate from a list resource that is not in
          // this surface's scope, so the allowed values are not visible.
          if (readStructuredList(def.customComponent)) {
            throw new Error(
              `"${name}" draws its options from a Structured List whose values are not exposed on this surface — set it in the variable panel.`,
            );
          }
          // Media variables carry a MediaRef (an uploaded file), not text.
          if (isMediaVariableType(def.customComponent?.type)) {
            throw new Error(
              `"${name}" is a ${def.customComponent?.type} variable and takes an uploaded file reference, not a written value.`,
            );
          }

          const v = incoming[name];
          const isScalar =
            v === null ||
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean";
          const isStringArray =
            Array.isArray(v) && v.every((item) => typeof item === "string");
          if (!isScalar && !isStringArray) {
            throw new Error(
              `"${name}" expects a string, number, boolean, null, or an array of strings.`,
            );
          }

          const options = def.customComponent?.options;
          if (
            options &&
            options.length > 0 &&
            def.customComponent?.allowOther !== true &&
            v !== null
          ) {
            const chosen = Array.isArray(v) ? v : [v];
            const bad = chosen.filter(
              (item) => !options.includes(String(item)),
            );
            if (bad.length > 0) {
              throw new Error(
                `"${name}" only accepts: ${options.join(" | ")}. Rejected: ${bad.join(", ")}.`,
              );
            }
          }
        }

        await dispatch(
          setVariableValuesWithUndo({ conversationId: cid, values: incoming }),
        ).unwrap();
      },
    };
  };

  const body = (
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
          conversationId={activeConversationId}
          surfaceKey={surfaceKey}
          constrainWidth
          edgeToEdgeScroll
          deferColdMarkdown={!!conversationIdFromUrl}
          smartInputProps={{
            sendButtonVariant: "blue",
            showSubmitOnEnterToggle: true,
          }}
        />
      </div>
    </div>
  );

  if (!isAgentRunSurface) return body;

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/agent-run"
      getScope={getAgentRunScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      {body}
    </SurfaceRuntimeProvider>
  );
}
