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

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectConversationMessages,
  selectVisibleMessageGroupLimit,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  selectStreamPhase,
  selectLatestRequestId,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { AgentUserMessage } from "./user/AgentUserMessage";
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
const AssistantTurnGroup = dynamic(
  () =>
    import("./assistant/AssistantTurnGroup").then((m) => ({
      default: m.AssistantTurnGroup,
    })),
  { ssr: false, loading: () => <AssistantDynamicFallback /> },
);

// Dynamic (ssr:false) — same as AssistantTurnGroup. AgentAssistantMessage
// pulls in useDomCapturePrint → jspdf → fflate, whose Node Worker import
// cannot be resolved during SSR. A static import here 500s the route.
const AgentAssistantMessage = dynamic(
  () =>
    import("./assistant/AgentAssistantMessage").then((m) => ({
      default: m.AgentAssistantMessage,
    })),
  { ssr: false, loading: () => <AssistantDynamicFallback /> },
);

const AgentEmptyMessageDisplay = dynamic(
  () =>
    import("./assistant/AgentEmptyMessageDisplay").then((m) => ({
      default: m.AgentEmptyMessageDisplay,
    })),
  { ssr: false },
);

const COLD_MARKDOWN_ANCHOR_WINDOW_MS = 4200;

function AssistantDynamicFallback() {
  return (
    <div className="py-1 space-y-3" aria-hidden>
      <div className="h-3.5 w-[96%] animate-pulse rounded bg-muted/55" />
      <div className="h-3.5 w-[88%] animate-pulse rounded bg-muted/50" />
      <div className="h-3.5 w-[72%] animate-pulse rounded bg-muted/45" />
      <div className="h-3.5 w-[42%] animate-pulse rounded bg-muted/35" />
    </div>
  );
}

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
  scrollRef?: RefObject<HTMLDivElement | null>;
  deferColdMarkdown?: boolean;
  fallbackVisibleGroupLimit?: number | null;
  bottomPinned?: boolean;
}

export function AgentConversationDisplay({
  conversationId,
  surfaceKey,
  compact = false,
  scrollRef,
  deferColdMarkdown = false,
  fallbackVisibleGroupLimit = null,
  bottomPinned = false,
}: AgentConversationDisplayProps) {
  const messages = useAppSelector(selectConversationMessages(conversationId));
  const phase = useAppSelector(selectStreamPhase(conversationId));
  const latestRequestId = useAppSelector(selectLatestRequestId(conversationId));
  const visibleGroupLimit = useAppSelector(
    selectVisibleMessageGroupLimit(conversationId),
  );
  // Anchor for the scroll-on-submit behavior: the conversation's last user
  // message. On a new submit we scroll THIS to the top of the viewport so the
  // rest of the page opens up for the incoming answer (see effect below).
  const lastUserRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    const prev = prevLastUserKeyRef.current;
    prevLastUserKeyRef.current = lastUserKey;
    // Skip the first commit: opening an existing conversation should land
    // wherever the scroll container puts it, not jump the last turn to top.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (lastUserKey && lastUserKey !== prev) {
      lastUserRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [lastUserKey]);

  const scrollSnapshotRef = useRef<{
    firstKey: string | undefined;
    scrollHeight: number;
  } | null>(null);
  const didAnchorColdRevealRef = useRef(false);
  useEffect(() => {
    scrollSnapshotRef.current = null;
    didAnchorColdRevealRef.current = false;
  }, [conversationId]);

  useLayoutEffect(() => {
    if (bottomPinned) {
      scrollSnapshotRef.current = null;
      return;
    }
    const scrollEl = scrollRef?.current;
    const firstKey = displayGroups[0]?.key;
    const previous = scrollSnapshotRef.current;
    if (scrollEl && previous && previous.firstKey !== firstKey) {
      const previousKeyStillVisible =
        previous.firstKey != null &&
        displayGroups.some((group) => group.key === previous.firstKey);
      if (previousKeyStillVisible) {
        const delta = scrollEl.scrollHeight - previous.scrollHeight;
        if (delta > 0) {
          scrollEl.scrollTo({ top: scrollEl.scrollTop + delta });
        }
      }
    }
    scrollSnapshotRef.current = {
      firstKey,
      scrollHeight: scrollEl?.scrollHeight ?? 0,
    };
  }, [bottomPinned, displayGroups, scrollRef]);

  useEffect(() => {
    if (bottomPinned) return undefined;
    if (!deferColdMarkdown) return undefined;
    if (didAnchorColdRevealRef.current) return undefined;
    if (
      effectiveVisibleGroupLimit === null ||
      effectiveVisibleGroupLimit <= 2
    ) {
      return undefined;
    }
    didAnchorColdRevealRef.current = true;
    let animationFrame = 0;
    let stopped = false;
    const anchorLatestUser = () => {
      const scrollEl = scrollRef?.current;
      const target = lastUserRef.current;
      if (!scrollEl || !target) return;
      const scrollRect = scrollEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const delta = targetRect.top - scrollRect.top;
      if (Math.abs(delta) > 1) {
        scrollEl.scrollTo({ top: scrollEl.scrollTop + delta });
      }
    };
    const timer = window.setTimeout(() => {
      const startedAt = performance.now();
      const tick = () => {
        anchorLatestUser();
        if (
          !stopped &&
          performance.now() - startedAt < COLD_MARKDOWN_ANCHOR_WINDOW_MS
        ) {
          animationFrame = window.requestAnimationFrame(tick);
        }
      };
      animationFrame = window.requestAnimationFrame(tick);
    }, 220);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [bottomPinned, deferColdMarkdown, effectiveVisibleGroupLimit, lastUserKey]);

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
  const spacingClass = compact ? "space-y-2 pb-12" : "space-y-6 pb-[25dvh]";

  return (
    <NonEditableContextMenu
      sourceFeature="assistant-message"
      surfaceName="matrx-user/assistant-message"
      enableFloatingIcon={false}
      // Content blocks are insert-into-an-editor items — meaningless on
      // read-only rendered output, so hide that submenu here.
      placementMode={{ "content-block": "hide" }}
      contextData={{ conversationId }}
      resolveContextOnOpen={resolveMenuContext}
    >
      <div
        className={`${spacingClass} p-2 scrollbar-hide ${
          bottomPinned ? "min-h-full flex flex-col justify-end" : ""
        }`}
      >
        {displayGroups.map((group) => {
          if (group.kind === "user") {
            const isLastUser = group.key === lastUserKey;
            return (
              <div key={group.key} ref={isLastUser ? lastUserRef : undefined}>
                <AgentUserMessage
                  conversationId={conversationId}
                  messageId={group.messageId}
                  surfaceKey={surfaceKey}
                  compact={compact}
                />
              </div>
            );
          }

          if (group.kind === "assistant-failed") {
            // Rendered directly (not via AssistantTurnGroup): a failed turn
            // renders whatever content already streamed with the error line
            // appended BELOW it (error-only when nothing streamed), and never
            // mounts an action bar — nothing for a turn group to coordinate.
            return (
              <AgentAssistantMessage
                key={group.key}
                conversationId={conversationId}
                requestId={group.requestId ?? undefined}
                messageId={group.messageId ?? undefined}
                isStreamActive={group.isStreamActive}
                surfaceKey={surfaceKey}
                compact={compact}
                canRetry={group.canRetry}
                deferColdMarkdown={deferColdMarkdown}
              />
            );
          }

          return (
            <AssistantTurnGroup
              key={group.key}
              conversationId={conversationId}
              surfaceKey={surfaceKey}
              compact={compact}
              members={group.members}
              deferColdMarkdown={deferColdMarkdown}
            />
          );
        })}
      </div>
    </NonEditableContextMenu>
  );
}
