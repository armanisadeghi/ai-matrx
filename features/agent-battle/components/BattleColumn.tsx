"use client";

/**
 * BattleColumn
 *
 * One column in the comparison grid. Header (agent/version dropdowns +
 * controls) on top, then the conversation surface, then the input.
 *
 * Composed manually instead of using AgentConversationColumn directly so we
 * can place the ResponseFeedbackBar INSIDE the scroll area, right under
 * the last assistant message (per the design call: "directly after the
 * assistant message, full width of the response area").
 *
 * The pieces below the conversation (CreatorRunPanel + SmartAgentInput)
 * are the same primitives AgentConversationColumn uses — we just rewire
 * the layout.
 */

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDown } from "lucide-react";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { OlderMessagesSentinel } from "@/features/agents/components/shared/OlderMessagesSentinel";
import { cn } from "@/lib/utils";
import { BattleColumnHeader } from "./BattleColumnHeader";
import { ResponseFeedbackBar } from "./ResponseFeedbackBar";
import { BATTLE_SURFACE_KEY } from "../redux/thunks";
import type { BattleColumn as BattleColumnType } from "../types";

// Dynamic import — CreatorRunPanel pulls the whole window-panels chunk; keep
// it out of the page's initial bundle.
const CreatorRunPanel = dynamic(
  () =>
    import(
      "@/features/agents/components/run-controls/CreatorRunPanel"
    ).then((m) => ({ default: m.CreatorRunPanel })),
  { ssr: false, loading: () => null },
);

interface BattleColumnProps {
  column: BattleColumnType;
  onToggleCollapse: () => void;
}

export function BattleColumn({ column, onToggleCollapse }: BattleColumnProps) {
  return (
    <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
      <BattleColumnHeader
        column={column}
        onToggleCollapse={onToggleCollapse}
      />
      <div className="flex-1 overflow-hidden flex justify-center min-w-0">
        {column.agentId ? (
          <BoundColumn conversationId={column.conversationId} />
        ) : (
          <EmptyAgentState />
        )}
      </div>
    </div>
  );
}

function BoundColumn({ conversationId }: { conversationId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

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
    <div className="h-full flex flex-col overflow-hidden px-2 w-full max-w-3xl mx-auto pb-2">
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto pt-12"
        >
          <OlderMessagesSentinel
            conversationId={conversationId}
            scrollRef={scrollRef}
          />
          <AgentConversationDisplay
            conversationId={conversationId}
            surfaceKey={BATTLE_SURFACE_KEY}
          />
          {/* The feedback bar sits at the bottom of the conversation
              scroll area, directly under the last assistant response.
              Full width of the response area; flows with messages so it
              doesn't fight the scroll behavior. */}
          <ResponseFeedbackBar conversationId={conversationId} />
        </div>
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

      <CreatorRunPanel
        conversationId={conversationId}
        displayConversationId={conversationId}
        surfaceKey={BATTLE_SURFACE_KEY}
      />

      <SmartAgentInput
        conversationId={conversationId}
        surfaceKey={BATTLE_SURFACE_KEY}
        sendButtonVariant="blue"
        showSubmitOnEnterToggle
      />
    </div>
  );
}

function EmptyAgentState() {
  return (
    <div className="h-full flex items-center justify-center text-center px-4">
      <div className="text-xs text-muted-foreground max-w-[220px]">
        Pick an agent above to set up this column. Each column is independent —
        different agents, different versions, different inputs.
      </div>
    </div>
  );
}
