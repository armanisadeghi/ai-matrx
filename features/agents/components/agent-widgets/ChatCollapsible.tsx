"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Loader2, Webhook, X } from "lucide-react";
import { AgentRunner } from "../smart/AgentRunner";

interface ChatCollapsibleProps {
  conversationId: string;
  onClose?: () => void;
}

const VIEWPORT_MARGIN = 8;
const BASE_INSET = 16;

export function ChatCollapsible({
  conversationId,
  onClose,
}: ChatCollapsibleProps) {
  const title = useAppSelector(selectInstanceDisplayTitle(conversationId));
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const [isOpen, setIsOpen] = useState(true);

  // ── Drag state ───────────────────────────────────────────────────────────
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Clamp a desired translate offset so the widget stays inside the viewport.
  // The header sits at the top of the element, so when the widget is taller
  // than the viewport we prioritize keeping the TOP visible (so the drag
  // handle / collapse trigger is always reachable).
  const clampToBounds = useCallback((desired: { x: number; y: number }) => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return desired;

    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const xMax = BASE_INSET - VIEWPORT_MARGIN;
    const xMin = BASE_INSET + width + VIEWPORT_MARGIN - vw;
    const yMax = BASE_INSET - VIEWPORT_MARGIN;
    const yMin = BASE_INSET + height + VIEWPORT_MARGIN - vh;

    const x = xMin > xMax ? xMax : Math.min(xMax, Math.max(xMin, desired.x));
    const y = yMin > yMax ? yMin : Math.min(yMax, Math.max(yMin, desired.y));

    return { x, y };
  }, []);

  const clampCurrentPosition = useCallback(() => {
    setPosition((prev) => {
      const clamped = clampToBounds(prev);
      if (clamped.x === prev.x && clamped.y === prev.y) return prev;
      return clamped;
    });
  }, [clampToBounds]);

  // Re-clamp whenever the widget's size changes (expand/collapse animation,
  // content reflow, etc.) so the handle never animates off-screen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => clampCurrentPosition());
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampCurrentPosition]);

  // Re-clamp on window resize.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.addEventListener("resize", clampCurrentPosition);
    return () => window.removeEventListener("resize", clampCurrentPosition);
  }, [clampCurrentPosition]);

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

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      setPosition(
        clampToBounds({
          x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
          y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
        }),
      );
    },
    [clampToBounds],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed z-50 bottom-4 right-4"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="w-96 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-right-5 duration-300"
      >
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <CollapsibleTrigger asChild data-no-drag>
            <button className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
              <div className="p-0 rounded-full bg-primary/10 shrink-0">
                {isExecuting ? (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                ) : (
                  <Webhook className="w-3.5 h-3.5 text-primary" />
                )}
              </div>
              <span className="text-xs font-medium text-foreground truncate">
                {title}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          {onClose && (
            <div className="shrink-0" data-no-drag>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <CollapsibleContent className="data-[state=open]:animate-slide-down data-[state=closed]:animate-slide-up">
          <div className="h-[500px]">
            <AgentRunner
              conversationId={conversationId}
              compact
              className="h-full bg-background"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
