"use client";

/**
 * useAgentApp
 *
 * The public hook for agent-app rendering. Every shell consumes this hook
 * (Tier-0/1 directly; Tier-2 slot overrides receive the hook output as
 * props; Tier-3 fully-custom apps call it themselves).
 *
 * It wraps the same per-instance Redux slices + thunks that power the
 * Agent Runner at /agents/[id]/run, exposing a stable, narrow public
 * contract:
 *
 *   - Identity:        appId, agentId, agentVersionId, useLatest, surfaceKey
 *   - Conversation:    conversationId (managed)
 *   - Agent metadata:  agent (definition), variableDefinitions, contextPolicies
 *   - Variables:       variables (resolved), setVariable(name, value), setVariables(values)
 *   - Context:         contextEntries, setContext(entries), clearContext()
 *   - Resources:       resources, addResource(...), removeResource(id), clearResources()
 *   - User input:      text, setText(value)
 *   - Submit:          submit({ text?, variables?, context? }) → fires smartExecute
 *   - Stream state:    response, requestId, isStreaming, isExecuting,
 *                      streamPhase, streamEvents, error
 *   - History:         messages, loadConversation(id), resetConversation()
 *
 * Tier-3 apps treat this as the entire API. The hook owns the heavy
 * lifting (Redux + thunks + execution routing); the consumer's
 * responsibility is rendering and binding to UI.
 */

import { logFailure } from "@/lib/errors/expectedRefusal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { useConversationRoutePromotion } from "@/features/agents/hooks/useConversationRoutePromotion";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { supabase } from "@/utils/supabase/client";
import { reconnectServerOperation } from "@/features/agents/runtime-reconnect/reconnect-server-operation.thunk";
// The run's failure in words a person reads — `request.error` (ErrorPayload),
// never `errorMessage` (a tool-call field). Shared with the app's run record.
import {
  requestFailure,
  requestIdsOf,
} from "@/features/agent-apps/tracking/run-outcome";

import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";

import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";

import {
  setUserVariableValue,
  setUserVariableValues,
  resetUserVariableValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";

import {
  setContextEntries,
  clearInstanceContext,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";

import {
  addResource,
  removeResource,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import type { ManagedResource } from "@/features/agents/types/instance.types";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";

import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";

import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";

import {
  selectResultText,
  selectPrimaryRequest,
  selectRequest,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useRetainRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";

import {
  selectStreamPhase,
  selectIsExecuting,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  selectConversationMessages,
  selectLatestAnswerText,
  EMPTY_CONVERSATION_MESSAGES,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";

import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { fetchPublicAppExecutionPayload } from "@/features/agent-apps/lib/publicAppPayload";
import { selectIsAuthenticated } from "@/lib/redux/slices/userSlice";
import {
  setInputPlaceholder,
  setShowFreeformInput,
  setShowAttachments,
  setShowMicrophone,
  setShowUserMessageOptions,
  setShowAssistantMessageOptions,
  setBufferStream,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";

import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

import { useSurfaceRuntimeRegistration } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceHandle } from "@ai-matrx/kit/content-transfer";
import {
  buildAgentAppSurfaceScope,
  type AgentAppSurfaceBinding,
  type AgentAppSurfaceLiveValues,
} from "@/features/agent-apps/surface/agent-app-surface";
import {
  useAppHolder,
  type AppHolder,
  type AppHolderSource,
} from "@/features/agent-apps/lib/appHolder";

export interface UseAgentAppArgs {
  /**
   * The app row, when the caller has one. THE PREFERRED INPUT: it carries the
   * app's JOB (`mandate_id`), so the hook can route through
   * `useAppHolder` — the one place this repo decides which agent an app runs.
   * With APP_MANDATE_CUTOVER OFF that router returns `app.agent_id` verbatim,
   * so passing the row changes nothing until the flip.
   *
   * Mutually informative with `agentId` below, never contradictory: when
   * `app` is present it WINS, and `agentId` is ignored.
   */
  app?: AppHolderSource | null;
  /**
   * Agent the app is bound to. Kept for the callers that genuinely have only
   * an agent — the code-preview and live-builder paths, which render an agent
   * that has no app row yet.
   */
  agentId?: string;
  /** Pinned version, when not using latest. */
  agentVersionId?: string | null;
  /** When true, the app follows the live agent rather than a pinned version. */
  useLatest?: boolean;
  /**
   * The agent-app's id. Used to scope the runner instance + tag conversation
   * metadata so the history sidebar can filter to this app's runs.
   */
  appId: string;
  /**
   * Surface key for focus + autoclear-split routing. Defaults to
   * `agent-app:<appId>` so each app has its own focus channel.
   */
  surfaceKey?: string;
  /** Auto-fire first execution on mount. Rarely useful for apps; default false. */
  autoRun?: boolean;
  /** Allow continuation past turn 1. Default true. */
  allowChat?: boolean;
  /** Variables panel visible at mount. Default: true when the agent has variables. */
  showVariablePanel?: boolean;
  /** Variables panel layout style — passes through to SmartAgentVariables. */
  variablesPanelStyle?:
    "form" | "inline" | "wizard" | "compact" | "guided" | "cards";
  /** Show the pre-execution gate before the first run. */
  showPreExecutionGate?: boolean;
  /** Custom pre-execution message. */
  preExecutionMessage?: string;
  /** Show agent-authored definition messages (instructions, welcome). */
  showDefinitionMessages?: boolean;
  /** Show body content of definition messages (default: header-only). */
  showDefinitionMessageContent?: boolean;
  /** Hide reasoning blocks from the transcript. */
  hideReasoning?: boolean;
  /** Hide tool-result blocks from the transcript. */
  hideToolResults?: boolean;

  // ── Settings → dispatched as instance-ui-state setters after the
  //    conversation exists. These flow into Redux so the consuming
  //    components (SmartAgentInput, MessageOptions, etc.) read them
  //    via selectors without needing props.
  /** Override the textarea placeholder. Null = default. */
  inputPlaceholder?: string | null;
  /** Render the freeform text input. False hides it (variables only). */
  showFreeformInput?: boolean;
  /** Show attachment button + resource chips. */
  showAttachments?: boolean;
  /** Show the mic button in the input toolbar. */
  showMicrophone?: boolean;
  /** Show the ⋯ menu on user messages. */
  showUserMessageOptions?: boolean;
  /** Show the ⋯ menu on assistant messages. */
  showAssistantMessageOptions?: boolean;
  /** Buffer the stream — paint only when complete. */
  bufferStream?: boolean;

  /**
   * Puts this run on a declared surface: the launch carries
   * `runtime.surfaceName` + a live `applicationScope`, and the hook registers
   * a surface runtime so the header Agents chrome can Run here too.
   *
   * OMIT IT on authed routes (`/agent-apps/[id]/**`) — the launch then adopts
   * the ancestor `matrx-user/agent-apps` provider, name and scope together.
   * See `features/agent-apps/surface/agent-app-surface.ts` for the decision.
   */
  surface?: AgentAppSurfaceBinding;
}

export interface UseAgentAppReturn {
  // ── Identity ───────────────────────────────────────────────────────────
  appId: string;
  /** The agent that will actually run. Empty string = nothing resolved yet. */
  agentId: string;
  agentVersionId: string | null;
  useLatest: boolean;
  /**
   * The JOB behind this app, and which layer decided its Holder — for the
   * mandate door and the provenance pill. All null on the pinned path
   * (APP_MANDATE_CUTOVER OFF), which is how a surface knows not to draw them.
   */
  mandateId: string | null;
  mandateKey: string | null;
  holderProvenance: AppHolder["provenance"];
  surfaceKey: string;
  conversationId: string | null;

  // ── Agent metadata (read-only, sourced from the live agent) ────────────
  agent: AgentDefinition | undefined;
  variableDefinitions: AgentDefinition["variableDefinitions"];
  contextPolicies: AgentDefinition["contextPolicies"];

  // ── Variables ─────────────────────────────────────────────────────────
  variables: Record<string, unknown>;
  setVariable: (name: string, value: unknown) => void;
  setVariables: (values: Record<string, unknown>) => void;
  resetVariables: () => void;

  // ── Context ────────────────────────────────────────────────────────────
  contextEntries: Record<string, InstanceContextEntry>;
  setContext: (entries: Array<{ key: string; value: unknown }>) => void;
  clearContext: () => void;

  // ── Resources (multimodal) ─────────────────────────────────────────────
  resources: Record<string, ManagedResource>;
  addResource: (resource: ManagedResource) => void;
  removeResource: (resourceId: string) => void;

  // ── User input text ────────────────────────────────────────────────────
  text: string;
  setText: (value: string) => void;

  // ── Submit + execution state ───────────────────────────────────────────
  /**
   * Stage and run. Resolves with a receipt naming the conversation and the
   * requests that existed before this run, so a caller can wait for THIS
   * run's real outcome (`waitForRunOutcome`) — resolving is not success.
   */
  submit: (args?: SubmitArgs) => Promise<SubmitReceipt | undefined>;
  response: string;
  requestId: string | null;
  isStreaming: boolean;
  isExecuting: boolean;
  streamPhase: ReturnType<typeof selectStreamPhase> extends (
    state: unknown,
  ) => infer R
    ? R
    : never;
  error: string | null;

  // ── History ────────────────────────────────────────────────────────────
  messages: ReturnType<typeof selectConversationMessages> extends (
    state: unknown,
  ) => infer R
    ? R
    : never;
  loadConversation: (conversationId: string) => Promise<void>;
  resetConversation: () => void;
  /**
   * Start a brand-new run on a fresh conversation ("Start over"): the old
   * result is left behind, the input clears, and the next submit starts a
   * NEW conversation. `runKey` changes each time, so a shell can remount the
   * app's own UI to its first screen.
   */
  startNewRun: () => void;
  runKey: number;
  /**
   * True while a run named in the address is being reopened (a refresh, a
   * shared link). When it flips back, the conversation's variables are
   * loaded — a shell remounts the app so it can seed its inputs from them.
   */
  isRestoringRun: boolean;
  /** This page reopened a run from its address and it has loaded (see `isReopenedRun` on the app contract). */
  isReopenedRun: boolean;
  /** A reopened run that had ended without an answer — "stopped" or "failed"; null otherwise. */
  reopenedRunEnded: "stopped" | "failed" | null;

  // ── Configuration mirrors (so shells can read state-of-app) ────────────
  allowChat: boolean;
  /** Exact local Alchemy capability for the shell that renders this hook. */
  surfaceHandle: SurfaceHandle | null;
}

export interface SubmitReceipt {
  conversationId: string;
  requestIdsBefore: string[];
}

export interface SubmitArgs {
  text?: string;
  variables?: Record<string, unknown>;
  context?: Array<{ key: string; value: unknown }>;
}

const EMPTY_RECORD: Record<string, never> = Object.freeze({});

/** How long a submit pressed during load waits for the app before it says so. */
const SUBMIT_READY_WAIT_MS = 30_000;

/** The last request status the server recorded for a conversation. */
async function readLastRunStatus(conversationId: string): Promise<string | null> {
  const { data } = await supabase
    .schema("chat")
    .from("conversation")
    .select("last_request_status")
    .eq("id", conversationId)
    .maybeSingle();
  return (data as { last_request_status?: string | null } | null)?.last_request_status ?? null;
}

/** How long a reopened link keeps looking for its run before saying so. */
const REOPEN_RETRY_MS = 45_000;

export function useAgentApp(args: UseAgentAppArgs): UseAgentAppReturn {
  const {
    appId,
    autoRun = false,
    allowChat = true,
    showVariablePanel,
    variablesPanelStyle,
    showPreExecutionGate,
    preExecutionMessage,
    showDefinitionMessages,
    showDefinitionMessageContent,
    hideReasoning,
    hideToolResults,
    inputPlaceholder,
    showFreeformInput,
    showAttachments,
    showMicrophone,
    showUserMessageOptions,
    showAssistantMessageOptions,
    bufferStream,
    surface,
  } = args;
  const surfaceKey = args.surfaceKey ?? `agent-app:${appId}`;

  const dispatch = useAppDispatch();

  // ── WHICH AGENT ───────────────────────────────────────────────────────
  // The ONE decision point. With APP_MANDATE_CUTOVER OFF this is the app
  // row's own `agent_id` — the hook behaves exactly as it did before the
  // router existed. With it ON the app's JOB decides, so a rebind moves
  // every run of this app with no deploy.
  //
  // `holder.agentId` is null while an ON-path mandate is still resolving and
  // stays null if it REFUSES. Both collapse to the empty string here, which
  // is already the hook's "no agent yet" state: the payload fetch below
  // skips, `isReady` stays false, and the launcher creates no instance. It
  // never falls back to the pinned id — a silent fallback would make the
  // switch untestable and hide the exact breakage it exists to surface.
  const bareAgent = args.agentId;
  const bareVersion = args.agentVersionId ?? null;
  const bareUseLatest = args.useLatest ?? false;
  const holderSource = useMemo<AppHolderSource | null>(
    () =>
      args.app ??
      (bareAgent
        ? {
            agent_id: bareAgent,
            agent_version_id: bareVersion,
            use_latest: bareUseLatest,
          }
        : null),
    [args.app, bareAgent, bareVersion, bareUseLatest],
  );
  const holder = useAppHolder(holderSource);
  const agentId = holder.agentId ?? "";
  const agentVersionId = holder.agentVersionId;
  const useLatest = holder.useLatest;

  // ── Agent payload readiness gate ──────────────────────────────────────
  // The launcher's createInstance reads variableDefinitions + contextPolicies
  // from Redux at instance-create time and snapshots them onto the
  // conversation. If we let it fire before the agent has loaded, the
  // instance is permanently seeded with empty variables and the variable
  // panel never appears. Mirror the gate /agents/[id]/run uses:
  // fetchAgentExecutionMinimal first, hand `ready: isReady` to the
  // launcher, so the instance is only created once the payload is real.
  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );
  const isReady = executionPayload.isReady;

  // A payload that cannot be read is a refusal, never a quiet wait: without
  // it the launcher never creates the instance and every Run click does
  // nothing (live on /p/<slug> for a signed-out visitor, 2026-09-27 — the
  // reader is a signed-in door and answers a guest 401). The failure is kept
  // and surfaced through `error`, and `submit` refuses by the same sentence.
  const [payloadError, setPayloadError] = useState<{
    agentId: string;
    message: string;
  } | null>(null);
  // THE READER DEPENDS ON WHO IS LOOKING. A signed-out visitor can never
  // read the agent (signed-in door), so an app row goes straight to the
  // public app door; a signed-in person reads the agent, and only when that
  // is refused (a stranger to the agent on a shared app) falls through to
  // the same public door, which answers solely for a published, public app's
  // own default agent (`lib/publicAppPayload.ts`).
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const publicAppId = args.app ? appId : null;
  useEffect(() => {
    if (!agentId) return;
    if (isReady) return;
    let cancelled = false;
    const viaPublicDoor = () =>
      publicAppId
        ? dispatch(
            fetchPublicAppExecutionPayload({ appId: publicAppId, agentId }),
          ).unwrap()
        : Promise.reject(new Error("no public app to read through"));
    const load = isAuthenticated
      ? dispatch(fetchAgentExecutionMinimal(agentId))
          .unwrap()
          .catch((err: unknown) =>
            publicAppId ? viaPublicDoor() : Promise.reject(err),
          )
      : viaPublicDoor();
    load
      .catch((err: unknown) => {
        if (cancelled) return;
        logFailure(`[useAgentApp] agent ${agentId} setup could not be read:`, err);
        setPayloadError({
          agentId,
          message:
            "This app could not load its setup, so it can't run right now. " +
            "Reload the page to try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, isReady, dispatch, isAuthenticated, publicAppId]);
  const payloadRefusal =
    payloadError && payloadError.agentId === agentId && !isReady
      ? payloadError.message
      : null;

  // Use the same managed launcher /agents/[id]/run uses. It owns the
  // conversationId lifecycle, instance creation, focus tracking, etc.
  // A bumped key re-mints the conversation id (see `startNewRun`).
  const [runKey, setRunKey] = useState(0);
  const launcher = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: "agent-app",
    ...(runKey > 0 ? { preferFresh: true, freshSessionKey: runKey } : {}),
    // THE MANDATE DOOR — display identity is `agentId`; the run POSTs
    // `/ai/mandates/{key}` so the server honours a pinned winner. Passing
    // only the definition id ran latest and dropped the pin.
    ...(holder.mandateKey ? { mandateKey: holder.mandateKey } : {}),
    config: {
      autoRun,
      allowChat,
      ...(showVariablePanel !== undefined ? { showVariablePanel } : {}),
      ...(variablesPanelStyle ? { variablesPanelStyle } : {}),
      ...(showPreExecutionGate !== undefined ? { showPreExecutionGate } : {}),
      ...(preExecutionMessage ? { preExecutionMessage } : {}),
      ...(showDefinitionMessages !== undefined
        ? { showDefinitionMessages }
        : {}),
      ...(showDefinitionMessageContent !== undefined
        ? { showDefinitionMessageContent }
        : {}),
      ...(hideReasoning !== undefined ? { hideReasoning } : {}),
      ...(hideToolResults !== undefined ? { hideToolResults } : {}),
    },
    // A declared surface is passed EXPLICITLY (name + the identity/visitor
    // scope known at create time); with no binding this stays undefined so
    // `launchAgentExecution` auto-adopts the ancestor provider — on
    // `/agent-apps/[id]/**` that is `matrx-user/agent-apps`, name and live
    // scope together. Passing a name with no binding would be worse than
    // nothing: it disables adoption and launches scope-less.
    runtime: surface
      ? {
          surfaceName: surface.surfaceName,
          applicationScope: buildAgentAppSurfaceScope(surface, {}),
        }
      : undefined,
    apiEndpointMode: "agent",
    ready: isReady,
    // The URL is promoted to `?conversationId=` once a run starts; keep the
    // started conversation alive across that promotion (only abandoned,
    // empty instances are reaped).
    retainOnUnmount: true,
  });
  const conversationId = launcher.conversationId;

  // ── A run survives a refresh (the AI-workspace rule) ──────────────────
  // Ported from AgentRunnerPage: once a run starts, the address carries
  // `?conversationId=<id>` (canonical `useConversationRoutePromotion`, which
  // waits until the row is persisted); on load, an id in the address is
  // re-adopted — instance created under that id, history loaded, focus moved
  // — so the app's answer (and a still-running turn, through the runtime
  // reconnect the load stamps) comes back after a refresh. Signed-in only: a
  // guest cannot read a conversation back.
  const store = useAppStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlConversationId =
    (isAuthenticated ? searchParams.get("conversationId") : null) ?? undefined;
  const [restoreFailed, setRestoreFailed] = useState<string | null>(null);
  useConversationRoutePromotion({
    surfaceKey,
    agentId,
    conversationIdProp: urlConversationId,
    liveConversationId: conversationId,
    basePath: pathname ?? "/",
    buildHref: (id) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("conversationId", id);
      return `${pathname}?${params.toString()}`;
    },
    enabled: isAuthenticated && Boolean(agentId) && Boolean(pathname),
    // Same page, one more search param: never remount the app mid-run.
    promoteWith: "address",
  });
  const restoredRef = useRef<string | null>(null);
  // True while a reopened run is being rejoined — the app shows its busy
  // state instead of an idle, empty form.
  const [isReopening, setIsReopening] = useState(false);
  // Which conversation this page reopened from its address (null = none).
  const [reopenedId, setReopenedId] = useState<string | null>(null);
  // A reopened run that had ENDED without an answer: stopped or failed.
  const [reopenedEnded, setReopenedEnded] = useState<"stopped" | "failed" | null>(null);
  useEffect(() => {
    // READING a finished run you own needs no organization — only starting a
    // new one does. While the holder waits for an organization (no agent
    // resolved yet), reopen the run for reading under the app's own pinned
    // agent; a new Submit still resolves the organization first.
    const readingAgentId =
      agentId || (holder.organizationPending ? (holderSource?.agent_id ?? "") : "");
    if (!urlConversationId || !readingAgentId) return;
    if (agentId && !isReady) return;
    if (restoredRef.current === urlConversationId) return;
    restoredRef.current = urlConversationId;
    void (async () => {
      const state = store.getState();
      const loaded =
        state.messages?.byConversationId?.[urlConversationId]?.orderedIds
          ?.length ?? 0;
      if (loaded > 0) return;
      try {
        if (!state.conversations?.byConversationId[urlConversationId]) {
          await dispatch(
            createManualInstance({
              agentId: readingAgentId,
              conversationId: urlConversationId,
              apiEndpointMode: "agent",
              sourceFeature: "agent-app",
              surfaceKey,
            }),
          ).unwrap();
        }
        setIsReopening(true);
        const load = () =>
          dispatch(
            loadConversation({
              conversationId: urlConversationId,
              surfaceKey,
              // A reopen from the address: reopening never spends a run, and
              // the app's agent is one the person was never given directly.
              displayOverrides: { autoRun: false },
              agentBehindApp: true,
            }),
          ).unwrap();
        const hasAnswer = () =>
          selectLatestAnswerText(urlConversationId)(store.getState()).length > 0;
        // A refresh at ANY moment after Submit: the address carries the id
        // from the instant the run starts, but in the first seconds the
        // server may not have written the row or registered the operation
        // yet. So: load, then rejoin the server's still-running turn
        // (retained text replays, live output continues, the terminal frame
        // reloads the answer); when there is nothing to rejoin YET, retry for
        // a bounded while before saying the run cannot be found.
        await load();
        const deadline = Date.now() + REOPEN_RETRY_MS;
        let found = hasAnswer();
        while (!found && Date.now() < deadline) {
          const result = await dispatch(
            reconnectServerOperation({
              conversationId: urlConversationId,
              source: "cold-load",
            }),
          ).unwrap().catch(() => null);
          if (result?.followed) {
            found = true;
            break;
          }
          await load().catch(() => undefined);
          found = hasAnswer();
          if (found) break;
          // A run that ENDED without an answer (the person pressed Stop, or it
          // failed) has nothing to rejoin — it is not "still starting". Its
          // conversation says so; show that, never a 45s "Reopening…".
          const ended = await readLastRunStatus(urlConversationId);
          if (ended === "cancelled" || ended === "failed" || ended === "error") {
            setReopenedEnded(ended === "cancelled" ? "stopped" : "failed");
            found = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        setIsReopening(false);
        if (found) setReopenedId(urlConversationId);
        if (!found) {
          throw new Error("no answer and no running operation for this run");
        }
      } catch (err) {
        setIsReopening(false);
        // Loud, and the address stops pointing at a run we cannot show.
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[useAgentApp] could not reopen run ${urlConversationId}:`, reason);
        setRestoreFailed(
          "The run in this link could not be found. Start a new one.",
        );
        const params = new URLSearchParams(window.location.search);
        params.delete("conversationId");
        const qs = params.toString();
        replaceAddressWithoutNavigating(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
      }
    })();
  }, [
    urlConversationId,
    agentId,
    isReady,
    store,
    dispatch,
    surfaceKey,
    holder.organizationPending,
    holderSource,
  ]);

  // ── Settings → Redux ─────────────────────────────────────────────────
  // Each setting that's defined on the args dispatches a setter once the
  // conversation exists. Per the architecture: settings live in Redux,
  // consuming components (SmartAgentInput, message option menus, etc.)
  // read them via selectors — no prop chains.
  useEffect(() => {
    if (!conversationId) return;
    if (inputPlaceholder === undefined) return;
    dispatch(
      setInputPlaceholder({ conversationId, value: inputPlaceholder ?? null }),
    );
  }, [conversationId, inputPlaceholder, dispatch]);

  useEffect(() => {
    if (!conversationId || showFreeformInput === undefined) return;
    dispatch(
      setShowFreeformInput({ conversationId, value: showFreeformInput }),
    );
  }, [conversationId, showFreeformInput, dispatch]);

  useEffect(() => {
    if (!conversationId || showAttachments === undefined) return;
    dispatch(setShowAttachments({ conversationId, value: showAttachments }));
  }, [conversationId, showAttachments, dispatch]);

  useEffect(() => {
    if (!conversationId || showMicrophone === undefined) return;
    dispatch(setShowMicrophone({ conversationId, value: showMicrophone }));
  }, [conversationId, showMicrophone, dispatch]);

  useEffect(() => {
    if (!conversationId || showUserMessageOptions === undefined) return;
    dispatch(
      setShowUserMessageOptions({
        conversationId,
        value: showUserMessageOptions,
      }),
    );
  }, [conversationId, showUserMessageOptions, dispatch]);

  useEffect(() => {
    if (!conversationId || showAssistantMessageOptions === undefined) return;
    dispatch(
      setShowAssistantMessageOptions({
        conversationId,
        value: showAssistantMessageOptions,
      }),
    );
  }, [conversationId, showAssistantMessageOptions, dispatch]);

  useEffect(() => {
    if (!conversationId || bufferStream === undefined) return;
    dispatch(setBufferStream({ conversationId, value: bufferStream }));
  }, [conversationId, bufferStream, dispatch]);

  // ── Selectors ─────────────────────────────────────────────────────────

  const agent = useAppSelector((state) =>
    agentId ? selectAgentById(state, agentId) : undefined,
  );

  const variables = useAppSelector((state) =>
    conversationId
      ? selectResolvedVariables(conversationId)(state)
      : EMPTY_RECORD,
  );

  // A run reopened for READING (no organization, so no agent payload) has its
  // values but no definitions naming them — fall back to the raw values so
  // the app and the page still know what the run was asked.
  const rawUserValues = useAppSelector((state) =>
    conversationId
      ? state.instanceVariableValues?.byConversationId?.[conversationId]?.userValues
      : undefined,
  );
  const shownVariables =
    Object.keys(variables).length > 0 || !rawUserValues
      ? (variables as Record<string, unknown>)
      : (rawUserValues as Record<string, unknown>);

  const contextEntries = useAppSelector((state) =>
    conversationId
      ? selectInstanceContextEntries(conversationId)(state)
      : EMPTY_RECORD,
  );

  const resources = useAppSelector((state) =>
    conversationId
      ? selectInstanceResources(conversationId)(state)
      : EMPTY_RECORD,
  );

  const text = useAppSelector((state) =>
    conversationId ? selectUserInputText(conversationId)(state) : "",
  );

  const primaryRequest = useAppSelector((state) =>
    conversationId ? selectPrimaryRequest(conversationId)(state) : undefined,
  );
  const requestId = primaryRequest?.requestId ?? null;

  const liveResponse = useAppSelector((state) =>
    requestId ? selectResultText(requestId)(state) : "",
  );
  // After a refresh there is no live request — the answer is the committed
  // assistant message the reopened conversation loaded.
  const committedAnswer = useAppSelector((state) =>
    conversationId ? selectLatestAnswerText(conversationId)(state) : "",
  );
  const response = liveResponse || committedAnswer;
  const request = useAppSelector((state) =>
    requestId ? selectRequest(requestId)(state) : undefined,
  );

  // Agent-app shells render `response` (accumulated text) rather than
  // `MarkdownStream requestId=`, so the canonical viewer retention never
  // applies — retain here for the hook's mount lifetime.
  // Doctrine: /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md.
  useRetainRequestForViewer(requestId, "useAgentApp");

  const isExecuting = useAppSelector((state) =>
    conversationId ? selectIsExecuting(conversationId)(state) : false,
  );
  const streamPhase = useAppSelector((state) =>
    conversationId ? selectStreamPhase(conversationId)(state) : "idle",
  );
  const messagesSelector = useMemo(
    () =>
      conversationId
        ? selectConversationMessages(conversationId)
        : () => EMPTY_CONVERSATION_MESSAGES,
    [conversationId],
  );
  const messages = useAppSelector(messagesSelector);

  const isStreaming =
    streamPhase === "text_streaming" ||
    streamPhase === "connecting" ||
    streamPhase === "pre_token" ||
    streamPhase === "interstitial";

  // A Holder that will not resolve outranks a run error: there is no run.
  // Surfacing it here is what lets every shell refuse loudly through the
  // error path it already renders, instead of sitting on a dead submit button.
  // No organization chosen is not an error on screen: reading a run needs
  // none, and a new run asks for one at Submit (ask-then-continue).
  const error =
    (holder.organizationPending ? null : holder.error) ??
    payloadRefusal ??
    restoreFailed ??
    requestFailure(request);

  // ── Surface runtime ───────────────────────────────────────────────────
  // Registered from the hook rather than a wrapping provider because every
  // shell has early returns (loading gate, pre-execution gate, override
  // branches) — a provider in the returned JSX would unregister and
  // re-register the surface on each branch flip. Scope is read at Run time,
  // so it always carries the CURRENT input, variables, and stream state.
  // `submit()` stages Redux values and dispatches smartExecute in the SAME JS
  // tick, before React can render the selector updates below. The registered
  // getScope therefore reads this ref for run input: submit writes it
  // synchronously, while ordinary renders keep it aligned with Redux.
  const renderedRunInput: AgentAppSurfaceLiveValues = {
    user_input: text || undefined,
    form_variable_values:
      Object.keys(variables).length > 0
        ? (variables as Record<string, unknown>)
        : undefined,
  };
  const liveRunInputRef = useRef<AgentAppSurfaceLiveValues>(renderedRunInput);
  useEffect(() => {
    liveRunInputRef.current = {
      user_input: text || undefined,
      form_variable_values:
        Object.keys(variables).length > 0
          ? (variables as Record<string, unknown>)
          : undefined,
    };
  }, [text, variables]);
  const liveSurfaceValues: AgentAppSurfaceLiveValues = {
    ...renderedRunInput,
    conversation_id: conversationId ?? undefined,
    run_status: error
      ? "error"
      : isStreaming || isExecuting
        ? "streaming"
        : response
          ? "complete"
          : undefined,
    response_text: response || undefined,
  };
  const surfaceHandle = useSurfaceRuntimeRegistration(
    surface
      ? {
          surfaceName: surface.surfaceName,
          getScope: () =>
            buildAgentAppSurfaceScope(surface, {
              ...liveSurfaceValues,
              ...liveRunInputRef.current,
            }),
        }
      : null,
  );

  // ── Variable / context / resource writers ────────────────────────────

  const setVariable = useCallback(
    (name: string, value: unknown) => {
      if (!conversationId) return;
      dispatch(setUserVariableValue({ conversationId, name, value }));
    },
    [conversationId, dispatch],
  );

  const setVariables = useCallback(
    (values: Record<string, unknown>) => {
      if (!conversationId) return;
      dispatch(setUserVariableValues({ conversationId, values }));
    },
    [conversationId, dispatch],
  );

  const resetVariables = useCallback(() => {
    if (!conversationId) return;
    dispatch(resetUserVariableValues(conversationId));
  }, [conversationId, dispatch]);

  const setContext = useCallback(
    (entries: Array<{ key: string; value: unknown }>) => {
      if (!conversationId) return;
      dispatch(setContextEntries({ conversationId, entries }));
    },
    [conversationId, dispatch],
  );

  const clearContext = useCallback(() => {
    if (!conversationId) return;
    // `setContextEntries` is MERGE-ONLY — it can never remove a key, so an
    // empty `entries` array cleared nothing and stale per-turn context leaked
    // into the next conversation. Clearing goes through the slice's own
    // clear action.
    dispatch(clearInstanceContext(conversationId));
  }, [conversationId, dispatch]);

  const addResourceCb = useCallback(
    (resource: ManagedResource) => {
      if (!conversationId) return;
      dispatch(
        addResource({
          conversationId,
          blockType: resource.blockType,
          source: resource.source,
          resourceId: resource.resourceId,
        }),
      );
    },
    [conversationId, dispatch],
  );

  const removeResourceCb = useCallback(
    (resourceId: string) => {
      if (!conversationId) return;
      dispatch(removeResource({ conversationId, resourceId }));
    },
    [conversationId, dispatch],
  );

  const setText = useCallback(
    (value: string) => {
      if (!conversationId) return;
      dispatch(setUserInputText({ conversationId, text: value }));
    },
    [conversationId, dispatch],
  );

  // ── Submit ────────────────────────────────────────────────────────────

  // A submit pressed while the app is still loading is HELD, not refused:
  // the person has just typed their input (often right after choosing a
  // workspace, which re-resolves the agent), and "still loading — try again"
  // threw that input away. The submit waits, bounded, on the live values.
  const readinessRef = useRef({
    isReady,
    conversationId,
    payloadRefusal,
    holderError: holder.error,
    organizationPending: holder.organizationPending,
  });
  useEffect(() => {
    readinessRef.current = {
      isReady,
      conversationId,
      payloadRefusal,
      holderError: holder.error,
      organizationPending: holder.organizationPending,
    };
  }, [isReady, conversationId, payloadRefusal, holder.error, holder.organizationPending]);

  // While a submit is held the app shows its own pending state (isExecuting
  // is true), so the control never looks idle and never refuses on press.
  const [isHolding, setIsHolding] = useState(false);

  const submitWhenReady = async (
    submitArgs?: SubmitArgs,
  ): Promise<SubmitReceipt> => {
    {
      // No organization chosen: a NEW run is held until the person picks one
      // (the platform's ask-then-continue gate), then proceeds with it.
      if (readinessRef.current.organizationPending) {
        await ensureOrganizationContext();
      }
      const deadline = Date.now() + SUBMIT_READY_WAIT_MS;
      while (
        !readinessRef.current.payloadRefusal &&
        // A holder that REFUSED (no runnable agent) will not become ready by
        // waiting — say so now. Waiting for an organization is not a refusal.
        (!readinessRef.current.holderError || readinessRef.current.organizationPending) &&
        !(readinessRef.current.isReady && readinessRef.current.conversationId) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const live = readinessRef.current;
      // Refuse loudly rather than return: every shell shows a thrown submit
      // as its run error, and a silent return read as "clicked, nothing".
      if (live.payloadRefusal) throw new Error(live.payloadRefusal);
      if (!live.isReady || !live.conversationId) {
        throw new Error(
          live.holderError ??
            "This app did not finish loading. Reload the page and try again.",
        );
      }
      const conversationId = live.conversationId;
      const submittedVariables = {
        ...(variables as Record<string, unknown>),
        ...(submitArgs?.variables ?? {}),
      };
      liveRunInputRef.current = {
        user_input: (submitArgs?.text ?? text) || undefined,
        form_variable_values:
          Object.keys(submittedVariables).length > 0
            ? submittedVariables
            : undefined,
      };
      // Pre-stage any per-call writes BEFORE dispatching execute, so the
      // executor reads the latest state. smartExecute doesn't take an
      // explicit payload — it composes from the per-instance slices.
      if (submitArgs?.variables) {
        dispatch(
          setUserVariableValues({
            conversationId,
            values: submitArgs.variables,
          }),
        );
      }
      if (submitArgs?.context) {
        dispatch(
          setContextEntries({
            conversationId,
            entries: submitArgs.context,
          }),
        );
      }
      if (submitArgs?.text != null) {
        dispatch(setUserInputText({ conversationId, text: submitArgs.text }));
      }
      // The address names the run the INSTANT it starts, so a refresh at any
      // point after Submit reopens it (a blind judge reloaded at 3s and lost
      // it when the address waited for the row to persist).
      if (isAuthenticated && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("conversationId") !== conversationId) {
          params.set("conversationId", conversationId);
          restoredRef.current = conversationId; // ours, live — never "reopen" it
          replaceAddressWithoutNavigating(
            `${window.location.pathname}?${params.toString()}`,
          );
        }
      }
      const requestIdsBefore = requestIdsOf(store.getState(), conversationId);
      await dispatch(smartExecute({ conversationId, surfaceKey }));
      return { conversationId, requestIdsBefore };
    }
  };

  const submit = async (
    submitArgs?: SubmitArgs,
  ): Promise<SubmitReceipt | undefined> => {
    setIsHolding(true);
    try {
      return await submitWhenReady(submitArgs);
    } finally {
      setIsHolding(false);
    }
  };

  const loadConversationCb = useCallback(
    async (id: string) => {
      await dispatch(loadConversation({ conversationId: id, surfaceKey }));
    },
    [dispatch, surfaceKey],
  );

  const resetConversation = useCallback(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("conversationId")) {
        params.delete("conversationId");
        const qs = params.toString();
        replaceAddressWithoutNavigating(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
      }
    }
    if (!conversationId) return;
    dispatch(resetUserVariableValues(conversationId));
    dispatch(setUserInputText({ conversationId, text: "" }));
    dispatch(clearInstanceContext(conversationId));
  }, [conversationId, dispatch]);

  const startNewRun = useCallback(() => {
    resetConversation();
    setRunKey((key) => key + 1);
  }, [resetConversation]);

  // Tag the conversation with this app's id once the conversationId is
  // available, so the history sidebar can filter by app.
  // (cx_conversation.metadata.app_id) — handled server-side by the
  // execution path; nothing for the hook to do here today. Reserved for a
  // future enhancement if/when client-side metadata stamping is needed.
  useEffect(() => {
    // intentionally empty — metadata stamping handled server-side via
    // sourceFeature="agent-app" + surfaceKey scoping.
  }, [conversationId, appId]);

  return useMemo<UseAgentAppReturn>(
    () => ({
      appId,
      agentId,
      agentVersionId,
      useLatest,
      mandateId: holder.mandateId,
      mandateKey: holder.mandateKey,
      holderProvenance: holder.provenance,
      surfaceKey,
      conversationId,
      agent,
      variableDefinitions: agent?.variableDefinitions ?? null,
      contextPolicies: agent?.contextPolicies ?? [],
      variables: shownVariables,
      setVariable,
      setVariables,
      resetVariables,
      contextEntries: contextEntries as Record<string, InstanceContextEntry>,
      setContext,
      clearContext,
      resources: resources as Record<string, ManagedResource>,
      addResource: addResourceCb,
      removeResource: removeResourceCb,
      text,
      setText,
      submit,
      response,
      requestId,
      isStreaming,
      isExecuting: isExecuting || isHolding || isReopening,
      streamPhase: streamPhase as UseAgentAppReturn["streamPhase"],
      error,
      messages: messages as UseAgentAppReturn["messages"],
      loadConversation: loadConversationCb,
      resetConversation,
      startNewRun,
      isRestoringRun: isReopening,
      isReopenedRun: reopenedId !== null && reopenedId === conversationId && !isReopening,
      reopenedRunEnded:
        reopenedId !== null && reopenedId === conversationId ? reopenedEnded : null,
      runKey,
      allowChat,
      surfaceHandle,
    }),
    [
      appId,
      agentId,
      agentVersionId,
      useLatest,
      holder,
      surfaceKey,
      conversationId,
      agent,
      shownVariables,
      setVariable,
      setVariables,
      resetVariables,
      contextEntries,
      setContext,
      clearContext,
      resources,
      addResourceCb,
      removeResourceCb,
      text,
      setText,
      submit,
      response,
      requestId,
      isStreaming,
      isExecuting,
      isHolding,
      isReopening,
      reopenedId,
      reopenedEnded,
      streamPhase,
      error,
      messages,
      loadConversationCb,
      resetConversation,
      startNewRun,
      runKey,
      allowChat,
      surfaceHandle,
    ],
  );
}
