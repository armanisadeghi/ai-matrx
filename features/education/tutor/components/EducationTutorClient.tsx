"use client";

// features/education/tutor/components/EducationTutorClient.tsx
//
// The AI Tutor conversation surface (P2). One live conversation with the
// Education AI Tutor, built on the SAME agent-execution + conversation infra as
// /chat (features/agents/) — not a bespoke chat. It reuses:
//   • useAgentLauncher            — create/track the conversation
//   • useConversationRoutePromotion — /education/tutor/[id] URL promotion
//   • AgentConversationColumn     — the presentational transcript + composer
// and adds the ONE thing that makes it a tutor: grounding injection. On a fresh
// conversation we assemble the learner's cross-session memory + their own study
// material (assembleTutorGrounding) and feed them into the tutor agent's
// declared CONTEXT SLOTS (not user-facing variables — the composer stays clean)
// so it opens already knowing the learner and can cite their material.
//
// Two mount paths mirror ChatRoomClient: fresh (no conversationId → launcher
// mints one, injects grounding, promotes the URL after first submit) and
// existing (conversationId prop → load the transcript, launcher gated off).

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAuthReady } from "@/lib/redux/selectors/userSelectors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useConversationRoutePromotion } from "@/features/agents/hooks/useConversationRoutePromotion";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { surfaceColdPendingCalls } from "@/features/agents/redux/execution-system/thunks/surface-cold-pending-calls.thunk";
import { setFocus, clearFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ChatRoomSkeleton } from "@/features/agents/components/chat/ChatRoomSkeleton";
import { DEFAULT_TUTOR_AGENT_ID } from "../agents";
import { assembleTutorGrounding, type TutorGroundingSeed } from "../grounding";
import { TutorLanding } from "./TutorLanding";

const SOURCE_FEATURE = "education-tutor" as const;
const BASE_PATH = "/education/tutor/[conversationId]";

export interface EducationTutorClientProps {
  /** Set only when opening an EXISTING conversation (/education/tutor/[id]). */
  conversationId?: string;
  /** Optional item to ground a fresh conversation in (AskTutor entry). */
  seed?: TutorGroundingSeed;
  /** Build the deep-link URL for a conversation id (default /education/tutor/<id>). */
  buildHref?: (id: string) => string;
  /** Hide the empty-state landing (e.g. when embedded in a side panel). */
  hideLanding?: boolean;
  /**
   * Embedded mode (AskTutor side panel): use a distinct surface scope and skip
   * URL promotion entirely, so mounting the tutor inside a study page never
   * changes that page's route. Conversations still persist under the
   * education-tutor source_feature, so they show up in /education/tutor later.
   */
  embedded?: boolean;
}

const defaultHref = (id: string) => `/education/tutor/${id}`;

export function EducationTutorClient({
  conversationId: conversationIdProp,
  seed,
  buildHref = defaultHref,
  hideLanding,
  embedded = false,
}: EducationTutorClientProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const agentId = DEFAULT_TUTOR_AGENT_ID;
  // Embedded (panel) mounts get their own focus scope so they never collide
  // with the standalone /education/tutor route's live conversation.
  const surfaceKey = embedded
    ? `${SOURCE_FEATURE}-embed:${agentId}`
    : `${SOURCE_FEATURE}:${agentId}`;
  const authReady = useAppSelector(selectAuthReady);
  const isFreshRoute = !conversationIdProp;

  // ── Agent execution minimal fetch ────────────────────────────────────────
  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );
  const [isInitializing, setIsInitializing] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsInitializing(true);
      try {
        if (!executionPayload.isReady) {
          await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
        }
      } catch (err) {
        console.error("[EducationTutorClient] fetchAgentExecutionMinimal failed", err);
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch, executionPayload.isReady]);

  // ── Fresh-start guard (drop stale per-agent focus on a fresh route) ──────
  useEffect(() => {
    if (conversationIdProp) return;
    dispatch(clearFocus(surfaceKey));
  }, [conversationIdProp, surfaceKey, dispatch]);

  // ── Launcher (fresh route only) ──────────────────────────────────────────
  const { conversationId: liveConversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    ready: !isInitializing && isFreshRoute,
    config: { responseDensity: "compact" },
    preferFresh: isFreshRoute,
    // Keep the streaming instance alive across the post-submit router.replace.
    retainOnUnmount: true,
  });

  // ── Grounding injection (fresh route) ────────────────────────────────────
  // Assemble the learner's memory + study material and feed them into the
  // tutor's declared CONTEXT SLOTS (learner_memory / study_material /
  // teaching_mode / personality_style) — NOT user-facing variables, so nothing
  // shows in the chat composer. `setContextEntries` auto-inits the per-
  // conversation slot (no create-race), and `request.context` is re-sent on
  // EVERY turn (including continuations), so grounding stays live for the whole
  // conversation. The agent inlines each slot up to its `max_inline_chars`.
  const groundedRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationIdProp || !liveConversationId || !authReady) return;
    if (groundedRef.current === liveConversationId) return;
    groundedRef.current = liveConversationId;
    const target = liveConversationId;
    let cancelled = false;
    (async () => {
      try {
        const grounding = await assembleTutorGrounding({ seed });
        if (cancelled) return;
        dispatch(
          setContextEntries({
            conversationId: target,
            entries: [
              { key: "learner_memory", value: grounding.learner_memory, type: "text", label: "Learner memory" },
              { key: "study_material", value: grounding.study_material, type: "text", label: "Study material" },
              { key: "teaching_mode", value: grounding.teaching_mode, type: "text", label: "Teaching mode" },
              { key: "personality_style", value: grounding.personality_style, type: "text", label: "Personality style" },
            ],
          }),
        );
      } catch (err) {
        console.error("[EducationTutorClient] grounding failed", err);
        groundedRef.current = null; // let a later render retry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationIdProp, liveConversationId, authReady, dispatch, seed]);

  // ── Existing-conversation load (only on /education/tutor/[id]) ────────────
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationIdProp || isInitializing || !authReady) return undefined;
    if (loadedKeyRef.current === conversationIdProp) return undefined;
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    loadedKeyRef.current = conversationIdProp;
    (async () => {
      try {
        const state = store.getState();
        const exists = !!state.conversations?.byConversationId?.[conversationIdProp];
        const alreadyLiveCount =
          state.messages?.byConversationId?.[conversationIdProp]?.orderedIds?.length ?? 0;
        if (exists && alreadyLiveCount > 0) {
          if (ctrl.signal.aborted) return;
          dispatch(setFocus({ surfaceKey, conversationId: conversationIdProp }));
          return;
        }
        if (ctrl.signal.aborted) return;
        if (!exists) {
          await dispatch(
            createManualInstance({
              agentId,
              conversationId: conversationIdProp,
              apiEndpointMode: "agent",
              responseDensity: "compact",
            }),
          ).unwrap();
        }
        if (ctrl.signal.aborted) return;
        await dispatch(
          loadConversation({
            conversationId: conversationIdProp,
            surfaceKey,
            signal: ctrl.signal,
          }),
        ).unwrap();
        if (ctrl.signal.aborted) return;
        void dispatch(surfaceColdPendingCalls(conversationIdProp));
      } catch (err) {
        if (loadedKeyRef.current === conversationIdProp) loadedKeyRef.current = null;
        console.error("[EducationTutorClient] loadConversation failed", err);
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [agentId, conversationIdProp, dispatch, isInitializing, authReady, store, surfaceKey]);

  // ── URL promotion + surface registration (shared primitive) ──────────────
  useConversationRoutePromotion({
    surfaceKey,
    agentId,
    conversationIdProp,
    liveConversationId,
    basePath: BASE_PATH,
    buildHref,
    enabled: !embedded,
  });

  const conversationId = conversationIdProp ?? liveConversationId ?? null;
  // Show the tutor empty-state (hero + starters) ONLY on a fresh, still-empty
  // conversation. We render it via `afterMessages` (inside the scroll area),
  // NOT `landingContent` — `landingContent` makes AgentConversationColumn
  // SUPPRESS the whole bottom input block (the landing is expected to carry its
  // own composer, like /chat/new's NewChatGreeting does). TutorLanding has no
  // composer, so using the landing slot would leave the fresh route with no way
  // to type. `afterMessages` keeps the real SmartAgentInput mounted.
  const messageCount = useAppSelector(selectMessageCount(conversationId ?? ""));

  if (isInitializing || !conversationId) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <ChatRoomSkeleton />
      </div>
    );
  }

  const showEmptyState = !hideLanding && isFreshRoute && messageCount === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          constrainWidth
          edgeToEdgeScroll
          smartInputProps={{
            sendButtonVariant: "blue",
            showSubmitOnEnterToggle: false,
            placeholder: "Ask your tutor anything about what you're studying…",
          }}
          afterMessages={
            showEmptyState ? (
              <TutorLanding conversationId={conversationId} />
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
