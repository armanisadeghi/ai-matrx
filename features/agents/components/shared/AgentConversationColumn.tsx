"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { ArrowDown } from "lucide-react";
import { motion } from "motion/react";
import { AgentConversationDisplay } from "../messages-display/AgentConversationDisplay";
import { SmartAgentInput } from "../inputs/smart-input/SmartAgentInput";
import { OlderMessagesSentinel } from "./OlderMessagesSentinel";
import { PendingAsksZone } from "@/features/agents/ui-first-tools/ui/PendingAsksZone";
import { TaskPanelChip } from "@/features/agents/ui-first-tools/ui/lists/TaskPanelChip";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectShowCreatorPanel } from "@/lib/redux/preferences/creatorDebugSlice";

import { cn } from "@/lib/utils";
import {
  isWarRoomTileAgentSurface,
  traceWarRoomRenderPath,
} from "@/features/war-room/utils/renderPathTrace";

// CreatorRunPanel renders a <WindowPanel> as styling chrome (admin-gated
// tab panel). Without `dynamic()` it would pull WindowPanel and the
// entire window-panels chunk into every route that statically imports
// AgentConversationColumn (chat, agent run, agent builder).
const CreatorRunPanel = dynamic(
  () =>
    import("../run-controls/CreatorRunPanel").then((m) => ({
      default: m.CreatorRunPanel,
    })),
  { ssr: false, loading: () => null },
);

interface SmartInputForwardProps {
  sendButtonVariant?: "default" | "blue";
  showSubmitOnEnterToggle?: boolean;
  placeholder?: string;
  compact?: boolean;
  extraRightControls?: React.ReactNode;
}

interface AgentConversationColumnProps {
  /**
   * Conversation bound to the smart input / variables panel. In the default
   * case this is also the display id (see below).
   */
  conversationId: string;
  /**
   * Optional — conversation bound to the conversation display / history.
   * Defaults to `conversationId`. Only diverges under the autoclear split
   * flow: the user just submitted and the input has jumped to a freshly-
   * prepped conversation while the display stays on the one streaming.
   */
  displayConversationId?: string;
  surfaceKey: string;
  constrainWidth?: boolean;
  /**
   * Only meaningful together with `constrainWidth`. When true, the *scroll
   * area* spans the full width of the parent container while the content
   * (transcript + input) stays centered at `max-w-3xl` inside it. This moves
   * the vertical scrollbar from the centered column's right edge (which reads
   * as "the middle of the page") out to the container edges — the ChatGPT /
   * Claude layout. Default false: the whole column is constrained and the
   * scrollbar rides the centered edge (unchanged legacy behavior).
   */
  edgeToEdgeScroll?: boolean;
  smartInputProps?: SmartInputForwardProps;
  /**
   * Optional empty-state surface. When provided AND the display conversation
   * has zero messages, this is rendered above the input instead of the
   * (empty) message list. Used by `/chat/new` to surface the greeting +
   * quick-action chips. Disappears automatically once the first message
   * lands in the messages slice.
   */
  landingContent?: React.ReactNode;
  /**
   * Hide the bottom SmartAgentInput. Used by locked-input surfaces (the
   * agent-comparison battle modes) where the message is typed once in a
   * page-level section and each column body is read-only. The transcript,
   * Creator Panel, and UI-first tools stay intact.
   */
  hideInput?: boolean;
  /**
   * Force the Creator Panel off regardless of the `showCreatorPanel`
   * preference. Defaults to false (preference-gated). Battle columns leave
   * this false so engineers keep per-column telemetry.
   */
  hideCreatorPanel?: boolean;
  /**
   * Extra content rendered INSIDE the scroll area, flush under the
   * transcript (after `AgentConversationDisplay`). Used by the battle
   * columns to mount the per-response `ResponseFeedbackBar` directly below
   * the last assistant message. Scrolls with the conversation.
   */
  afterMessages?: React.ReactNode;
}

export function AgentConversationColumn({
  conversationId,
  displayConversationId,
  surfaceKey,
  constrainWidth = false,
  edgeToEdgeScroll = false,
  smartInputProps,
  landingContent,
  hideInput = false,
  hideCreatorPanel = false,
  afterMessages,
}: AgentConversationColumnProps) {
  const displayId = displayConversationId ?? conversationId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Subscribed because we need to swap landing → message list the moment the
  // first message lands. `selectMessageCount` returns a primitive (number),
  // so re-renders are cheap.
  const messageCount = useAppSelector(selectMessageCount(displayId));
  const showLanding = !!landingContent && messageCount === 0;
  const showCreatorPanel = useAppSelector(selectShowCreatorPanel);

  useEffect(() => {
    if (!isWarRoomTileAgentSurface(surfaceKey)) return;
    traceWarRoomRenderPath(
      12,
      "AgentConversationColumn.tsx",
      "conversation column render",
      {
        conversationId,
        displayConversationId: displayId,
        messageCount,
        surfaceKey,
      },
    );
  }, [surfaceKey, conversationId, displayId, messageCount]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distanceFromBottom > 120);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // Edge-to-edge mode only applies when the column is also width-constrained.
  const edgeScroll = constrainWidth && edgeToEdgeScroll;
  // Centering wrapper for the content INSIDE the full-width scroll area /
  // input region. `contents` keeps the wrapper layout-transparent so the
  // legacy (non-edge) path renders byte-for-byte as before.
  const centerWrap = edgeScroll ? "w-full max-w-3xl mx-auto px-2" : "contents";

  return (
    <div
      className={cn(
        "h-full flex flex-col overflow-hidden",
        // Legacy: pad the whole column. Edge mode: padding lives on the
        // centered inner wrappers instead so the scroll area runs to the edge.
        !edgeScroll && "px-2",
        constrainWidth && !edgeScroll && "w-full max-w-3xl mx-auto pb-2",
        edgeScroll && "w-full pb-2",
      )}
    >
      <div className="relative flex-1 min-h-0">
        {/* Landing → conversation swap. Rendered as a plain conditional (NOT
            an AnimatePresence exit) so the landing surface unmounts the instant
            the first message lands. AnimatePresence's exit animation was
            unreliable here — with React Compiler enabled the exiting child
            frequently never completed its exit, so the greeting + hero input
            sat on top of the live conversation for seconds until the
            /chat/new → /chat/[id] route promotion finally remounted the tree.
            Each branch keeps an enter-only fade; removal is immediate. */}
        {showLanding ? (
          <motion.div
            key="landing"
            className="absolute inset-0 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {/* Landing surface (e.g. /chat/new greeting) renders raw — it is
                NOT a conversation/scroll surface, so the edge-to-edge width
                wrapper deliberately does not apply here. It owns its own
                width + vertical centering. */}
            {landingContent}
          </motion.div>
        ) : (
          <motion.div
            key="conversation"
            ref={scrollRef}
            onScroll={handleScroll}
            className={cn(
              "absolute inset-0 overflow-y-auto pt-12",
              // Edge-to-edge surfaces (chat, agent run, scribe) deliberately
              // opt into a visible, higher-contrast scrollbar — the column is
              // a long-form reading surface where finding/grabbing the bar
              // matters more than the shell's default minimalism.
              edgeScroll && "scrollbar-contrast",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
          >
            <div className={centerWrap}>
              {/* Older-history pagination trigger. Isolated component — */}
              {/* subscribes only to the older-page flags so its re-renders */}
              {/* never reach the message tree below. */}
              <OlderMessagesSentinel
                conversationId={displayId}
                scrollRef={scrollRef}
              />
              <AgentConversationDisplay
                conversationId={displayId}
                surfaceKey={surfaceKey}
              />
              {afterMessages}
            </div>
          </motion.div>
        )}
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-3"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--background))",
          }}
        />
        {showScrollDown && (
          <button
            type="button"
            onClick={scrollToBottom}
            className={cn(
              "absolute bottom-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full",
              "matrx-glass-thin-border shadow-lg text-muted-foreground hover:text-foreground",
              "transition-all duration-200 ease-out animate-in fade-in slide-in-from-bottom-2",
            )}
            title="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* While the landing is showing, suppress the standard input + the
          Creator Panel + UI-first chip — the landing surface provides its
          own minimal input (pill-shaped, just upload/mic/send). On the first
          message the landing falls away and this block slides up into the
          bottom slot, completing the "input dropped to the bottom" motion. */}
      {!showLanding && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          className={edgeScroll ? "w-full max-w-3xl mx-auto px-2" : undefined}
        >
          {!hideCreatorPanel && showCreatorPanel && (
            <CreatorRunPanel
              conversationId={conversationId}
              displayConversationId={displayId}
              surfaceKey={surfaceKey}
            />
          )}

          {/* UI-first tools: chip surfaces plan/task/todo counts (hidden when
              empty); zone surfaces pending ask cards directly above the input.
              The chat input itself stays fully interactive — answering cards
              and typing into the input are independent actions. */}
          <div className="flex items-center justify-end mb-1">
            <TaskPanelChip conversationId={displayId} />
          </div>
          <PendingAsksZone conversationId={displayId} />

          {!hideInput && (
            <SmartAgentInput
              conversationId={conversationId}
              surfaceKey={surfaceKey}
              {...smartInputProps}
            />
          )}
        </motion.div>
      )}
    </div>
  );
}
