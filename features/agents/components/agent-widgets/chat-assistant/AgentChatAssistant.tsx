"use client";

/**
 * AgentChatAssistant
 *
 * Floating chat assistant widget for testing agent execution instances.
 *
 * DESIGN: Transparent floating panel — messages appear as detached, independently
 * floating items with no container card background. The panel uses a subtle
 * backdrop blur for the chrome (header + input) while the message area is
 * fully transparent.
 *
 * WIDTH: 320px — balances content readability (markdown, artifacts) with
 * compact space usage in the sidebar test environment.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  registerSurface,
  unregisterSurface,
  selectPendingNavigation,
  clearPendingNavigation,
} from "@/features/agents/redux/surfaces/surfaces.slice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { AssistantCardStack } from "./AssistantCardStack";
import { CompactAssistantInput } from "./CompactAssistantInput";
import { AssistantControlBar } from "./AssistantControlBar";
import { useAssistantHeartbeat } from "./useAssistantHeartbeat";
import { X, GripHorizontal } from "lucide-react";

interface AgentChatAssistantProps {
  conversationId: string;
  stackIndex?: number;
  onClose: () => void;
}

export function AgentChatAssistant({
  conversationId,
  stackIndex = 0,
  onClose,
}: AgentChatAssistantProps) {
  const dispatch = useAppDispatch();
  const title = useAppSelector(selectInstanceDisplayTitle(conversationId));
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const messageCount = useAppSelector(selectMessageCount(conversationId));

  // Each widget instance owns its own surface, keyed by the conversation
  // it's bound to. `customNavigation: true` opts into pendingNavigation
  // semantics — fork outcomes write a slot we read below to spawn a
  // sibling widget for the new conversation.
  const surfaceKey = `chat-assistant:${conversationId}`;

  useEffect(() => {
    dispatch(
      registerSurface({
        surfaceKey,
        kind: "widget",
        customNavigation: true,
      }),
    );
    return () => {
      dispatch(unregisterSurface(surfaceKey));
    };
  }, [dispatch, surfaceKey]);

  // When fork / retry asks us to navigate, the widget can't simply
  // change its `conversationId` prop — that's owned by the overlay
  // controller and keyed off the instanceId. Instead we spawn a NEW
  // chat-assistant widget for the target conversation and close this
  // one. The user keeps the floating-widget mental model (every widget
  // = one conversation) without losing context.
  const pendingNavigation = useAppSelector(selectPendingNavigation(surfaceKey));
  useEffect(() => {
    if (!pendingNavigation) return;
    const target = pendingNavigation.conversationId;
    dispatch(clearPendingNavigation({ surfaceKey }));
    if (target === conversationId) return;

    dispatch(
      openOverlay({
        overlayId: "agentChatAssistant",
        instanceId: target,
      }),
    );
    onClose();
  }, [pendingNavigation, dispatch, surfaceKey, conversationId, onClose]);

  const { heartbeatInterval, increaseHeartbeat, decreaseHeartbeat } =
    useAssistantHeartbeat(conversationId);

  const [isOpen, setIsOpen] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevMessageCountRef = useRef(messageCount);

  useEffect(() => {
    const delta = messageCount - prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;
    if (!isOpen && delta > 0) {
      setUnreadCount((c) => c + delta);
    }
  }, [messageCount, isOpen]);

  // ── Drag state ───────────────────────────────────────────────────────────
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: position.x,
        origY: position.y,
      };
    },
    [position],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPosition({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleToggle = () => {
    setIsOpen((prev) => {
      if (!prev) setUnreadCount(0);
      return !prev;
    });
  };

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  }, [onClose]);

  const bottomOffset = 16 + stackIndex * 56;
  const rightOffset = 16 + stackIndex * 340;

  return (
    <div
      className={`fixed z-[200] transition-all duration-300 ${
        isExiting ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
      }`}
      style={{
        bottom: `${bottomOffset}px`,
        right: `${rightOffset}px`,
        transform: `translate(${position.x}px, ${position.y}px)`,
        zIndex: 200 + stackIndex,
      }}
    >
      {/* Panel — visible when open */}
      {isOpen && (
        <div className="mb-2 animate-in slide-in-from-bottom-4 fade-in-0 duration-300">
          <div className="w-80 max-h-[75dvh] rounded-xl overflow-hidden flex flex-col shadow-2xl border border-border/50 bg-background/80 backdrop-blur-xl">
            {/* Header — draggable, minimal chrome */}
            <div
              className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 cursor-grab active:cursor-grabbing touch-none select-none shrink-0 bg-muted/20"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripHorizontal className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                {isExecuting && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                )}
                <span className="text-[11px] font-medium text-foreground/80 truncate">
                  {title}
                </span>
              </div>
              <div className="shrink-0" data-no-drag>
                <button
                  className="p-0.5 rounded-md hover:bg-muted transition-colors"
                  onClick={handleDismiss}
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Message stack — transparent background */}
            <AssistantCardStack
              conversationId={conversationId}
              surfaceKey={surfaceKey}
            />

            {/* Compact input with controls */}
            <CompactAssistantInput conversationId={conversationId} />
          </div>
        </div>
      )}

      {/* FAB + controls */}
      <div className="flex justify-end">
        <AssistantControlBar
          isOpen={isOpen}
          onToggle={handleToggle}
          unreadCount={unreadCount}
          heartbeatInterval={heartbeatInterval}
          onHeartbeatUp={increaseHeartbeat}
          onHeartbeatDown={decreaseHeartbeat}
        />
      </div>
    </div>
  );
}
