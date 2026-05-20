"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { ArrowDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AgentConversationDisplay } from "../messages-display/AgentConversationDisplay";
import { SmartAgentInput } from "../inputs/smart-input/SmartAgentInput";
import { OlderMessagesSentinel } from "./OlderMessagesSentinel";
import { PendingAsksZone } from "@/features/agents/ui-first-tools/ui/PendingAsksZone";
import { TaskPanelChip } from "@/features/agents/ui-first-tools/ui/lists/TaskPanelChip";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";

import { cn } from "@/lib/utils";

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
  smartInputProps?: SmartInputForwardProps;
  /**
   * Optional empty-state surface. When provided AND the display conversation
   * has zero messages, this is rendered above the input instead of the
   * (empty) message list. Used by `/chat/new` to surface the greeting +
   * quick-action chips. Disappears automatically once the first message
   * lands in the messages slice.
   */
  landingContent?: React.ReactNode;
}

export function AgentConversationColumn({
  conversationId,
  displayConversationId,
  surfaceKey,
  constrainWidth = false,
  smartInputProps,
  landingContent,
}: AgentConversationColumnProps) {
  const displayId = displayConversationId ?? conversationId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  // Subscribed because we need to swap landing → message list the moment the
  // first message lands. `selectMessageCount` returns a primitive (number),
  // so re-renders are cheap.
  const messageCount = useAppSelector(selectMessageCount(displayId));
  const showLanding = !!landingContent && messageCount === 0;

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

  return (
    <div
      className={cn(
        "h-full flex flex-col overflow-hidden px-2",
        constrainWidth && "w-full max-w-3xl mx-auto pb-2",
      )}
    >
      <div className="relative flex-1 min-h-0">
        {/* Landing → conversation transition. When the first message lands,
            the landing surface drops away (fade + slide down) while the
            conversation view fades up — reads as the input dropping to the
            bottom and the chat taking over. Both are absolutely positioned
            during the overlap so there's no layout jump. */}
        <AnimatePresence initial={false}>
          {showLanding ? (
            <motion.div
              key="landing"
              className="absolute inset-0 overflow-y-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: 48 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            >
              {landingContent}
            </motion.div>
          ) : (
            <motion.div
              key="conversation"
              ref={scrollRef}
              onScroll={handleScroll}
              className="absolute inset-0 overflow-y-auto pt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.05 }}
            >
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
            </motion.div>
          )}
        </AnimatePresence>
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
        >
          <CreatorRunPanel
            conversationId={conversationId}
            displayConversationId={displayId}
            surfaceKey={surfaceKey}
          />

          {/* UI-first tools: chip surfaces plan/task/todo counts (hidden when
              empty); zone surfaces pending ask cards directly above the input.
              The chat input itself stays fully interactive — answering cards
              and typing into the input are independent actions. */}
          <div className="flex items-center justify-end mb-1">
            <TaskPanelChip conversationId={displayId} />
          </div>
          <PendingAsksZone conversationId={displayId} />

          <SmartAgentInput
            conversationId={conversationId}
            surfaceKey={surfaceKey}
            {...smartInputProps}
          />
        </motion.div>
      )}
    </div>
  );
}
