"use client";

import { useState, useRef, useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  selectLatestAccumulatedText,
  selectIsExecuting,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { useRetainLatestRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Minimize2, X } from "lucide-react";
import { AgentRunner } from "../smart/AgentRunner";

interface AgentToastOverlayProps {
  conversationId: string;
  onClose: () => void;
  index?: number;
}

export function AgentToastOverlay({
  conversationId,
  onClose,
  index = 0,
}: AgentToastOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const text = useAppSelector(selectLatestAccumulatedText(conversationId));

  // Live output is read straight off the conversation's newest request row
  // (no `MarkdownStream requestId=`), so this viewer retains the row for its
  // own mount lifetime — otherwise an owner reap mid-stream blanks it for good.
  // Doctrine: features/agents/docs/LIVE_RUN_RETENTION.md.
  useRetainLatestRequestForViewer(conversationId, "AgentToastOverlay");
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const title = useAppSelector(selectInstanceDisplayTitle(conversationId));

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

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  }, [onClose]);

  // ── Expanded: full chat view ─────────────────────────────────────────────
  if (expanded) {
    return (
      <div
        className="fixed z-[200] transition-all duration-300 ease-out"
        style={{
          bottom: "16px",
          right: "16px",
          transform: `translate(${position.x}px, ${position.y}px)`,
          zIndex: 200 + index,
        }}
      >
        <div className="w-96 h-[420px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 duration-200">
          <div
            className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-muted/30 cursor-grab active:cursor-grabbing touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-0.5 rounded-full bg-primary/10 shrink-0">
                {isExecuting ? (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-primary" />
                )}
              </div>
              <span className="text-xs font-medium text-foreground truncate">
                {title}
              </span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0" data-no-drag>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setExpanded(false)}
              >
                <Minimize2 className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleDismiss}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <AgentRunner
            conversationId={conversationId}
            compact
            className="flex-1 min-h-0 bg-background"
          />
        </div>
      </div>
    );
  }

  // ── Collapsed: toast notification ────────────────────────────────────────
  return (
    <div
      className="fixed z-[200]"
      style={{
        bottom: `${16 + index * 88}px`,
        right: "16px",
        transform: `translate(${position.x}px, ${position.y}px)`,
        zIndex: 200 + index,
      }}
    >
      <div
        className={`
          w-80 bg-card border border-border rounded-xl shadow-lg overflow-hidden
          transition-all duration-300
          ${isExiting ? "opacity-0 translate-x-[120%]" : "opacity-100 translate-x-0 animate-in slide-in-from-right-5 duration-300"}
        `}
      >
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-0.5 rounded-full bg-primary/10 shrink-0">
              {isExecuting ? (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 text-primary" />
              )}
            </div>
            <span className="text-xs font-medium text-foreground truncate">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0" data-no-drag>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div
          className="px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={() => setExpanded(true)}
        >
          {text ? (
            <p className="text-xs text-foreground leading-relaxed line-clamp-3">
              {text}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isExecuting ? (
                <span className="animate-pulse">Processing...</span>
              ) : (
                "Waiting..."
              )}
            </p>
          )}
          {text && text.length > 120 && (
            <span className="text-[10px] text-primary mt-1 block">
              Click to expand
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
