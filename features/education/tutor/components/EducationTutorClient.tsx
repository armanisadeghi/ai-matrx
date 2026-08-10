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

import { useEffect, useMemo, useRef, useState } from "react";
import { createSelector } from "@reduxjs/toolkit";
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
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  selectConversationMessages,
  selectMessageCount,
  selectLatestAssistantMessageId,
  selectMessageContent,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ChatRoomSkeleton } from "@/features/agents/components/chat/ChatRoomSkeleton";
import { useEntitlement, useEntitlementConsume } from "@/features/entitlements/hooks";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { Eye } from "lucide-react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationTutorScope } from "@/features/surfaces/manifests/education-tutor.manifest";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { DEFAULT_TUTOR_AGENT_ID } from "../agents";
import {
  TUTOR_TEACHING_MODES,
  TUTOR_PERSONALITY_STYLES,
  isTutorTeachingMode,
  isTutorPersonalityStyle,
  type TutorTeachingMode,
  type TutorPersonalityStyle,
} from "../settings";
import {
  assembleTutorGrounding,
  type TutorGroundingSeed,
  type TutorLaunchGrounding,
} from "../grounding";
import type { TrustEnvelope } from "@/features/education/trust/types";
import { extractTurnTrust } from "../turnTrust";
import { TutorLanding } from "./TutorLanding";
import { TutorTrustStrip } from "./TutorTrustStrip";
import { TutorTurnTrust } from "./TutorTurnTrust";

const SOURCE_FEATURE = "education-tutor" as const;
const BASE_PATH = "/education/tutor/[conversationId]";
/** Ceiling for an agent-staged composer message (surface write target). */
const COMPOSER_DRAFT_MAX = 8000;

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

  // ── Entitlement gate (P8): tutor messages are a metered capability ────────
  // Reactive to the boot-hydrated snapshot. Permissive today (the capability
  // ships `enforced: false`), so nothing is capped until the aidream-side
  // spend re-check lands and enforcement flips — but the limit is shown BEFORE
  // the action and the composer is blocked pre-send once a cap is reached, so
  // there is never a mid-send ambush (the entitlements TRUST mandate).
  const tutorMsg = useEntitlement("education.tutor_message");
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  // The tutor's composer has no first-class onSubmit hook to intercept per-send
  // (tracked in FEATURE.md), so this gates the whole conversation: proactively
  // checked on mount/session-start (below) and the composer stays disabled for
  // as long as `coppa.blocked` is reactively true.
  const coppa = useAiComplianceGate();
  const sendBlocked = !tutorMsg.allowed || coppa.blocked;
  // The remaining-count meter is the canonical primitive (renders nothing while
  // unlimited/permissive; shows "X of Y left" once limits exist).
  const hasMeter = tutorMsg.limit != null;
  // Record real usage per sent message so the meter is honest (even while
  // enforced:false). The composer lives inside the agents smart-input (no submit
  // callback we can hook without touching features/agents), so we meter by
  // watching the count of USER-authored messages on this conversation grow. The
  // baseline is captured once per mount, so already-sent history is never
  // re-metered; only positive deltas consume — this can only ever under-count
  // (the TRUST-safe direction), never charge twice. A first-class composer
  // `onSubmit` hook would make this exact (tracked in FEATURE.md).
  const commitTutorMessage = useEntitlementConsume("education.tutor_message");

  // ── Access gate (P7): view vs edit on an EXISTING conversation ────────────
  // Tutor threads are `chat.conversation` rows (the registered `conversation`
  // shareable type). A view-only sharee gets the read-only transcript — the
  // composer is hidden and a "shared / read-only" banner shown — while the
  // owner sees the live tutor + the ShareButton. Fresh conversations skip this
  // (the creator is always the owner). Fail OPEN while resolving so the owner
  // never sees a flash of a locked composer (UI reads may fail open; RLS is the
  // real boundary).
  const access = useAccess("conversation", conversationIdProp);
  const isSharedView =
    !!conversationIdProp &&
    !access.loading &&
    access.exists &&
    !canEditAccess(access.level);

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
  // The derived P0 trust envelope for the surface strip (citations + confidence
  // + refusal convention). Populated from the SAME grounding assembly used for
  // context injection on the fresh route, and re-derived for an existing
  // transcript (below) so the strip is present on every tutor view.
  const [tutorTrust, setTutorTrust] = useState<TrustEnvelope | null>(null);

  // The last successfully assembled grounding, held in a ref so the surface
  // emitter (below) can report what the tutor was ACTUALLY given at agent-
  // trigger time without re-assembling it. Only `trust` needs to drive a
  // render, so the rest deliberately stays out of state.
  const groundingRef = useRef<TutorLaunchGrounding | null>(null);

  const groundedRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationIdProp || !liveConversationId || !authReady) return;
    if (groundedRef.current === liveConversationId) return;
    groundedRef.current = liveConversationId;
    const target = liveConversationId;
    let cancelled = false;
    (async () => {
      // School-safe gate FIRST (COPPA): session start is this surface's
      // pre-generation checkpoint (no per-send hook available). A blocked
      // under-13 opens the "a parent must approve" dialog and skips grounding —
      // the disabled composer above then keeps the account out of the AI flow.
      if (!(await coppa.ensureAllowed())) return;
      try {
        const grounding = await assembleTutorGrounding({ seed });
        if (cancelled) return;
        groundingRef.current = grounding;
        setTutorTrust(grounding.trust);
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
  }, [conversationIdProp, liveConversationId, authReady, dispatch, seed, coppa.ensureAllowed]);

  // ── Trust envelope for an EXISTING transcript ─────────────────────────────
  // The fresh route sets `tutorTrust` from the injection assembly above; on a
  // resumed conversation we re-derive it from the learner's current material so
  // the trust strip is present here too. Derivation-only (no context write —
  // the launch-time injection already lives on the conversation).
  useEffect(() => {
    if (!conversationIdProp || !authReady) return;
    let cancelled = false;
    (async () => {
      try {
        const grounding = await assembleTutorGrounding({ seed });
        if (cancelled) return;
        groundingRef.current = grounding;
        setTutorTrust(grounding.trust);
      } catch (err) {
        console.error("[EducationTutorClient] trust derivation failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationIdProp, authReady, seed]);

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

  // ── Per-turn STRUCTURED trust (target state) ──────────────────────────────
  // The re-authored tutor agent emits a machine-readable TrustEnvelope for THAT
  // turn in a hidden HTML comment at the end of its markdown answer (see
  // turnTrust.ts). We read the latest assistant message's raw text and parse the
  // envelope, then render the honest per-turn surface (ConfidenceBadge +
  // SourceCitations, or RefusalNotice) flush under the answer via `afterMessages`
  // — a REAL per-claim envelope, not the grounding-derived strip. Null while a
  // turn streams (no closing `-->` yet) or on older answers that predate the
  // structured channel; the derived strip is the fallback in that case.
  const latestAssistantId = useAppSelector(
    selectLatestAssistantMessageId(conversationId ?? ""),
  );
  const latestAssistantContent = useAppSelector(
    selectMessageContent(conversationId ?? "", latestAssistantId ?? ""),
  );
  const turnTrust = useMemo(
    () => extractTurnTrust(latestAssistantContent),
    [latestAssistantContent],
  );

  // ── Metered usage per sent tutor message (P8) ─────────────────────────────
  // Count USER-authored messages on this conversation; a memoized selector so
  // the component re-renders only when that count changes, not on every stream
  // token. See `commitTutorMessage` above for why we meter by count delta.
  const selectUserMessageCount = useMemo(
    () =>
      createSelector(
        selectConversationMessages(conversationId ?? ""),
        (msgs) => msgs.reduce((n, m) => n + (m.role === "user" ? 1 : 0), 0),
      ),
    [conversationId],
  );
  const userMessageCount = useAppSelector(selectUserMessageCount);
  const meteredUserCountRef = useRef<number | null>(null);
  // Reset the baseline whenever the bound conversation changes so a swap (fresh
  // → promoted route) never re-meters the carried-over history.
  useEffect(() => {
    meteredUserCountRef.current = null;
  }, [conversationId]);
  useEffect(() => {
    if (!conversationId || !authReady || isInitializing || isSharedView) return;
    // First settled render for this conversation → capture the baseline (any
    // already-loaded messages are history, not new sends).
    if (meteredUserCountRef.current === null) {
      meteredUserCountRef.current = userMessageCount;
      return;
    }
    if (userMessageCount > meteredUserCountRef.current) {
      const delta = userMessageCount - meteredUserCountRef.current;
      meteredUserCountRef.current = userMessageCount;
      for (let i = 0; i < delta; i++) void commitTutorMessage();
    }
  }, [
    userMessageCount,
    conversationId,
    authReady,
    isInitializing,
    isSharedView,
    commitTutorMessage,
  ]);

  // ── Per-turn learner-memory refresh ───────────────────────────────────────
  // Grounding is INJECTED at launch, but `request.context` is re-sent every
  // turn — so if the learner studies mid-conversation (another tab/session),
  // stale memory would keep riding along. After each new turn we re-assemble
  // memory + material and overwrite the `learner_memory` / `study_material`
  // slots (and refresh the trust strip), so the NEXT turn sees current spine
  // data. Owner-only (a read-only sharee never sends) and gated on a changed
  // message count so a streaming render doesn't refetch on every token.
  const memoryRefreshedAtRef = useRef<number>(0);
  useEffect(() => {
    if (!conversationId || !authReady || isSharedView) return;
    if (messageCount === 0 || messageCount === memoryRefreshedAtRef.current) return;
    memoryRefreshedAtRef.current = messageCount;
    const target = conversationId;
    let cancelled = false;
    (async () => {
      try {
        const grounding = await assembleTutorGrounding({ seed });
        if (cancelled) return;
        groundingRef.current = grounding;
        setTutorTrust(grounding.trust);
        dispatch(
          setContextEntries({
            conversationId: target,
            entries: [
              { key: "learner_memory", value: grounding.learner_memory, type: "text", label: "Learner memory" },
              { key: "study_material", value: grounding.study_material, type: "text", label: "Study material" },
            ],
          }),
        );
      } catch (err) {
        console.error("[EducationTutorClient] memory refresh failed", err);
        memoryRefreshedAtRef.current = 0; // allow a later retry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, messageCount, authReady, isSharedView, seed, dispatch]);

  // ── The learner's two durable tutor knobs ─────────────────────────────────
  // The SAME setting path `TutorSettingsPanel` writes through, so an agent
  // changing the style goes down the learner's own write path (durable +
  // synced across devices), not a parallel one. Only the setters are used here
  // — the surface reports what the tutor was ACTUALLY given via `groundingRef`.
  const [, setTeachingModePref] = useSetting<TutorTeachingMode>(
    "userPreferences.tutor.teachingMode",
  );
  const [, setPersonalityStylePref] = useSetting<TutorPersonalityStyle>(
    "userPreferences.tutor.personalityStyle",
  );

  if (isInitializing || !conversationId) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <ChatRoomSkeleton />
      </div>
    );
  }

  const showEmptyState = !hideLanding && isFreshRoute && messageCount === 0;

  // ── Write half of the tutor surface (manifest `writeTargets`) ─────────────
  // Three targets, and the manifest's writeTargets docblock records why only
  // three: everything else this surface emits is session telemetry, derived
  // grounding, a trust envelope, or a gate — not editable state.
  //
  // POSTURE: a READ-ONLY SHARED VIEW registers NO handlers at all, so
  // `listAgentWritableTargets()` offers an agent nothing on someone else's
  // conversation. The owner's standalone route and the embedded Ask-Tutor
  // panel both get the full set — same learner, same live conversation.
  //
  // Every handler validates and THROWS on a bad shape; the writeback seam
  // turns a throw into a safe error envelope the agent reads. Nothing is
  // silently coerced. Fresh closures per call (getWriteHandlers contract).
  const getSurfaceWriteHandlers = (): SurfaceWriteHandlers => {
    if (isSharedView) return {};

    // Mirror a style change into the RUNNING conversation's tutor context —
    // the same `setContextEntries` dispatch used at launch and on every memory
    // refresh, so the next turn already teaches this way instead of the change
    // only landing on the learner's NEXT session. The per-turn refresh
    // overwrites learner_memory/study_material only, so this survives. Keeping
    // `groundingRef` in step means the surface's read twin reports what the
    // tutor actually has, not what it was launched with.
    const applyStyleToLiveSession = (
      key: "teaching_mode" | "personality_style",
      label: string,
      value: string,
    ) => {
      dispatch(
        setContextEntries({
          conversationId,
          entries: [{ key, value, type: "text", label }],
        }),
      );
      const current = groundingRef.current;
      if (current) groundingRef.current = { ...current, [key]: value };
    };

    return {
      teaching_mode: (value: unknown) => {
        if (!isTutorTeachingMode(value))
          throw new Error(
            `teaching_mode expects exactly one of: ${TUTOR_TEACHING_MODES.join(", ")} (case-sensitive).`,
          );
        setTeachingModePref(value);
        applyStyleToLiveSession("teaching_mode", "Teaching mode", value);
      },

      personality_style: (value: unknown) => {
        if (!isTutorPersonalityStyle(value))
          throw new Error(
            `personality_style expects exactly one of: ${TUTOR_PERSONALITY_STYLES.join(", ")} (case-sensitive).`,
          );
        setPersonalityStylePref(value);
        applyStyleToLiveSession("personality_style", "Personality style", value);
      },

      tutor_message_draft: (value: unknown) => {
        // Never stage a message the learner cannot send. The COPPA gate in
        // particular is not something to route around — refuse and say why.
        if (sendBlocked)
          throw new Error(
            coppa.blocked
              ? "tutor_message_draft refused — this account is under 13 with no active guardian link, so AI use is blocked until a parent approves. Do not work around this gate."
              : "tutor_message_draft refused — this learner has reached their tutor-message limit, so a staged message could not be sent.",
          );
        if (typeof value !== "object" || value === null || Array.isArray(value))
          throw new Error(
            'tutor_message_draft expects an object: { "text": string, "mode"?: "replace" | "append" }.',
          );
        const { text, mode: writeMode } = value as {
          text?: unknown;
          mode?: unknown;
        };
        if (typeof text !== "string" || !text.trim())
          throw new Error(
            "tutor_message_draft expects a non-empty `text` string — the message to put in the composer.",
          );
        if (text.length > COMPOSER_DRAFT_MAX)
          throw new Error(
            `tutor_message_draft \`text\` is ${text.length} characters; the maximum is ${COMPOSER_DRAFT_MAX}.`,
          );
        if (
          writeMode !== undefined &&
          writeMode !== "replace" &&
          writeMode !== "append"
        )
          throw new Error(
            `tutor_message_draft \`mode\` must be "replace" or "append" when present, got ${JSON.stringify(writeMode)}.`,
          );
        const current = selectUserInputText(conversationId)(store.getState());
        const next =
          writeMode === "append" && current.trim()
            ? `${current.trimEnd()}\n${text}`
            : text;
        // The SAME action the learner's own keystrokes dispatch (see
        // AgentTextarea) — never a parallel write path into the composer.
        dispatch(setUserInputText({ conversationId, text: next }));
      },
    };
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/education-tutor"
      // Mounted only past the `!conversationId` early return above, so
      // `conversation_id` is a genuine guarantee (alwaysAvailable: true).
      // Scope is assembled at TRIGGER time from live refs — the grounding ref
      // is whatever the tutor was last actually given, never a re-assembly.
      getWriteHandlers={getSurfaceWriteHandlers}
      getScope={() => {
        const grounding = groundingRef.current;
        // Read the composer imperatively at TRIGGER time: subscribing to the
        // draft would re-render this whole client on every keystroke.
        const composerDraft = isSharedView
          ? ""
          : selectUserInputText(conversationId)(store.getState());
        return createEducationTutorScope({
          conversation_id: conversationId,
          tutor_agent_id: agentId,
          message_count: messageCount,
          is_fresh_session: isFreshRoute,
          is_shared_view: isSharedView,
          is_embedded: embedded,
          grounding_available: grounding !== null,
          send_blocked: sendBlocked,
          compliance_blocked: coppa.blocked,
          ...(composerDraft.trim() ? { composer_draft: composerDraft } : {}),
          ...(seed ? { grounding_seed: { ...seed } } : {}),
          ...(grounding
            ? {
                learner_memory: grounding.learner_memory,
                study_material: grounding.study_material,
                teaching_mode: grounding.teaching_mode,
                personality_style: grounding.personality_style,
              }
            : {}),
          ...(tutorTrust
            ? {
                trust_confidence: tutorTrust.confidence,
                trust_citation_count: tutorTrust.citations.length,
                trust_envelope: { ...tutorTrust },
              }
            : {}),
          ...(turnTrust ? { turn_trust: { ...turnTrust } } : {}),
          ...(tutorMsg.limit != null ? { tutor_message_limit: tutorMsg.limit } : {}),
        });
      }}
    >
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      {/* Owner share affordance / shared-view read-only banner (P7). Only on an
          existing conversation, and never when embedded in an AskTutor panel. */}
      {!embedded && conversationIdProp && (access.isOwner || isSharedView) && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-card/40 px-4 py-1.5">
          {isSharedView ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              Shared conversation — read-only
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Your tutor conversation</span>
          )}
          {access.isOwner && (
            <ShareButton
              resourceType="conversation"
              resourceId={conversationIdProp}
              resourceName="Tutor conversation"
              isOwner
              size="sm"
            />
          )}
        </div>
      )}
      {/* P0 trust surface. Preferred: the PER-TURN structured envelope for the
          latest answer renders under it (below, via `afterMessages`). The
          grounding-DERIVED strip is the FALLBACK — shown only when the current
          turn carries no structured envelope (fresh/empty, mid-stream, or an
          older answer that predates the structured channel). */}
      {!turnTrust && <TutorTrustStrip trust={tutorTrust} />}
      <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          constrainWidth
          edgeToEdgeScroll
          hideInput={isSharedView}
          smartInputProps={{
            sendButtonVariant: "blue",
            showSubmitOnEnterToggle: false,
            placeholder: coppa.blocked
              ? "A parent needs to approve AI use for this account first."
              : sendBlocked
                ? tutorMsg.definition.upgradeMessage
                : "Ask your tutor anything about what you're studying…",
            disableSend: sendBlocked,
            extraRightControls: hasMeter ? (
              <EntitlementMeter
                capability="education.tutor_message"
                className="whitespace-nowrap"
              />
            ) : undefined,
          }}
          afterMessages={
            showEmptyState ? (
              <TutorLanding conversationId={conversationId} />
            ) : turnTrust ? (
              <TutorTurnTrust trust={turnTrust} />
            ) : undefined
          }
        />
      </div>
      <coppa.Gate />
    </div>
    </SurfaceRuntimeProvider>
  );
}
