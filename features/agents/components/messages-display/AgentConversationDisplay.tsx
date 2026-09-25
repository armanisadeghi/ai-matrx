"use client";

/**
 * AgentConversationDisplay
 *
 * Renders the conversation transcript. Reads ONLY from `messages.byId +
 * orderedIds` (MessageRecord shape).
 *
 * Streaming bubble: the LATEST assistant cx_message reservation IS the
 * streaming bubble — there is no virtual `__streaming__` entry. While the
 * stream is active, that record carries `isStreamActive=true` and the
 * `latestRequestId`; AgentAssistantMessage falls through to the
 * requestId-driven MarkdownStream path to render in-flight chunks.
 *
 * Once the stream completes, Phase 3 routing in process-stream commits the
 * final `CxContentBlock[]` content into the same byId record(s) and the
 * canonical `selectMessageInterleavedContent` selector takes over, joining
 * tool_call stubs with their full payloads from `observability.toolCalls`.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
// The canonical "this read failed — try again" primitive (docs/reuse-first.md).
// A transcript that could not be read is exactly its `hasData={false}` case.
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import {
  selectConversationMessages,
  selectMessagesHydrationFailure,
  selectVisibleMessageGroupLimit,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  selectStreamPhase,
  selectLatestRequestId,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { AgentUserMessage } from "./user/AgentUserMessage";
import { CollabNoteMessage } from "./user/CollabNoteMessage";
// Universal v3 context menu — the SAME menu everywhere. ONE read-only instance
// serves the whole transcript: `resolveContextOnOpen` resolves the per-message /
// per-block context from cheap DOM tags (`data-message-id`, `data-mtx-ctx`) on
// right-click, so blocks stay free (just tags) instead of mounting a menu each.
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { resolveMarkdownContext } from "@/features/context-menu-v3/utils/resolveMarkdownContext";
import {
  applyDisplayGroupWindow,
  buildDisplayEntries,
  groupDisplayEntries,
  type DisplayGroup,
} from "./display-groups";
import {
  isWarRoomThreadAgentSurface,
  traceWarRoomRenderPath,
} from "@/features/war-room/utils/renderPathTrace";
// STATIC (2026-07-28, fragmentation campaign): these three render together on
// every transcript, so their former per-component dynamic(ssr:false)
// boundaries multiplied chunk groups across every consuming context for zero
// deferral. The old "static import 500s the route — jspdf → fflate node
// worker" reason is gone: next.config.js pins `jspdf` to its browser build
// via turbopack.resolveAlias (see the comment there), verified by an SSR
// render of /chat after this change. The heavy engines below these (the
// MarkdownStream front door) keep their own single edges.
import { AssistantTurnGroup } from "./assistant/AssistantTurnGroup";
import { AgentAssistantMessage } from "./assistant/AgentAssistantMessage";
import { AgentEmptyMessageDisplay } from "./assistant/AgentEmptyMessageDisplay";
import { ErrorBoundaryWithCapture } from "@/lib/error-boundary/ErrorBoundaryWithCapture";
import { ExampleTurnsGroup } from "@/features/agents/message-flags/ExampleTurnsGroup";
import { Pin } from "lucide-react";
import {
  hydratePinnedMessages,
  togglePinnedMessage,
  usePinnedMessageIds,
} from "@/features/agents/message-pins/pinned-messages-store";
import { ConversationToolbar } from "./conversation-tools/ConversationToolbar";
import { FollowUpSuggestions } from "./conversation-tools/FollowUpSuggestions";
import { filterGroupsToPinned, groupMessageIds } from "./conversation-tools/pinned-filter";
import { useMessageListInteractions } from "./conversation-tools/useMessageListInteractions";

interface AgentConversationDisplayProps {
  conversationId: string;
  /**
   * The UI surface this transcript belongs to. Threaded into per-message
   * action bars so fork / delete / retry outcomes route correctly via the
   * surfaces registry. Optional — components fall back to local behavior
   * when omitted (e.g. embedded previews).
   */
  surfaceKey?: string;
  compact?: boolean;
  deferColdMarkdown?: boolean;
  fallbackVisibleGroupLimit?: number | null;
  bottomPinned?: boolean;
}

export function AgentConversationDisplay({
  conversationId,
  surfaceKey,
  compact = false,
  deferColdMarkdown = false,
  fallbackVisibleGroupLimit = null,
  bottomPinned = false,
}: AgentConversationDisplayProps) {
  const dispatch = useAppDispatch();
  const messages = useAppSelector(selectConversationMessages(conversationId));
  // Set by `loadConversation` when a read for a conversation the server was
  // supposed to have came back with nothing, or failed outright.
  const hydrationFailure = useAppSelector(
    selectMessagesHydrationFailure(conversationId),
  );
  const phase = useAppSelector(selectStreamPhase(conversationId));
  const latestRequestId = useAppSelector(selectLatestRequestId(conversationId));
  const visibleGroupLimit = useAppSelector(
    selectVisibleMessageGroupLimit(conversationId),
  );
  // Anchor for the scroll-on-submit behavior: the conversation's last user
  // message. On a new submit we scroll THIS to the top of the viewport so the
  // rest of the page opens up for the incoming answer (see effect below).
  const lastUserRef = useRef<HTMLDivElement>(null);
  // RC-B9 answer tools: in-thread find, the pinned filter, keyboard + touch
  // access to every message.
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const pinnedIds = usePinnedMessageIds();

  const isActive =
    phase === "connecting" ||
    phase === "pre_token" ||
    phase === "reasoning" ||
    phase === "text_streaming" ||
    phase === "interstitial" ||
    phase === "error";

  const allDisplayGroups = useMemo((): DisplayGroup[] => {
    const entries = buildDisplayEntries({
      messages,
      isActive,
      latestRequestId,
      isErrorPhase: phase === "error",
    });
    return groupDisplayEntries(entries);
  }, [messages, isActive, latestRequestId, phase]);

  // Cold `/chat/[id]` owns the initial bottom-window locally. That local
  // limit must take precedence over any Redux value left from a prior visit
  // to the same conversation, otherwise a warm in-memory conversation can
  // briefly render from the oldest loaded group.
  const effectiveVisibleGroupLimit =
    fallbackVisibleGroupLimit ?? visibleGroupLimit;
  const displayGroups = useMemo(
    () => applyDisplayGroupWindow(allDisplayGroups, effectiveVisibleGroupLimit),
    [allDisplayGroups, effectiveVisibleGroupLimit],
  );

  // Key of the conversation's LAST user turn — the scroll anchor.
  useMessageListInteractions(
    transcriptRef,
    () => setFindOpen(true),
    displayGroups.length > 0,
  );
  useEffect(() => {
    void hydratePinnedMessages(messages.map((m) => m.id));
  }, [messages]);
  const pinnedCount = messages.filter((m) => pinnedIds.has(m.id)).length;
  // The pinned view reads EVERY group (not the render window) so nothing
  // pinned hides behind "load earlier".
  const visibleGroups = pinnedOnly
    ? filterGroupsToPinned(allDisplayGroups, pinnedIds)
    : displayGroups;
  let latestAssistantKey: string | undefined;
  for (let i = displayGroups.length - 1; i >= 0; i--) {
    if (displayGroups[i].kind === "assistant") {
      latestAssistantKey = displayGroups[i].key;
      break;
    }
  }

  const lastUserKey = useMemo(() => {
    for (let i = displayGroups.length - 1; i >= 0; i--) {
      if (displayGroups[i].kind === "user") return displayGroups[i].key;
    }
    return undefined;
  }, [displayGroups]);

  // Scroll-on-submit: ONE smooth scroll that pins the just-submitted user
  // message to the top of the viewport, opening the rest of the page for the
  // agent's streaming answer. This deliberately does NOT follow the stream —
  // there is no continuous auto-scroll, so token/iteration appends never yank
  // the viewport around. It fires only when the last user turn actually
  // CHANGES (a real new submit), never on stream chunks, older-history
  // prepends, or the initial load of an existing conversation.
  const prevLastUserKeyRef = useRef<string | undefined>(undefined);
  const didMountRef = useRef(false);
  const lastUserIsPending = messages.some(
    (message) =>
      message.id === lastUserKey && message._clientStatus === "pending",
  );
  useEffect(() => {
    const prev = prevLastUserKeyRef.current;
    prevLastUserKeyRef.current = lastUserKey;
    // Skip the first commit: opening an existing conversation should land
    // wherever the scroll container puts it, not jump the last turn to top.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    // A user record discovered by an older-page fetch is history, not a
    // submission. Only the optimistic user message may move this anchor.
    if (lastUserIsPending && lastUserKey && lastUserKey !== prev) {
      lastUserRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [lastUserKey, lastUserIsPending]);

  // The column owns initial bottom placement; OlderMessagesSentinel owns
  // prepend compensation. History rendering must not add another scroll anchor.

  const assistantGroupCount = displayGroups.filter(
    (g) => g.kind === "assistant" || g.kind === "assistant-failed",
  ).length;

  useEffect(() => {
    if (!isWarRoomThreadAgentSurface(surfaceKey)) return;
    traceWarRoomRenderPath(
      13,
      "AgentConversationDisplay.tsx",
      "message list render",
      {
        conversationId,
        messageCount: messages.length,
        assistantGroupCount,
        renderedGroupCount: displayGroups.length,
        totalGroupCount: allDisplayGroups.length,
        streamPhase: phase,
      },
    );
  }, [
    surfaceKey,
    conversationId,
    messages.length,
    assistantGroupCount,
    displayGroups.length,
    allDisplayGroups.length,
    phase,
  ]);

  // Single-instance delegation: the ONE menu resolves the right-clicked
  // message / block from the DOM at open time. Pure DOM reads (no React/Redux),
  // so it costs nothing until the user actually right-clicks.
  const resolveMenuContext = (target: HTMLElement | null) =>
    resolveMarkdownContext(target, conversationId);

  if (displayGroups.length === 0) {
    // An empty room is a claim about the database: "nothing was ever said
    // here". When the read failed, nobody is entitled to make it — say what
    // happened and carry the one-click fix (law 4: nothing fails silently).
    if (hydrationFailure) {
      return (
        <div className="p-4">
          <StaleDataNotice
            hasData={false}
            what="this conversation"
            detail={hydrationFailure}
            onRetry={() => {
              void dispatch(
                loadConversation({
                  conversationId,
                  surfaceKey,
                  expectMaterialized: true,
                }),
              );
            }}
          />
        </div>
      );
    }
    return <AgentEmptyMessageDisplay conversationId={conversationId} />;
  }

  // Outer spacing applies BETWEEN groups (between the user turn and the
  // assistant turn that follows, or between two adjacent user turns).
  // Inside a group, AssistantTurnGroup renders sub-messages flush — no
  // additional spacing between iterations.
  //
  // The generous viewport-relative bottom pad lifts the live assistant
  // activity higher on the page (owner-specified): less of the past
  // conversation sits in the visible space while the agent works, so there's
  // less motion in view and the reading position stays calm.
  const renderGroupBody = (group: DisplayGroup): ReactNode => {
          if (group.kind === "user") {
            const isLastUser = group.key === lastUserKey;
            return (
              <ErrorBoundaryWithCapture
                key={group.key}
                boundary="AgentConversationDisplayGroup"
                relation={group.key}
                resetKeys={[group.key]}
              >
                <div ref={isLastUser ? lastUserRef : undefined}>
                  <AgentUserMessage
                    conversationId={conversationId}
                    messageId={group.messageId}
                    surfaceKey={surfaceKey}
                    compact={compact}
                  />
                </div>
              </ErrorBoundaryWithCapture>
            );
          }

          if (group.kind === "examples") {
            return (
              <ErrorBoundaryWithCapture
                key={group.key}
                boundary="AgentConversationDisplayGroup"
                relation={group.key}
                resetKeys={[group.key]}
              >
                <ExampleTurnsGroup count={group.members.length}>
                  {group.members.map((member) =>
                    member.role === "user" ? (
                      <AgentUserMessage
                        key={member.messageId}
                        conversationId={conversationId}
                        messageId={member.messageId}
                        surfaceKey={surfaceKey}
                        compact
                      />
                    ) : (
                      <AgentAssistantMessage
                        key={member.messageId}
                        conversationId={conversationId}
                        messageId={member.messageId}
                        isStreamActive={false}
                        surfaceKey={surfaceKey}
                        compact
                        hideActionBar
                        deferColdMarkdown={deferColdMarkdown}
                      />
                    ),
                  )}
                </ExampleTurnsGroup>
              </ErrorBoundaryWithCapture>
            );
          }

          if (group.kind === "collab-note") {
            // A delivered agent-collaboration note (inbox drain, user-role
            // row the user did NOT type) — info-styled, never a user bubble.
            return (
              <ErrorBoundaryWithCapture
                key={group.key}
                boundary="AgentConversationDisplayGroup"
                relation={group.key}
                resetKeys={[group.key]}
              >
                <CollabNoteMessage
                  conversationId={conversationId}
                  messageId={group.messageId}
                  compact={compact}
                />
              </ErrorBoundaryWithCapture>
            );
          }

          if (group.kind === "assistant-failed") {
            // Rendered directly (not via AssistantTurnGroup): a failed turn
            // renders whatever content already streamed with the error line
            // appended BELOW it (error-only when nothing streamed), and never
            // mounts an action bar — nothing for a turn group to coordinate.
            return (
              <ErrorBoundaryWithCapture
                key={group.key}
                boundary="AgentConversationDisplayGroup"
                relation={group.key}
                resetKeys={[group.key]}
              >
                <AgentAssistantMessage
                  conversationId={conversationId}
                  requestId={group.requestId ?? undefined}
                  messageId={group.messageId ?? undefined}
                  isStreamActive={group.isStreamActive}
                  surfaceKey={surfaceKey}
                  compact={compact}
                  canRetry={group.canRetry}
                  deferColdMarkdown={deferColdMarkdown}
                />
              </ErrorBoundaryWithCapture>
            );
          }

          return (
            <ErrorBoundaryWithCapture
              key={group.key}
              boundary="AgentConversationDisplayGroup"
              relation={group.key}
              resetKeys={[group.key]}
            >
              <AssistantTurnGroup
                conversationId={conversationId}
                surfaceKey={surfaceKey}
                compact={compact}
                members={group.members}
                deferColdMarkdown={deferColdMarkdown}
              />
            </ErrorBoundaryWithCapture>
          );
  };

  // Every message is an addressable, labelled item: focusable for keyboard
  // navigation (ArrowUp/Down, Enter/"." for actions, "p" to pin), announced
  // by screen readers, and long-pressable on touch.
  const wrapGroup = (group: DisplayGroup, index: number, body: ReactNode) => {
    const ids = groupMessageIds(group);
    const primaryId = ids[ids.length - 1];
    const pinned = ids.some((id) => pinnedIds.has(id));
    const who =
      group.kind === "user"
        ? "Your message"
        : group.kind === "collab-note"
          ? "Note"
          : group.kind === "examples"
            ? "Example turns"
            : "Assistant answer";
    const showFollowUps =
      group.kind === "assistant" &&
      group.key === latestAssistantKey &&
      !isActive &&
      !pinnedOnly &&
      primaryId;
    return (
      <div
        key={group.key}
        data-message-group=""
        data-primary-message-id={primaryId}
        tabIndex={index === visibleGroups.length - 1 ? 0 : -1}
        role="article"
        aria-label={`${who}${pinned ? ", pinned" : ""}`}
        className="relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {pinned && primaryId && (
          <button
            type="button"
            data-find-ignore=""
            onClick={() => {
              const pinnedId = ids.find((id) => pinnedIds.has(id));
              if (pinnedId) void togglePinnedMessage(pinnedId);
            }}
            aria-label="Pinned — click to unpin"
            title="Pinned — click to unpin"
            className={`mb-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 ${group.kind === "user" ? "float-right" : ""}`}
          >
            <Pin className="h-3 w-3" aria-hidden="true" />
            Pinned
          </button>
        )}
        {body}
        {showFollowUps && (
          <FollowUpSuggestions conversationId={conversationId} messageId={primaryId} />
        )}
      </div>
    );
  };

  const spacingClass = compact ? "space-y-2 pb-12" : "space-y-6 pb-[25dvh]";

  return (
    <NonEditableContextMenu
      sourceFeature="chat"
      surfaceName="matrx-user/assistant-message"
      enableFloatingIcon={false}
      suppressed={isActive}
      // Content blocks are insert-into-an-editor items — meaningless on
      // read-only rendered output, so hide that submenu here.
      placementMode={{ "content-block": "hide" }}
      contextData={{ conversationId }}
      resolveContextOnOpen={resolveMenuContext}
    >
      {!compact && (
        <ConversationToolbar
          conversationId={conversationId}
          rootRef={transcriptRef}
          findOpen={findOpen}
          setFindOpen={setFindOpen}
          pinnedOnly={pinnedOnly}
          setPinnedOnly={setPinnedOnly}
          pinnedCount={pinnedCount}
        />
      )}
      <div
        ref={transcriptRef}
        aria-label="Conversation"
        className={`${spacingClass} p-2 scrollbar-hide ${
          bottomPinned ? "min-h-full flex flex-col justify-end" : ""
        }`}
      >
        {visibleGroups.map((group, index) =>
          wrapGroup(group, index, renderGroupBody(group)),
        )}
        {pinnedOnly && visibleGroups.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nothing pinned in this conversation.{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setPinnedOnly(false)}
            >
              Show all messages
            </button>
          </div>
        )}
      </div>
    </NonEditableContextMenu>
  );
}
