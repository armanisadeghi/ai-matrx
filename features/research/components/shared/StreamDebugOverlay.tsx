"use client";

import { useState, useEffect, useRef } from "react";
import { Bug, ChevronDown, ChevronUp, X, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useStreamDebug } from "../../context/ResearchContext";
import {
  EventType,
  type TypedStreamEvent,
} from "@/types/python-generated/stream-events";

/**
 * Floating debug panel that receives every raw NDJSON stream event emitted
 * by any research operation. Collapsed by default; opens on click.
 * Shows event count badge while streaming, persists until manually cleared.
 *
 * Only rendered once — at the ResearchTopicShell level — so it works across
 * all research sub-routes without duplication.
 */
export function StreamDebugOverlay() {
  const { events, activeStreamName, clearEvents } = useStreamDebug();
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isActive = activeStreamName !== null;
  const eventCount = events.length;

  // Auto-show when first event arrives
  useEffect(() => {
    if (eventCount > 0) setVisible(true);
  }, [eventCount]);

  // Auto-scroll to bottom in expanded view
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, expanded]);

  if (!visible) return null;

  const handleClose = () => {
    clearEvents();
    setVisible(false);
    setExpanded(false);
  };

  const eventColor = (event: TypedStreamEvent) => {
    switch (event.event) {
      case EventType.CHUNK:
        return "text-blue-400";
      case EventType.REASONING_CHUNK:
        return "text-sky-400";
      case EventType.PHASE:
        return "text-yellow-400";
      case EventType.DATA:
        return "text-green-400";
      case EventType.COMPLETION:
        return "text-emerald-400";
      case EventType.ERROR:
        return "text-red-400";
      case EventType.TOOL_EVENT:
        return "text-purple-400";
      case EventType.HEARTBEAT:
        return "text-zinc-500";
      case EventType.END:
        return "text-zinc-400";
      case EventType.INIT:
        return "text-amber-400";
      case EventType.RENDER_BLOCK:
        return "text-violet-400";
      case EventType.RECORD_RESERVED:
        return "text-green-400";
      case EventType.RECORD_UPDATE:
        return "text-blue-400";
      case EventType.WARNING:
        return "text-yellow-400";
      case EventType.INFO:
        return "text-sky-400";
      case EventType.BROKER:
        return "text-cyan-400";
      default:
        return "text-orange-400";
    }
  };

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex flex-col",
        "rounded-xl border border-border bg-zinc-950/95 backdrop-blur-sm shadow-2xl",
        "transition-all duration-200",
        expanded ? "w-[420px] max-h-[60dvh]" : "w-auto",
      )}
    >
      {/* Header bar */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 w-full text-left"
      >
        <Bug className="h-3.5 w-3.5 text-orange-400 shrink-0" />
        <span className="text-[11px] font-mono font-semibold text-zinc-300 flex-1 truncate">
          Stream Debug
          {activeStreamName && (
            <span className="text-zinc-500 ml-1">· {activeStreamName}</span>
          )}
        </span>

        {isActive ? (
          <Wifi className="h-3 w-3 text-green-400 animate-pulse shrink-0" />
        ) : (
          <WifiOff className="h-3 w-3 text-zinc-600 shrink-0" />
        )}

        {eventCount > 0 && (
          <Badge
            variant="secondary"
            className="h-4 px-1.5 text-[9px] font-mono bg-orange-500/20 text-orange-400 border-orange-500/30 shrink-0"
          >
            {eventCount}
          </Badge>
        )}

        {expanded ? (
          <ChevronDown className="h-3 w-3 text-zinc-500 shrink-0" />
        ) : (
          <ChevronUp className="h-3 w-3 text-zinc-500 shrink-0" />
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="h-4 w-4 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 shrink-0"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </button>

      {/* Event log */}
      {expanded && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto border-t border-zinc-800 min-h-0 max-h-[calc(60dvh-36px)]"
        >
          {events.length === 0 ? (
            <p className="text-[10px] text-zinc-600 p-3 text-center font-mono">
              Waiting for events…
            </p>
          ) : (
            <div className="p-2 space-y-0.5">
              {events.map((event, i) => (
                <EventRow
                  key={i}
                  event={event}
                  colorClass={eventColor(event)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventRow({
  event,
  colorClass,
}: {
  event: TypedStreamEvent;
  colorClass: string;
}) {
  const [open, setOpen] = useState(false);

  // Collapse repetitive chunk events by default
  if (event.event === "chunk" || event.event === "heartbeat") {
    const preview =
      event.event === "chunk"
        ? `"${event.data.text.slice(0, 40)}"`
        : `ts: ${event.data.timestamp ?? ""}`;

    return (
      <div
        className={cn(
          "font-mono text-[9px] flex items-start gap-1.5 px-1 py-0.5 rounded",
          colorClass,
        )}
      >
        <span className="shrink-0 opacity-60">{event.event}</span>
        <span className="text-zinc-600 truncate">{preview}</span>
      </div>
    );
  }

  return (
    <div className="rounded bg-zinc-900/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full font-mono text-[9px] flex items-start gap-1.5 px-1 py-1 text-left",
          colorClass,
        )}
      >
        <span className="shrink-0 font-semibold">{event.event}</span>
        {!open && (
          <span className="text-zinc-600 truncate text-[9px]">
            {JSON.stringify(event.data).slice(0, 80)}
          </span>
        )}
        <span className="ml-auto shrink-0 text-zinc-600">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <pre className="text-[9px] font-mono text-zinc-400 px-2 pb-2 whitespace-pre-wrap break-all leading-relaxed">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
