"use client";

import { usePreparedResourceSeed } from "./usePreparedResourceSeed";
import { Suspense, useEffect, useRef, useState } from "react";
import { shallowEqual } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
import { commitUrlParams } from "@ai-matrx/kit/url-state";
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
import { selectChatIncognitoActive } from "@/features/agents/redux/chat/chat-incognito.slice";
import { selectChatFreshSessionNonce } from "@/features/agents/redux/chat/chat-route.slice";
import {
  acknowledgeDraftHandoff,
  selectChatDraftHandoff,
} from "@/features/agents/redux/chat/chat-route.slice";
import {
  copyInstanceRequestDraft,
  syncInstanceRequestDraftResources,
} from "@/features/agents/redux/execution-system/thunks/copy-instance-request-draft.thunk";
import { syncHandoffPendingAttachments } from "@/features/connectors/redux/attachments.slice";
import { attachmentKey } from "@/features/connectors/attachable-resources";
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
import type { TranscriptAudience } from "@/features/agents/components/shared/transcript-audience";
import { CanvasDock } from "@/features/canvas/core/CanvasDock";
import { ChatRoomSkeleton } from "./ChatRoomSkeleton";
import { SandboxCanvasOpener } from "./sandbox-insight/SandboxCanvasOpener";
import { ToolResultCanvasOpener } from "@/features/canvas/tool-results/ToolResultCanvasOpener";
import { useConversationSandboxBindingSync } from "@/features/agents/hooks/useConversationSandboxBindingSync";
import type { ConversationSandboxBinding } from "@/lib/sandbox/conversation-binding-row";
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
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  selectActiveScratchpadId,
  selectAttachedScratchpadIds,
  selectWorkingDocEntry,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";

interface ChatRoomClientProps {
  agentId: string;
  /**
   * Who is reading this room's transcript. Default "builder" = /chat and every
   * other room, unchanged. A room hosting a non-technical Subject Matter
   * Expert passes "expert" and the machine frames stand down. Law:
   * `features/agents/components/shared/transcript-audience.tsx`.
   */
  audience?: TranscriptAudience;
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
    React.ReactNode | ((conversationId: string) => React.ReactNode);
  /**
   * Optional control pinned directly ABOVE the composer, receiving this
   * room's own conversation id. The voice route mounts its panel here so the
   * voice layer binds to the SAME conversation the room already owns — a
   * second launcher for the same agent would mean two conversations, and the
   * user would watch one answer render in two places.
   */
  aboveInput?: React.ReactNode | ((conversationId: string) => React.ReactNode);
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
  /**
   * THE MANDATE DOOR for this room. When the surface knows WHICH JOB it is
   * (`/chat/new` is the `chat.default_new_chat` mandate), pass the key: the
   * first turn POSTs `/ai/mandates/{key}` and aidream resolves the Holder for
   * this principal. `agentId` stays the DISPLAY identity the page already
   * resolved at SSR — it paints the header and input bar, and never decides
   * who answers. That is what makes an org/user rebind take effect with no
   * client deploy.
   *
   * Omit it on rooms that are genuinely agent-addressed (`/chat/a/[agentId]`,
   * where the user picked THAT agent).
   */
  mandateKey?: string;
  /** Surface-owned presentation for variables bound outside the composer. */
  variablesPanelStyle?: VariablesPanelStyle;
  /**
   * The compute binding the ROW already carries, read at SSR by
   * `/chat/[conversationId]`. Applied to the record as soon as the instance
   * exists — before the bundle RPC — so a chat that was on a sandbox opens back
   * on that sandbox instead of looking unbound (or looking like it is on the
   * user's shared default) while two round-trips land.
   */
  sandboxBinding?: ConversationSandboxBinding | null;
  /**
   * What `conversationId` IS, when the host knows:
   *
   *  - `"existing"` (default) — a conversation the server already holds. An
   *    empty read is a failed read and the transcript says so.
   *  - `"reserved"` — an id the server minted for this room whose row is
   *    written lazily by the first turn (the vision interview's per-role
   *    bindings). An empty read is simply an empty room.
   *
   * Without it the room has to guess, and the guess ("not in memory ⇒ the
   * server has it") put a permanent "Couldn't load this conversation" banner,
   * plus a Try-again that could never succeed, on every freshly opened vision
   * interview (census W1, 2026-09-15).
   */
  conversationMaterialization?: "existing" | "reserved";
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
  audience = "builder",
  conversationId: conversationIdProp,
  landingContent,
  aboveInput,
  buildConversationHref = defaultConversationHref,
  mandateKey,
  variablesPanelStyle,
  sandboxBinding = null,
  conversationMaterialization = "existing",
}: ChatRoomClientProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();

  // ONE helper owns this string (see `chatRouteSurfaceKey`). This client is the
  // surface that REGISTERS the focus entry, so every reader — the header's
  // agent switch, `/chat/new`, `beginFreshChat` — must derive the same key.
  const surfaceKey = chatRouteSurfaceKey(agentId);
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);
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
    // Mandate-driven room: the run goes through the server's mandate door.
    ...(mandateKey ? { mandateKey } : {}),
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
    sandboxSeed: sandboxBinding,
    // A reservation has no row until the first turn writes one, so an empty
    // bundle is the truth about it, not a failure to read it.
    expectMaterialized:
      conversationMaterialization === "reserved" ? false : undefined,
  });

  // The other direction: a run can bind a box SERVER-side (aidream's
  // `persist_conversation_binding`) — from an MCP run, the extension, the
  // desktop app or a second tab. Re-read the one column when a turn finishes
  // and when the tab comes back, so the control learns it with no reload.
  useConversationSandboxBindingSync(conversationIdProp ?? null);

  // ── Pending navigation → router.replace ─────────────────────────────────
  // Fork / retry / delete actions set pendingNavigation with the target
  // conversationId; this effect promotes it into a URL change so the user
  // ends up on the right deep-linkable route.
  const pendingNavigation = useAppSelector(selectPendingNavigation(surfaceKey));
  useEffect(() => {
    if (!pendingNavigation) return;
    // Programmatic: promoting a just-created conversation id onto the current
    // entry. Back must leave the chat, not un-name the conversation.
    router.replace(buildConversationHref(pendingNavigation.conversationId));
    dispatch(clearPendingNavigation({ surfaceKey }));
  }, [pendingNavigation, router, dispatch, surfaceKey, buildConversationHref]);

  // ── Fresh-instance transfer readiness ───────────────────────────────────
  // Same-tab agent switches copy the live Redux request below. External
  // prepared-content doors still use the identity-bound sessionStorage bridge
  // farther down. Both must wait for the launcher-created input/resource
  // entries before applying anything.
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
  const resourcesEntryReady = useAppSelector((state) =>
    liveConversationId
      ? Object.prototype.hasOwnProperty.call(
          state.instanceResources.byConversationId,
          liveConversationId,
        )
      : false,
  );
  const draftHandoff = useAppSelector(selectChatDraftHandoff);
  const handoffResourceSources = useAppSelector(
    (state) =>
      draftHandoff
        ? draftHandoff.pinnedSourceConversationIds.map(
            (conversationId) =>
              state.instanceResources.byConversationId[conversationId] ?? {},
          )
        : [],
    shallowEqual,
  );
  const draftSourceAttachments = useAppSelector((state) =>
    draftHandoff
      ? state.conversationAttachments.byConversationId[
          draftHandoff.sourceConversationId
        ]
      : undefined,
  );
  const connectorSourceAttachments = useAppSelector((state) =>
    draftHandoff
      ? state.conversationAttachments.byConversationId[
          draftHandoff.connectorSourceConversationId
        ]
      : undefined,
  );
  const handoffAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      conversationIdProp ||
      !liveConversationId ||
      !draftInputEntryReady ||
      !resourcesEntryReady
    )
      return;
    if (!draftHandoff || draftHandoff.targetAgentId !== agentId) return;
    const transactionKey = `${draftHandoff.sourceConversationId}:${liveConversationId}`;
    if (handoffAppliedRef.current === transactionKey) return;
    handoffAppliedRef.current = transactionKey;
    dispatch(
      copyInstanceRequestDraft({
        sourceConversationId: draftHandoff.sourceConversationId,
        targetConversationId: liveConversationId,
        chatSemantics: true,
      }),
    );
  }, [
    agentId,
    conversationIdProp,
    dispatch,
    draftHandoff,
    draftInputEntryReady,
    liveConversationId,
    resourcesEntryReady,
  ]);

  useEffect(() => {
    if (
      !draftHandoff ||
      draftHandoff.targetAgentId !== agentId ||
      !liveConversationId
    )
      return;
    const transactionKey = `${draftHandoff.sourceConversationId}:${liveConversationId}`;
    if (handoffAppliedRef.current !== transactionKey) return;
    // Subsequent source completions are keyed resource upserts only. They never
    // re-run the full copy, so typing/adding on the destination cannot be lost.
    dispatch(
      syncInstanceRequestDraftResources({
        sourceConversationId: draftHandoff.resourceSourceConversationId,
        draftSourceConversationId: draftHandoff.sourceConversationId,
        targetConversationId: liveConversationId,
      }),
    );
    const currentPicks = [
      ...(draftSourceAttachments?.pending ?? []),
      ...(draftSourceAttachments?.rows ?? []).map(
        ({ association_id: _associationId, ...pick }) => pick,
      ),
    ];
    const rootPicks = [
      ...(connectorSourceAttachments?.pending ?? []),
      ...(connectorSourceAttachments?.rows ?? []).map(
        ({ association_id: _associationId, ...pick }) => pick,
      ),
    ];
    const inheritedKeys = new Set(
      draftSourceAttachments?.handoffInheritedKeys ?? [],
    );
    const currentKeys = new Set(currentPicks.map(attachmentKey));
    const removedInheritedKeys = new Set(
      [...inheritedKeys].filter((key) => !currentKeys.has(key)),
    );
    const desiredPicks = new Map(
      rootPicks
        .filter((pick) => !removedInheritedKeys.has(attachmentKey(pick)))
        .map((pick) => [attachmentKey(pick), pick]),
    );
    for (const pick of currentPicks) {
      if (!inheritedKeys.has(attachmentKey(pick))) {
        desiredPicks.set(attachmentKey(pick), pick);
      }
    }
    dispatch(
      syncHandoffPendingAttachments({
        conversationId: liveConversationId,
        picks: [...desiredPicks.values()],
      }),
    );
    const resourcesSettled = handoffResourceSources.every((resources) =>
      Object.values(resources).every(
        (resource) =>
          resource.status === "ready" || resource.status === "error",
      ),
    );
    const connectorSettled = [
      draftSourceAttachments,
      connectorSourceAttachments,
    ].every(
      (entry) =>
        !entry || (entry.status !== "loading" && entry.busyKeys.length === 0),
    );
    if (resourcesSettled && connectorSettled) {
      dispatch(acknowledgeDraftHandoff({ targetAgentId: agentId }));
    }
  }, [
    agentId,
    dispatch,
    draftHandoff,
    liveConversationId,
    connectorSourceAttachments,
    draftSourceAttachments,
    handoffResourceSources,
  ]);
  const attachResource = useAttachResource(liveConversationId ?? "");
  const draftAppliedRef = useRef<string | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<
    | (NonNullable<ReturnType<typeof consumeChatDraftTransfer>> & {
        conversationId: string;
      })
    | null
  >(null);
  useEffect(() => {
    if (conversationIdProp) return; // existing conversation, not a chip target
    if (!liveConversationId || !draftInputEntryReady) return;
    if (draftAppliedRef.current === liveConversationId) return;
    let transfer;
    try {
      transfer = consumeChatDraftTransfer(agentId, { userId, organizationId });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Prepared chat content could not be attached.",
      );
      draftAppliedRef.current = liveConversationId;
      return;
    }
    if (!transfer) {
      draftAppliedRef.current = liveConversationId;
      return;
    }
    draftAppliedRef.current = liveConversationId;
    // Session storage is an external navigation handoff; publishing its consumed value wakes the resource-readiness hook.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingTransfer({ ...transfer, conversationId: liveConversationId });
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
    userId,
    organizationId,
  ]);

  // Recheck capture identity at attachment readiness, not only at storage consumption.
  usePreparedResourceSeed({
    conversationId:
      !conversationIdProp &&
      pendingTransfer?.conversationId === liveConversationId
        ? liveConversationId
        : null,
    ready: resourcesEntryReady,
    resources: pendingTransfer?.resources,
    expectedIdentity:
      pendingTransfer?.userId && pendingTransfer.organizationId
        ? {
            userId: pendingTransfer.userId,
            organizationId: pendingTransfer.organizationId,
          }
        : null,
    currentIdentity: { userId, organizationId },
    attach: attachResource,
    reportError: toast.error,
  });

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
      // Programmatic promotion of the focused conversation — see above.
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
    const attachedResources = selectInstanceResources(conversationId)(
      state,
    ).map((r) => ({
      id: r.resourceId,
      block_type: r.blockType,
      status: r.status,
    }));
    const variableValues = selectResolvedVariables(conversationId)(state);
    const settings = selectCurrentSettings(conversationId)(state);
    const model = typeof settings?.model === "string" ? settings.model : null;

    const workingEntry = selectWorkingDocEntry(
      conversationId,
      "working",
    )(state);
    const workingDocument = workingEntry
      ? {
          enabled: workingEntry.enabled,
          title: workingEntry.title ?? "",
          materialized: workingEntry.materialized ?? false,
          version: workingEntry.version ?? 0,
          char_count: workingEntry.content?.length ?? 0,
        }
      : null;

    const scratchEntry = selectWorkingDocEntry(
      conversationId,
      "scratch",
    )(state);
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
      const current =
        selectUserInputText(conversationId)(store.getState()) ?? "";
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
        {/* The Canvas is a RESIZABLE COLUMN here, never an overlay: opening it
            shrinks the thread instead of covering the composer, the mic and
            the send button (owner, 2026-09-13 — "a nice adjustable sidebar
            that can be folded out and in"). `CanvasDock` folds itself away
            when the canvas is closed and stands down entirely on a phone,
            where the full-bleed sheet is still the right answer. */}
        <CanvasDock groupId="chat-canvas-dock" className="flex-1 min-h-0">
          <div className="h-full min-h-0 overflow-hidden flex">
            <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex justify-center">
              <AgentConversationColumn
                conversationId={conversationId}
                surfaceKey={surfaceKey}
                audience={audience}
                constrainWidth
                edgeToEdgeScroll
                deferColdMarkdown={!!conversationIdProp}
                smartInputProps={{
                  sendButtonVariant: "blue",
                  // Lives in the Chat Options (+) → Preferences tab now.
                  showSubmitOnEnterToggle: false,
                  variablesPanelStyle,
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
        </CanvasDock>
      </div>
      {/* The bound sandbox reaches the CANVAS, not a panel of its own: this
          headless watcher opens the Sandbox pane the first time the agent
          works in the box, and merely offers it when the canvas is already
          showing a document or the browser. Renders nothing. */}
      <SandboxCanvasOpener conversationId={conversationId} />
      {/* THE DOOR LAW: every record the UI names opens. When a tool creates a
          document (or any other canvas-renderable record), this headless
          watcher offers it in the canvas switcher and opens it only into a
          canvas that is showing nothing else. Renders nothing. */}
      <ToolResultCanvasOpener conversationId={conversationId} />
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
    // Programmatic: consuming the one-shot `attachDoc` intent off the current
    // entry so a refresh cannot re-open the panel.
    commitUrlParams({ attachDoc: null }, "replace");
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
