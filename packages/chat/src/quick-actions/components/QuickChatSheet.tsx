// features/quick-actions/components/QuickChatSheet.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquarePlus, PanelLeft } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { useAgentLauncher } from "../../agents/hooks/useAgentLauncher";
import { AgentConversationColumn } from "../../agents/components/shared/AgentConversationColumn";
import { ChatHistorySidebar } from "../../agents/components/chat/ChatHistorySidebar";
import { ChatRoomSkeleton } from "../../agents/components/chat/ChatRoomSkeleton";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "../../agents/components/chat/chat-quick-actions.config";
import { useMandate } from "../../mandates/useMandate";
import { resumeConversation } from "../../agents/redux/execution-system/thunks/resume-conversation.thunk";
import {
  registerSurface,
  unregisterSurface,
} from "../../agents/redux/surfaces/surfaces.slice";
import { selectHasMessages } from "../../agents/redux/execution-system/messages/messages.selectors";
import { clearFocus } from "../../agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import type { ConversationListItem } from "../../agents/redux/conversation-list/conversation-list.types";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";
import { asClause } from "@ai-matrx/kit/text";
import { WorkspaceGate } from "@host/features/organizations/components/WorkspaceGate";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { useComposerMode } from "../../agents/components/inputs/smart-input/composer/useComposerMode";
import { useCompactInputMaxHeight } from "../../agents/components/inputs/smart-input/composer/useCompactInputMaxHeight";

/** The conversation on screen, reported so a host can bring it back after a reload. */
export interface QuickChatConversationRef {
  conversationId: string;
  agentId: string;
}

interface QuickChatSheetProps {
  className?: string;
  /**
   * A conversation to open: one handed off live by another canonical composer,
   * or (with `resumeAgentId`) one a host remembered and is bringing back.
   */
  initialConversationId?: string;
  /**
   * The agent of a remembered `initialConversationId` that is not in memory —
   * the sheet resumes it through the canonical reopen sequence instead of
   * waiting for a live handoff.
   */
  resumeAgentId?: string;
  /**
   * Who draws the controls (history toggle, new chat). `"inline"` (default)
   * draws the sheet's own row; `"host"` draws none and takes `showHistory` /
   * `newChatSignal` from the host's chrome (a canvas tab header).
   */
  chrome?: "inline" | "host";
  /** `chrome="host"`: whether the conversation history column is open. */
  showHistory?: boolean;
  /** `chrome="host"`: each change starts a fresh conversation. */
  newChatSignal?: number;
  /** Separates two sheets mounted at once (two canvas tabs) — surface + launcher keys. */
  instanceKey?: string;
  /** Called whenever the conversation on screen changes. */
  onConversationChange?: (ref: QuickChatConversationRef) => void;
}

const SOURCE_FEATURE = "chat";
const HISTORY_SCOPE = "quick-chat";
/** Registry key for fork/retry routing — distinct from per-conversation focus keys. */
function panelSurfaceKey(instanceKey: string): string {
  return instanceKey ? `quick-chat:panel:${instanceKey}` : "quick-chat:panel";
}

function liveSurfaceKey(agentId: string, session: number, instanceKey: string): string {
  return instanceKey
    ? `quick-chat:live:${instanceKey}:${agentId}:${session}`
    : `quick-chat:live:${agentId}:${session}`;
}

function loadedSurfaceKey(conversationId: string): string {
  return `quick-chat:loaded:${conversationId}`;
}

/**
 * QuickChatSheet — pop-over chat that mirrors the live `/chat` route.
 *
 * Like `/chat`, it is agent-first: a compact agent picker switches the active
 * agent (starting a fresh conversation with it), the transcript + input are the
 * route's own `AgentConversationColumn` (centered), and an optional history
 * sidebar lets you jump to any past conversation.
 *
 * Two conversation modes share one column:
 *  - **live** — `useAgentLauncher(agentId)` owns a fresh conversation. Switching
 *    agent or hitting "New chat" bumps `session`, minting a new surface key so
 *    the launcher starts a brand-new conversation.
 *  - **loaded** — a history row was clicked; we hydrate that conversation and
 *    render it. "New chat" returns to live mode.
 *
 * **Include page context** (off by default — Quick Chat is a context-free chat
 * you can open over anything). On, the conversation in the panel is stamped
 * with the surface the person is looking at, which is the ONE mechanism the
 * header Agents menu uses too: `smartExecute` → `refreshSurfaceScope` re-reads
 * that surface's live values through the agent↔surface binding layers on every
 * send. Off, the stamp and the surface-owned values are cleared, so the toggle
 * never says "off" while page values still ride along. The conversation is
 * still LAUNCHED with `surfaceName: null` either way — the stamp is applied
 * after, so flipping the toggle never mints a new conversation.
 *
 * Rendered as bare content — surrounding chrome (the canvas tab header, which
 * also carries the history / new-chat controls with `chrome="host"`, or the
 * Utilities Hub tab) is supplied by the consumer.
 *
 * The starting agent is the `chat.default_new_chat` MANDATE (same as `/chat/new`):
 * the wrapper resolves it (system default → the user's own binding) before the
 * body mounts. Loud on failure — a skeleton while resolving, an error panel if
 * the mandate can't resolve; never a hardcoded fallback agent.
 */
export function QuickChatSheet(props: QuickChatSheetProps) {
  const { className, initialConversationId, resumeAgentId } = props;
  const handedOffAgentId = useAppSelector((state) =>
    initialConversationId
      ? state.conversations.byConversationId[initialConversationId]?.agentId
      : undefined,
  );
  const { mandate, loading, error, organizationPending } = useMandate(DEFAULT_NEW_CHAT_MANDATE_KEY);
  // A remembered conversation is resumed by the body; only a live handoff
  // waits here for its conversation shell.
  const waitingForHandoff = Boolean(initialConversationId && !handedOffAgentId && !resumeAgentId);
  if (loading || waitingForHandoff) {
    return (
      <div className={cn("flex h-full flex-col overflow-hidden", className)}>
        <ChatRoomSkeleton />
      </div>
    );
  }
  if (organizationPending) {
    return (
      <div className={cn("flex h-full flex-col overflow-hidden", className)}>
        <WorkspaceGate blocked sentence="Chat needs a workspace to open.">
          <ChatRoomSkeleton />
        </WorkspaceGate>
      </div>
    );
  }
  if (error || !mandate) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-2 px-6 text-center",
          className,
        )}
      >
        <p className="text-sm font-medium text-foreground">
          Chat is unavailable right now.
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          The default chat agent could not be resolved
          {asClause(error ? ` — ${error}` : "")}. Check your override on the Mandates
          page, or try again shortly.
          <ErrorAlchemyMenu />
        </p>
      </div>
    );
  }
  return (
    <QuickChatSheetBody
      {...props}
      initialAgentId={handedOffAgentId || resumeAgentId || mandate.agentId}
      needsResume={Boolean(initialConversationId && !handedOffAgentId)}
    />
  );
}

function QuickChatSheetBody({
  className,
  initialAgentId,
  initialConversationId,
  needsResume,
  chrome = "inline",
  showHistory: hostShowHistory = false,
  newChatSignal = 0,
  instanceKey = "",
  onConversationChange,
}: QuickChatSheetProps & { initialAgentId: string; needsResume: boolean }) {
  const dispatch = useAppDispatch();
  const panelSurface = panelSurfaceKey(instanceKey);

  // The wrapper waits for a handed conversation's shell and passes its agent;
  // the generic Quick Chat mandate is only the default for a genuinely fresh
  // panel. This state then belongs to explicit picker changes.
  const [agentId, setAgentId] = useState<string>(initialAgentId);
  // Set when the composer's agent pill picked a JOB (Custom = the default-chat
  // mandate): the fresh conversation launches THROUGH it, so the person's own
  // default chat model applies. A plain agent pick clears it.
  const [launchMandateKey, setLaunchMandateKey] = useState<AnyMandateKey | undefined>(undefined);
  // The compact composer (composer/FEATURE.md): tab-wide mode, input capped
  // to the knob's share of this panel.
  const { mode: composerMode } = useComposerMode();
  const { measureRef, maxInputHeightPx } = useCompactInputMaxHeight();
  const [session, setSession] = useState(0);
  const [loadedConversationId, setLoadedConversationId] = useState<
    string | null
  >(initialConversationId ?? null);
  const [inlineShowHistory, setShowHistory] = useState(false);
  const showHistory = chrome === "host" ? hostShowHistory : inlineShowHistory;
  // A remembered conversation is being brought back (reload of a canvas tab).
  const [resuming, setResuming] = useState(needsResume);
  // The host's "New chat": a changed signal starts a fresh conversation —
  // adjusted during render (the sanctioned "previous prop" pattern).
  const [seenNewChatSignal, setSeenNewChatSignal] = useState(newChatSignal);
  if (newChatSignal !== seenNewChatSignal) {
    setSeenNewChatSignal(newChatSignal);
    setLoadedConversationId(null);
    setResuming(false);
    setSession((s) => s + 1);
  }

  const loadAbortRef = useRef<AbortController | null>(null);
  const activeSurfaceKeyRef = useRef<string | null>(null);

  // Bring a remembered conversation back through the canonical reopen
  // sequence (hydrate + pending tool prompts + server-operation reconnect).
  const resumeStartedRef = useRef(false);
  useEffect(() => {
    if (!needsResume || !initialConversationId || resumeStartedRef.current) return;
    resumeStartedRef.current = true;
    dispatch(
      resumeConversation({
        conversationId: initialConversationId,
        agentId: initialAgentId,
        surfaceKey: loadedSurfaceKey(initialConversationId),
        sourceFeature: SOURCE_FEATURE,
      }),
    )
      .unwrap()
      .catch((error: unknown) => {
        console.error("[QuickChatSheet] could not bring the conversation back:", error);
        // Gone or unreadable: start fresh rather than show a dead column.
        setLoadedConversationId(null);
      })
      .finally(() => setResuming(false));
  }, [dispatch, needsResume, initialConversationId, initialAgentId]);

  // Register as a widget surface so fork/retry/navigation intents stay scoped
  // to Quick Chat and never bleed into the `/chat` page surface.
  useEffect(() => {
    dispatch(
      registerSurface({
        surfaceKey: panelSurface,
        kind: "widget",
      }),
    );
    return () => {
      dispatch(unregisterSurface(panelSurface));
      const key = activeSurfaceKeyRef.current;
      if (key) dispatch(clearFocus(key));
    };
  }, [dispatch, panelSurface]);

  // Live launcher — gated off while viewing a loaded (history) conversation.
  // The surface key carries `session` so "New chat" / agent-switch always mints
  // a fresh conversation rather than reviving the previous one.
  const currentLiveSurfaceKey = liveSurfaceKey(agentId, session, instanceKey);
  const { conversationId: liveConversationId } = useAgentLauncher(agentId, {
    surfaceKey: currentLiveSurfaceKey,
    sourceFeature: SOURCE_FEATURE,
    ...(launchMandateKey ? { mandateKey: launchMandateKey } : {}),
    // Quick Chat mirrors /chat: it is its own primary conversation and can be
    // opened over any page, so inheriting the page below would be accidental.
    runtime: { surfaceName: null },
    ready: !loadedConversationId,
    config: { responseDensity: "compact" },
  });

  const isLoaded = !!loadedConversationId;
  const conversationId = loadedConversationId ?? liveConversationId ?? null;
  const surfaceKey = isLoaded
    ? loadedSurfaceKey(loadedConversationId)
    : currentLiveSurfaceKey;

  // The page underneath is shared automatically — every composer's context
  // rail runs the one page-follow rule (useConversationFollowsPage); the
  // person turns it off per chat from the composer's context chip.

  // Tell the host which conversation is on screen (a canvas tab keeps it, so
  // a reload brings the same conversation back) — once it has a message: a
  // fresh conversation exists only in memory until the first send, and a
  // remembered id of one would reopen as a failed read.
  const hasMessages = useAppSelector(selectHasMessages(conversationId ?? ""));
  useEffect(() => {
    if (conversationId && hasMessages && !resuming) onConversationChange?.({ conversationId, agentId });
  }, [conversationId, agentId, hasMessages, resuming, onConversationChange]);

  // Track the active surface key for the unmount clearFocus — written in an
  // effect (never during render) so the ref always holds the last committed key.
  useEffect(() => {
    activeSurfaceKeyRef.current = surfaceKey;
  }, [surfaceKey]);

  // Drop the cursor straight into the message box once the conversation is
  // ready — the user came here to type, not to click. The input renders a beat
  // after the conversation id resolves (the column shows a skeleton first), so
  // poll briefly for the textarea instead of focusing once and missing it.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!conversationId) return undefined;
    let tries = 0;
    const id = window.setInterval(() => {
      const ta =
        bodyRef.current?.querySelector<HTMLTextAreaElement>("textarea");
      if (ta) {
        ta.focus();
        window.clearInterval(id);
      } else if (++tries > 25) {
        window.clearInterval(id);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [conversationId]);

  const handleNewChat = useCallback(() => {
    loadAbortRef.current?.abort();
    setLoadedConversationId(null);
    setSession((s) => s + 1);
  }, []);

  // The ONE agent switch — the header picker and the composer's agent pill
  // both land here: a fresh conversation with that agent (through the job
  // when the pill picked one).
  const handleSelectAgent = useCallback(
    (id: string, via?: { mandateKey: AnyMandateKey }) => {
      if (id === agentId && !loadedConversationId && via?.mandateKey === launchMandateKey) return;
      loadAbortRef.current?.abort();
      setLoadedConversationId(null);
      setAgentId(id);
      setLaunchMandateKey(via?.mandateKey);
      setSession((s) => s + 1);
    },
    [agentId, loadedConversationId, launchMandateKey],
  );

  const handleOpenConversation = useCallback(
    async (conv: ConversationListItem) => {
      const targetSurfaceKey = loadedSurfaceKey(conv.conversationId);

      loadAbortRef.current?.abort();
      const ctrl = new AbortController();
      loadAbortRef.current = ctrl;

      try {
        if (!conv.agentId) {
          console.error(
            "[QuickChatSheet] conversation has no agent — cannot reopen",
            conv.conversationId,
          );
          return;
        }
        setAgentId(conv.agentId);
        // The canonical reopen sequence (hydrate + pending tool prompts +
        // server-operation reconnect). The surface stamp is left to the
        // page-context effect below, which owns it for this panel.
        await dispatch(
          resumeConversation({
            conversationId: conv.conversationId,
            agentId: conv.agentId,
            surfaceKey: targetSurfaceKey,
            sourceFeature: SOURCE_FEATURE,
            signal: ctrl.signal,
          }),
        ).unwrap();

        if (ctrl.signal.aborted) return;

        setLoadedConversationId(conv.conversationId);
        // Keep the history sidebar open — closing it felt like a full panel reset.
      } catch (error) {
        if (ctrl.signal.aborted) return;
        console.error("[QuickChatSheet] Failed to open conversation:", error);
      }
    },
    [dispatch],
  );

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {/* Agent-first control row — history toggle + new chat. A host that
          draws its own chrome (a canvas tab header) carries these instead. */}
      {chrome === "inline" ? (
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showHistory ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setShowHistory((v) => !v)}
                aria-label="Toggle conversation history"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Conversations</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* The agent is chosen from the composer's agent pill — one switcher. */}
        <div className="min-w-0 flex-1" />


        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={handleNewChat}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                New chat
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start a fresh conversation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      ) : null}

      {/* Body: optional history sidebar + centered conversation column. */}
      {/* A container: in a narrow host (a 360px canvas pane) the history takes
          the whole width instead of squeezing the conversation to a sliver. */}
      <div ref={bodyRef} className="@container flex min-h-0 flex-1">
        {showHistory && (
          <div className="w-64 shrink-0 border-r border-border @max-[520px]:w-full @max-[520px]:border-r-0">
            <ChatHistorySidebar
              scopeId={HISTORY_SCOPE}
              surfaceId="chat"
              activeConversationId={conversationId}
              onOpenConversation={handleOpenConversation}
              openInPlace
              excludeSourceFeatures={["voice-agent"]}
            />
          </div>
        )}

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            showHistory && "@max-[520px]:hidden",
          )}
        >
          {conversationId && !resuming ? (
            <div ref={measureRef} className="flex min-h-0 flex-1 overflow-hidden justify-center">
              <AgentConversationColumn
                conversationId={conversationId}
                surfaceKey={surfaceKey}
                constrainWidth
                edgeToEdgeScroll
                smartInputProps={{
                  composer: {
                    size: "compact",
                    mode: composerMode,
                    agent: { onSelectAgent: handleSelectAgent },
                    maxInputHeightPx,
                  },
                }}
              />
            </div>
          ) : (
            <ChatRoomSkeleton />
          )}
        </div>
      </div>
    </div>
  );
}
