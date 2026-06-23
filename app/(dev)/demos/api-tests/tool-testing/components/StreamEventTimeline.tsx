"use client";

import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Wifi,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import type { ToolStreamEvent } from "@/features/tool-call-visualization/testing/types";

// ─── Event icon/color mapping ───────────────────────────────────────────────

function getEventIcon(eventType: string) {
  switch (eventType) {
    case "tool_started":
      return <Play className="h-3 w-3 text-primary" />;
    case "tool_progress":
      return <Loader2 className="h-3 w-3 text-info animate-spin" />;
    case "tool_step":
      return <ArrowRight className="h-3 w-3 text-info" />;
    case "tool_result_preview":
      return <Eye className="h-3 w-3 text-warning" />;
    case "tool_completed":
      return <CheckCircle className="h-3 w-3 text-success" />;
    case "tool_error":
      return <XCircle className="h-3 w-3 text-destructive" />;
    case "phase":
      return <Wifi className="h-3 w-3 text-muted-foreground" />;
    case "reasoning_chunk":
      return <Loader2 className="h-3 w-3 text-info" />;
    case "warning":
      return <AlertTriangle className="h-3 w-3 text-warning" />;
    case "info":
      return <ArrowRight className="h-3 w-3 text-info" />;
    case "init":
      return <Play className="h-3 w-3 text-primary" />;
    case "record_reserved":
      return <ArrowRight className="h-3 w-3 text-muted-foreground" />;
    case "record_update":
      return <ArrowRight className="h-3 w-3 text-muted-foreground" />;
    case "resource_changed":
      return <ArrowRight className="h-3 w-3 text-fuchsia-400" />;
    case "error":
      return <AlertTriangle className="h-3 w-3 text-destructive" />;
    default:
      return <ArrowRight className="h-3 w-3 text-muted-foreground" />;
  }
}

function getEventBadgeVariant(
  eventType: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (eventType) {
    case "tool_completed":
      return "default";
    case "tool_error":
    case "error":
      return "destructive";
    case "tool_started":
    case "tool_progress":
    case "tool_step":
      return "secondary";
    default:
      return "outline";
  }
}

function formatTimestamp(ts: number, startTs: number | null): string {
  if (!startTs) return `${ts.toFixed(3)}s`;
  const diff = ts - startTs;
  if (diff < 0) return `${ts.toFixed(3)}s`;
  return `+${diff.toFixed(2)}s`;
}

// ─── Timeline Entry ─────────────────────────────────────────────────────────

function TimelineEntry({
  event,
  startTimestamp,
  index,
}: {
  event: {
    type: string;
    eventName: string;
    message: string | null;
    timestamp: number | null;
    data: Record<string, unknown>;
  };
  startTimestamp: number | null;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasData = Object.keys(event.data).length > 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(event.data, null, 2));
      setCopied(true);
      toast.success("Copied event data");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div
      className="animate-in fade-in slide-in-from-left duration-200"
      style={{
        animationDelay: `${index * 30}ms`,
        animationFillMode: "backwards",
      }}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group cursor-pointer">
          {/* Connector dot */}
          <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
            {getEventIcon(event.eventName)}
          </div>
          {/* Badge */}
          <Badge
            variant={getEventBadgeVariant(event.eventName)}
            className="text-[9px] px-1 py-0 font-mono flex-shrink-0"
          >
            {event.eventName}
          </Badge>
          {/* Message */}
          <span className="text-xs text-foreground/80 truncate flex-1 min-w-0">
            {event.message || "—"}
          </span>
          {/* Timestamp */}
          {event.timestamp && (
            <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
              {formatTimestamp(event.timestamp, startTimestamp)}
            </span>
          )}
          {/* Expand indicator */}
          {hasData && (
            <span className="flex-shrink-0 text-muted-foreground">
              {open ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </span>
          )}
        </CollapsibleTrigger>
        {hasData && (
          <CollapsibleContent>
            <div className="ml-7 mr-2 mb-1 rounded border border-border bg-muted/30 p-2 relative">
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-1 right-1 h-6 w-6 p-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
              <pre className="text-[10px] font-mono whitespace-pre-wrap text-foreground/70 max-h-[200px] overflow-y-auto pr-6">
                {JSON.stringify(event.data, null, 2)}
              </pre>
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface StreamEventTimelineProps {
  toolEvents: ToolStreamEvent[];
  rawLines: TypedStreamEvent[];
  isRunning: boolean;
}

export function StreamEventTimeline({
  toolEvents,
  rawLines,
  isRunning,
}: StreamEventTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Combine both tool events and raw non-tool events into a unified timeline
  const timelineEntries = rawLines.map((line) => {
    if (line.event === "tool_event") {
      const te = line.data as unknown as ToolStreamEvent;
      return {
        type: "tool_event",
        eventName: te.event,
        message: te.message,
        timestamp: te.timestamp,
        data: te.data,
      };
    }
    return {
      type: line.event,
      eventName: line.event,
      message:
        typeof line.data === "object" && line.data !== null
          ? (((line.data as Record<string, unknown>).message as
              | string
              | null) ??
            ((line.data as Record<string, unknown>).status as string | null) ??
            null)
          : null,
      timestamp: null,
      data: (line.data as Record<string, unknown>) ?? {},
    };
  });

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timelineEntries.length]);

  const startTimestamp = toolEvents.length > 0 ? toolEvents[0].timestamp : null;

  if (timelineEntries.length === 0 && !isRunning) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
        <Wifi className="h-6 w-6 opacity-40" />
        <p className="text-xs">
          No stream events yet. Execute a tool to see events here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header stats */}
      <div className="flex-shrink-0 flex items-center gap-3 px-2 py-1.5 border-b text-[10px] text-muted-foreground font-mono">
        <span>Events: {timelineEntries.length}</span>
        <span>Tool events: {toolEvents.length}</span>
        {isRunning && (
          <span className="flex items-center gap-1 text-primary">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            Streaming...
          </span>
        )}
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="py-1 space-y-0">
          {timelineEntries.map((entry, idx) => (
            <TimelineEntry
              key={idx}
              event={entry}
              startTimestamp={startTimestamp}
              index={idx}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
