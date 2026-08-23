"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAuthReady } from "@/lib/redux/selectors/userSelectors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useConversationResume } from "@/features/agents/hooks/useConversationResume";
import { useCreatorOwnershipSync } from "@/features/agents/hooks/useCreatorOwnershipSync";
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  setFocus,
  clearFocus,
} from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { consumeChatDraftTransfer } from "./chat-draft-transfer";
import { chatRouteSurfaceKey } from "./begin-fresh-chat";
import { selectChatIncognitoActive } from "./chat-incognito.slice";
import { selectChatFreshSessionNonce } from "./chat-route.slice";
import { patchConversation } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { linkConversationDocumentThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { useOpenWorkingDocumentPanel } from "@/features/overlays/openers/workingDocumentPanel";
import {
  registerSurface,
  unregisterSurface,
  selectPendingNavigation,
  clearPendingNavigation,
} from "@/features/agents/redux/surfaces/surfaces.slice";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ChatRoomSkeleton } from "./ChatRoomSkeleton";
import {
  buildChatContextData,
  CHAT_CONTEXT_MENU_PROPS,
} from "./agent-context/buildChatContextData";
import { buildChatRunConfiguration } from "./agent-context/buildChatRunConfiguration";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  CHAT_CONVERSATION_TITLE_MAX,
  CHAT_DRAFT_WRITE_MODES,
  CHAT_INPUT_DRAFT_MAX,
  isChatDraftWriteMode,
} from "@/features/surfaces/manifests/chat.manifest";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import {
  selectUserInputEntryExists,
  selectUserInputText,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  extractFlatText,
  selectConversationMessages,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectIsStreaming } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { selectCurrentSettings } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  selectActiveScratchpadId,
  selectAttachedScratchpadIds,
  selectWorkingDocEntry,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";

interface ChatRoomClientProps {
  agentId: string;
  /** When provided, loads this existing conversation. Mounted by
   *  `/chat/[conversationId]`. When absent (mounted by `/chat/a/[agentId]`),
   *  the launcher creates a fresh instance. */
  conversationId?: string;
  /**
   * Optional empty-state surface — rendered in place of the message list
   * while the conversation has zero messages. Forwarded to
   * `AgentConversationColumn`. Used by `/chat/new` to show the greeting +
   * quick-action chips before the user submits their first message.
   */
  landingContent?:
    | React.ReactNode
    | ((conversationId: string) => React.ReactNode);
  /**
   * Optional control pinned directly ABOVE the composer, receiving this
   * room's own conversation id. The voice route mounts its panel here so the
   * voice layer binds to the SAME conversation the room already owns — a
   * second launcher for the same agent would mean two conversations, and the
   * user would watch one answer render in two places.
   */
  aboveInput?:
    | React.ReactNode
    | ((conversationId: string) => React.ReactNode);
  /**
   * Where this room promotes its URL once the conversation persists, and
   * where fork/retry/delete navigate. Defaults to `/chat/<id>`.
   *
   * A sibling chat MODE (the voice route) passes its own builder so the
   * promotion keeps the user in the mode they chose. Without it, sending the
   * first message would replace the URL with the text route, unmount the
   * mode's surface, and — for voice — silently end the session the user is
   * mid-sentence in.
   */
  buildConversationHref?: (conversationId: string) => string;
}

const defaultConversationHref = (conversationId: string) =>
  `/chat/${conversationId}`;

const SOURCE_FEATURE = "chat";
const CHAT_INITIAL_MESSAGE_LIMIT = 12;

/**
 * Chat room client — orchestrates one conversation surface.
 *
 * Two mount paths, each with a single source of truth:
 *
 * - `/chat/a/[agentId]` mounts with NO `conversationId` prop. The launcher
 *   creates a fresh instance and owns the active id. After the first user
 *   submit, the streaming thunk's `record_reserved` event yields the canonical
 *   server UUID and a `pendingNavigation` effect calls `router.replace`.
 *
 * - `/chat/[conversationId]` mounts WITH the prop. The launcher is gated off
 *   (`ready: false`) and we load the existing conversation. The prop is the
 *   single source of truth — no parallel state.
 */
export function ChatRoomClient({
  agentId,
  conversationId: conversationIdProp,
  landingContent,
  aboveInput,
  buildConversationHref = defaultConversationHref,
}: ChatRoomClientProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();

  // ONE helper owns this string (see `chatRouteSurfaceKey`). This client is the
  // surface that REGISTERS the focus entry, so every reader — the header's
  // agent switch, `/chat/new`, `beginFreshChat` — must derive the same key.
  const surfaceKey = chatRouteSurfaceKey(agentId);
  const authReady = useAppSelector(selectAuthReady);
  const isIncognito = useAppSelector(selectChatIncognitoActive);
  const freshSessionKey = useAppSelector(selectChatFreshSessionNonce);
  const isFreshRoute = !conversationIdProp;
  useCreatorOwnershipSync(agentId);

  // Register this client as a `page` surface so action bars can route
  // fork / retry navigation outcomes correctly (URL change).
  useEffect(() => {
    dispatch(
      registerSurface({
        surfaceKey,
        kind: "page",
        basePath: "/chat/[conversationId]",
      }),
    );
    return () => {
      dispatch(unregisterSurface(surfaceKey));
    };
  }, [dispatch, surfaceKey]);

  // ── Agent execution minimal fetch ────────────────────────────────────────
  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );

  const [isInitializing, setIsInitializing] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setIsInitializing(true);
      try {
        if (!executionPayload.isReady) {
          await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
        }
      } catch (err) {
        console.error(
          "[ChatRoomClient] fetchAgentExecutionMinimal failed",
          err,
        );
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch, executionPayload.isReady]);

  // ── Fresh-start guard (agent route only) ─────────────────────────────────
  // The agent route means "start a NEW conversation with this agent." The
  // surface key is `chatRouteSurfaceKey(agentId)`, and the focus slice retains the
  // last conversation per surface across route changes (the launcher uses
  // `retainOnUnmount` so non-empty conversations stay cached). Without this,
  // returning to an agent you recently used would revive that agent's old
  // conversation. Clear the stale per-agent focus whenever we (re)enter a
  // fresh agent route so the launcher mints a brand-new conversation. This
  // effect MUST re-run on every agent/route change — ChatRoomClient is reused
  // (not remounted) across chat navigations, so a once-per-mount guard would
  // miss agent switches and `+` clicks. Skipped when loading an existing
  // conversation (/chat/[conversationId]), where the prop is the source.
  useEffect(() => {
    if (conversationIdProp) return;
    dispatch(clearFocus(surfaceKey));
  }, [conversationIdProp, surfaceKey, dispatch]);

  // ── Launcher (active only on /chat/a/[agentId]) ──────────────────────────
  // When `conversationIdProp` is set, we're loading an existing conversation
  // so the launcher stays gated off. When absent, it creates a fresh instance
  // and owns the conversationId.
  const { conversationId: liveConversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
    ready: !isInitializing && isFreshRoute,
    config: { responseDensity: "compact" },
    // `surfaceName: null` — EXPLICIT surface opt-out. This launch IS the chat
    // conversation itself; without this, the launch thunk auto-adopts the
    // `matrx-user/chat` provider registered below and hands the run its OWN
    // transcript/conversation-id back as "surface context" (a self-referential
    // loop), then stamps the surface so every later turn re-injects it via
    // refreshSurfaceScope. The provider stays mounted for its real consumers:
    // context-menu launches, the header Agents panel, and write targets.
    runtime: { surfaceName: null },
    isEphemeral: isIncognito,
    preferFresh: isFreshRoute,
    freshSessionKey: isFreshRoute ? freshSessionKey : 0,
    // The chat route promotes /chat/new → /chat/[conversationId] right after
    // the first submit, which unmounts this launcher mid-stream. Retain the
    // started conversation so the destination route re-attaches to the live
    // instance instead of re-fetching (and clobbering the stream).
    retainOnUnmount: true,
  });

  // Keep the live instance aligned with the incognito toggle so execute thunks
  // send store:false and sandbox binding stays off for the whole session.
  useEffect(() => {
    if (!liveConversationId || conversationIdProp) return;
    dispatch(
      patchConversation({
        conversationId: liveConversationId,
        isEphemeral: isIncognito,
      }),
    );
  }, [conversationIdProp, dispatch, isIncognito, liveConversationId]);


  // ── Existing-conversation load (only on /chat/[conversationId]) ──────────
  // THE canonical resume sequence lives in `useConversationResume` — the same
  // hook every other surface uses to continue a conversation (Masterwork's
  // Scout interview, …). Do not re-inline it here.
  const { isResuming: isColdLoadingConversation } = useConversationResume({
    conversationId: conversationIdProp ?? null,
    agentId,
    surfaceKey,
    enabled: !isInitializing && authReady,
    messageLimit: CHAT_INITIAL_MESSAGE_LIMIT,
  });

  // ── Pending navigation → router.replace ─────────────────────────────────
  // Fork / retry / delete actions set pendingNavigation with the target
  // conversationId; this effect promotes it into a URL change so the user
  // ends up on the right deep-linkable route.
  const pendingNavigation = useAppSelector(selectPendingNavigation(surfaceKey));
  useEffect(() => {
    if (!pendingNavigation) return;
    router.replace(buildConversationHref(pendingNavigation.conversationId));
    dispatch(clearPendingNavigation({ surfaceKey }));
  }, [pendingNavigation, router, dispatch, surfaceKey, buildConversationHref]);

  // ── Draft transfer from /chat/new chip click ────────────────────────────
  // When a chip on /chat/new is clicked, the source page stashes the user's
  // in-progress draft in sessionStorage keyed to this agent's id. We apply it
  // once the launcher has created the instance entry — `setUserInputText`
  // requires `state.instanceUserInput.byConversationId[cid]` to exist.
  // GOTCHA (fixed 2026-07-17): `liveConversationId` is a client UUID set
  // immediately, but the input ENTRY is created by `createInstanceFull` only
  // after the launcher's async agent fetch — and `setUserInputText` used to
  // silently drop writes for missing entries (since 2026-07-18 it captures
  // them instead). Consuming the stash before the entry existed lost every
  // /chat/a/[agentId] draft transfer. Keep gating on entry existence so the
  // single-use sessionStorage pop happens exactly once, post-init.
  const draftInputEntryReady = useAppSelector((state) =>
    liveConversationId
      ? selectUserInputEntryExists(liveConversationId)(state)
      : false,
  );
  const draftAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationIdProp) return; // existing conversation, not a chip target
    if (!liveConversationId || !draftInputEntryReady) return;
    if (draftAppliedRef.current === liveConversationId) return;
    const transfer = consumeChatDraftTransfer(agentId);
    if (!transfer) {
      draftAppliedRef.current = liveConversationId;
      return;
    }
    draftAppliedRef.current = liveConversationId;
    dispatch(
      setUserInputText({
        conversationId: liveConversationId,
        text: transfer.text,
      }),
    );
  }, [
    conversationIdProp,
    liveConversationId,
    draftInputEntryReady,
    agentId,
    dispatch,
  ]);

  // ── Post-submit URL promotion (only on /chat/new + /chat/a/[agentId]) ─────
  // The launcher pre-creates an instance with a client UUID, but the
  // conversation isn't persisted in chat.conversation until the server writes
  // it. `record_reserved` events only *announce* the reserved UUIDs mid-stream
  // — they are NOT a commit. The backend now persists the whole turn (conv +
  // user + assistant message) atomically at stream-end, so message-count >= 2
  // is NO LONGER a reliable "row committed" signal (it once was, when the row
  // was inserted up front). Promoting before the row is committed makes the
  // /chat/[cid] SSR guard miss and hard-redirect back to /chat/new — the
  // "can't leave /chat/new" bounce.
  //
  // Fix: gate the URL swap on `waitForConversationPersisted`, a client read
  // that mirrors the SSR seed lookup exactly. A `true` there guarantees the
  // SSR guard resolves a seed. Backend-timing-agnostic — instant when the row
  // commits early, deferred to turn-end when it commits atomically.
  const messageCount = useAppSelector((state) =>
    liveConversationId ? selectMessageCount(liveConversationId)(state) : 0,
  );
  // Boolean trigger (not raw count) so later messages in the same turn don't
  // re-fire / churn the effect. Toggles false→true once, then stays true.
  const readyToPromote =
    !conversationIdProp && !!liveConversationId && messageCount >= 2;
  const promotedRef = useRef<string | null>(null);
  const promotionWaitRef = useRef<string | null>(null);
  useEffect(() => {
    promotedRef.current = null;
    promotionWaitRef.current = null;
  }, [freshSessionKey, agentId]);
  useEffect(() => {
    if (!readyToPromote || !liveConversationId) return undefined;
    const target = liveConversationId;
    if (promotedRef.current === target) return undefined;
    if (promotionWaitRef.current === target) return undefined;
    // Stale-closure guard — THE fix for "click + and it snaps back to the old
    // chat". `/chat/[id]`, `/chat/new`, and `/chat/a/[agentId]` share the same
    // surfaceKey, so when you click `+` from an existing conversation this
    // effect can be scheduled with the INHERITED `liveConversationId` (the old
    // conversation, which already has >=2 messages) for one transitional render
    // — before the launcher swaps focus to the fresh conversation. Promoting
    // that would `router.replace` you straight back to the old chat. Only
    // promote the conversation STILL focused on this surface right now.
    const currentInputFocus =
      store.getState().conversationFocus?.bySurface[surfaceKey]?.input ?? null;
    if (currentInputFocus !== target) return undefined;

    promotionWaitRef.current = target;
    const ctrl = new AbortController();
    void (async () => {
      const persisted = await waitForConversationPersisted(target, {
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (promotionWaitRef.current === target) promotionWaitRef.current = null;
      if (!persisted) return;
      // Re-check focus: a `+` / agent switch may have moved it while we waited.
      const focusNow =
        store.getState().conversationFocus?.bySurface[surfaceKey]?.input ??
        null;
      if (focusNow !== target) return;
      promotedRef.current = target;
      router.replace(buildConversationHref(target));
    })();

    return () => {
      ctrl.abort();
      if (promotionWaitRef.current === target) promotionWaitRef.current = null;
    };
  }, [
    readyToPromote,
    liveConversationId,
    router,
    store,
    surfaceKey,
    buildConversationHref,
  ]);

  // ── Single source of truth ───────────────────────────────────────────────
  // Prop wins when present (loading existing). Otherwise launcher's id wins.
  const conversationId = conversationIdProp ?? liveConversationId ?? null;

  // The agent picker + new-chat live in the shell header (ChatRunHeader, via
  // <PageHeader> on the route page); conversation history is the shell
  // sidebar's route menu (ChatSidebarMenu). This component renders only the
  // conversation column — exactly like AgentRunnerPage.
  const canRenderLandingDuringInit =
    !!landingContent && !conversationIdProp && !!conversationId;

  if ((isInitializing || !conversationId) && !canRenderLandingDuringInit) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <ChatRoomSkeleton />
      </div>
    );
  }

  if (conversationIdProp && isColdLoadingConversation) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <ChatRoomSkeleton />
      </div>
    );
  }

  // Header Agents chrome — live Run scope from Redux at click time (draft +
  // transcript + agent). Plain fn; React Compiler memoizes. DOM selection in
  // the composer is best-effort via activeElement when it's a textarea.
  const getChatScope = () => {
    const state = store.getState();
    const draft = selectUserInputText(conversationId)(state) ?? "";
    const records = selectConversationMessages(conversationId)(state);
    const messages = records.map((r) => ({
      id: r.id,
      role: r.role,
      text: extractFlatText(r),
      created_at: r.createdAt ?? undefined,
    }));
    let lastUserMessage: string | null = null;
    let lastAssistantMessage: string | null = null;
    for (const m of messages) {
      if (m.role === "user" && m.text) lastUserMessage = m.text;
      if (m.role === "assistant" && m.text) lastAssistantMessage = m.text;
    }

    let selectionStart = 0;
    let selectionEnd = 0;
    const active = document.activeElement;
    if (
      active instanceof HTMLTextAreaElement &&
      (active.value === draft || draft.length === 0)
    ) {
      selectionStart = active.selectionStart ?? 0;
      selectionEnd = active.selectionEnd ?? 0;
    }

    // Composer attachments, resolved variables, effective model, and lean
    // context-document refs — all plain ref-reads off the store at trigger
    // time (no subscriptions; this fn only runs when a launch is assembled).
    const attachedResources = selectInstanceResources(conversationId)(state).map(
      (r) => ({
        id: r.resourceId,
        block_type: r.blockType,
        status: r.status,
      }),
    );
    const variableValues = selectResolvedVariables(conversationId)(state);
    const settings = selectCurrentSettings(conversationId)(state);
    const model = typeof settings?.model === "string" ? settings.model : null;

    const workingEntry = selectWorkingDocEntry(conversationId, "working")(state);
    const workingDocument = workingEntry
      ? {
          enabled: workingEntry.enabled,
          title: workingEntry.title ?? "",
          materialized: workingEntry.materialized ?? false,
          version: workingEntry.version ?? 0,
          char_count: workingEntry.content?.length ?? 0,
        }
      : null;

    const scratchEntry = selectWorkingDocEntry(conversationId, "scratch")(state);
    const activeScratchpadId = selectActiveScratchpadId(state);
    const attachedScratchpadIds =
      selectAttachedScratchpadIds(conversationId)(state);
    const scratchpad =
      scratchEntry || activeScratchpadId || attachedScratchpadIds.length
        ? {
            enabled: scratchEntry?.enabled ?? false,
            title: scratchEntry?.title ?? "",
            char_count: scratchEntry?.content?.length ?? 0,
            active_scratchpad_id: activeScratchpadId,
            attached_scratchpad_ids: attachedScratchpadIds,
          }
        : null;

    const contextData = buildChatContextData({
      inputDraft: draft,
      selectionStart,
      selectionEnd,
      conversationId,
      conversationTitle: selectConversationTitle(conversationId)(state),
      conversationStatus:
        state.conversations?.byConversationId?.[conversationId]?.status ?? null,
      isStreaming: selectIsStreaming(conversationId)(state),
      agentId,
      agentName: selectAgentName(state, agentId) ?? null,
      lastUserMessage,
      lastAssistantMessage,
      messages,
      attachedResources,
      variableValues,
      model,
      workingDocument,
      scratchpad,
      runConfiguration: buildChatRunConfiguration(state, conversationId),
    });

    const selectedText =
      selectionEnd > selectionStart
        ? draft.slice(selectionStart, selectionEnd)
        : "";

    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange:
        active instanceof HTMLTextAreaElement
          ? {
              type: "editable",
              element: active,
              start: selectionStart,
              end: selectionEnd,
            }
          : null,
      contextData,
    });
  };

  // ── Surface write handlers (`matrx-user/chat`) ───────────────────────────
  // The write half of this surface. Both handlers close over THIS component's
  // `conversationId` — the conversation actually on the page — so a staged
  // draft always lands in the page composer and never in the message box of
  // whatever agent run asked for it. Which fields earn a target (and the
  // longer list that deliberately does NOT) is written down beside the
  // declarations in `features/surfaces/manifests/chat.manifest.ts`.
  //
  // Plain fn, rebuilt per render; the provider holds it and calls it at write
  // time, so every handler reads live state.
  const getSurfaceWriteHandlers = (): SurfaceWriteHandlers => ({
    conversation_title: async (value: unknown) => {
      if (typeof value !== "string")
        throw new Error(
          `conversation_title expects a plain string, got ${Array.isArray(value) ? "an array" : `a ${typeof value}`}.`,
        );
      const title = value.trim();
      if (!title)
        throw new Error(
          "conversation_title expects a non-empty title — clearing a conversation's name back to Untitled is a human action.",
        );
      if (title.length > CHAT_CONVERSATION_TITLE_MAX)
        throw new Error(
          `conversation_title is ${title.length} characters; the maximum is ${CHAT_CONVERSATION_TITLE_MAX}.`,
        );
      // A fresh chat holds a CLIENT-MINTED id — the `chat.conversation` row is
      // written when the first turn commits. Renaming before that updates zero
      // rows without erroring, while every optimistic mirror happily shows the
      // new title: a rename that silently did not happen. Gate on the same
      // predicate URL promotion uses; `timeoutMs: 0` makes it a single probe
      // rather than that path's 3-minute poll.
      const persisted = await waitForConversationPersisted(conversationId, {
        timeoutMs: 0,
      });
      if (!persisted)
        throw new Error(
          "conversation_title refused — this conversation has not been saved yet, so there is no row to rename. Its row is created when the first turn completes.",
        );
      // The canonical rename thunk every conversation list dispatches (it owns
      // the optimistic mirrors and the revert) — never a raw supabase update.
      const result = await dispatch(
        renameConversation({ conversationId, title }),
      );
      if (renameConversation.rejected.match(result))
        throw new Error(
          `conversation_title failed to save — ${result.payload?.message ?? "the rename was rejected."}`,
        );
    },

    input_draft: (value: unknown) => {
      const modes = CHAT_DRAFT_WRITE_MODES.map((m) => `"${m}"`).join(" | ");
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(
          `input_draft expects an object: { "text": string, "mode"?: ${modes} }.`,
        );
      const { text, mode: writeMode } = value as {
        text?: unknown;
        mode?: unknown;
      };
      if (typeof text !== "string" || !text.trim())
        throw new Error(
          "input_draft expects a non-empty `text` string — the message to stage in the composer.",
        );
      if (text.length > CHAT_INPUT_DRAFT_MAX)
        throw new Error(
          `input_draft \`text\` is ${text.length} characters; the maximum is ${CHAT_INPUT_DRAFT_MAX}.`,
        );
      if (writeMode !== undefined && !isChatDraftWriteMode(writeMode))
        throw new Error(
          `input_draft \`mode\` must be ${modes} when present, got ${JSON.stringify(writeMode)}.`,
        );
      const current = selectUserInputText(conversationId)(store.getState()) ?? "";
      const next =
        writeMode === "append" && current.trim()
          ? `${current.trimEnd()}\n${text}`
          : text;
      // The SAME action the user's own keystrokes dispatch (AgentTextarea and
      // NewChatLandingInput both call this) — never a parallel write path, so
      // undo, draft protection and the send flow all behave identically.
      dispatch(setUserInputText({ conversationId, text: next }));
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={CHAT_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getChatScope}
      getWriteHandlers={getSurfaceWriteHandlers}
      isEditable
    >
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
          <AgentConversationColumn
            conversationId={conversationId}
            surfaceKey={surfaceKey}
            constrainWidth
            edgeToEdgeScroll
            deferColdMarkdown={!!conversationIdProp}
            smartInputProps={{
              sendButtonVariant: "blue",
              // Lives in the Chat Options (+) → Preferences tab now.
              showSubmitOnEnterToggle: false,
            }}
            landingContent={
              typeof landingContent === "function"
                ? landingContent(conversationId)
                : landingContent
            }
            aboveInput={
              typeof aboveInput === "function"
                ? aboveInput(conversationId)
                : aboveInput
            }
          />
        </div>
      </div>
      {/* ?attachDoc= deep link (fresh routes only) — the working document's
          registry share URL is /chat/new?attachDoc={id}. Own local Suspense:
          useSearchParams requires a boundary, and neither chat page provides
          one; keeping it here means query-only client navigations (the case a
          window.location read misses — this component is REUSED, not
          remounted, across chat navigations) still fire the attach. */}
      {isFreshRoute && (
        <Suspense fallback={null}>
          <AttachDocDeepLink
            conversationId={liveConversationId}
            ready={authReady}
          />
        </Suspense>
      )}
    </SurfaceRuntimeProvider>
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consumes `?attachDoc=<documentId>` on a fresh chat route: links the shared
 * document into the new conversation (adopted into Redux immediately; the
 * conversation edge rides the pending-edge queue until the row commits) and
 * opens the document panel. The param is consumed once per document id and
 * stripped shallowly so a refresh doesn't re-attach after a manual detach.
 */
function AttachDocDeepLink({
  conversationId,
  ready,
}: {
  conversationId: string | null;
  ready: boolean;
}) {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const openWorkingDocPanel = useOpenWorkingDocumentPanel();
  const attachedDocRef = useRef<string | null>(null);
  const docId = searchParams.get("attachDoc");
  // The launcher mints the conversationId during render but registers the
  // conversations-slice record in an effect. The pending-edge queue treats an
  // UNKNOWN conversation as already-persisted (direct write), so attaching
  // before the record exists would fire a doomed assoc_add instead of
  // queueing — wait for registration.
  const conversationRegistered = useAppSelector((state) =>
    conversationId
      ? Boolean(state.conversations.byConversationId[conversationId])
      : false,
  );

  useEffect(() => {
    if (!docId || !conversationId || !ready || !conversationRegistered) return;
    if (attachedDocRef.current === docId) return;
    if (!UUID_RE.test(docId)) return;
    attachedDocRef.current = docId;
    void dispatch(
      linkConversationDocumentThunk({
        conversationId,
        kind: "working",
        documentId: docId,
      }),
    );
    openWorkingDocPanel({ conversationId, initialKind: "working" });
    const params = new URLSearchParams(window.location.search);
    params.delete("attachDoc");
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, [
    conversationId,
    conversationRegistered,
    dispatch,
    docId,
    openWorkingDocPanel,
    ready,
  ]);

  return null;
}
