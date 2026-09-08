"use client";

/**
 * MemoryEventTimeline
 *
 * Live activity feed for Observational Memory. Shows every `memory_*` stream
 * event the current conversation has emitted, newest first:
 *
 *  - context_injected  → prior observations were spliced into the prompt
 *  - observer_completed → Observer LLM extracted new observations
 *  - reflector_completed → Reflector LLM compressed observations
 *  - buffer_spawned    → async buffering task started
 *  - error             → a non-fatal memory failure (conversation continues)
 *
 * Per-event cost / tokens / duration / phase all land on one row so admins
 * can trace exactly what each turn spent on memory.
 */

import React from "react";
import {
  AlertTriangle,
  Braces,
  Clock,
  Download,
  Eye,
  Layers,
  MessageCircle,
  CircleDot,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectRecentMemoryEvents,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";
import type {
  MemoryEventEntry,
  MemoryEventKind,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.slice";
import { formatDurationMs } from "@ai-matrx/kit/format";
import {
  formatCostUsd,
  formatRelativeTime,
  formatTokens,
} from "./format";

interface MemoryEventTimelineProps {
  conversationId: string;
  /** Maximum number of events to display (defaults to 100). */
  limit?: number;
  className?: string;
}

const EVENT_META: Record<
  MemoryEventKind,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
    description: string;
  }
> = {
  context_injected: {
    label: "Context injected",
    icon: Download,
    tone: "text-blue-500 bg-blue-500/10",
    description: "Prior observations spliced into the prompt",
  },
  observer_completed: {
    label: "Observer",
    icon: Eye,
    tone: "text-emerald-500 bg-emerald-500/10",
    description: "Observer LLM extracted new observations",
  },
  reflector_completed: {
    label: "Reflector",
    icon: CircleDot,
    tone: "text-purple-500 bg-purple-500/10",
    description: "Reflector LLM compressed observations",
  },
  buffer_spawned: {
    label: "Buffer spawned",
    icon: Layers,
    tone: "text-cyan-500 bg-cyan-500/10",
    description: "Async buffering task started",
  },
  error: {
    label: "Error",
    icon: AlertTriangle,
    tone: "text-amber-500 bg-amber-500/10",
    description: "Non-fatal memory failure",
  },
};

export function MemoryEventTimeline({
  conversationId,
  limit = 100,
  className,
}: MemoryEventTimelineProps) {
  const events = useAppSelector(
    selectRecentMemoryEvents(conversationId, limit),
  );

  return (
    <div
      className={cn(
        "flex flex-col min-h-0 h-full rounded-md border border-border bg-card/60",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          Event Timeline
        </span>
        <span className="text-[11px] text-muted-foreground">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
          <Braces className="w-8 h-8 opacity-20" />
          <div className="text-xs text-center">
            No memory events yet.
            <br />
            Events stream in while the conversation is active.
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ul className="divide-y divide-border/40">
            {events.map((event) => (
              <MemoryEventRow key={event.id} event={event} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MemoryEventRow({ event }: { event: MemoryEventEntry }) {
  const meta = EVENT_META[event.kind];
  const Icon = meta.icon;

  return (
    <li className="px-3 py-2 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded shrink-0 mt-0.5",
            meta.tone,
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-foreground">{meta.label}</span>
            {event.bufferKind && (
              <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">
                {event.bufferKind}
              </span>
            )}
            {event.phase && (
              <span className="font-mono text-[10px] text-amber-500 bg-amber-500/10 px-1 rounded">
                {event.phase}
              </span>
            )}
            {event.model && (
              <span
                className="font-mono text-[10px] text-muted-foreground truncate"
                title={event.model}
              >
                {event.model}
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
              {formatRelativeTime(event.receivedAt)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {typeof event.cost === "number" && (
              <Stat
                label="cost"
                value={formatCostUsd(event.cost, 5)}
                mono
                tone="emerald"
              />
            )}
            {typeof event.inputTokens === "number" && (
              <Stat
                label="in"
                value={formatTokens(event.inputTokens)}
                mono
              />
            )}
            {typeof event.outputTokens === "number" && (
              <Stat
                label="out"
                value={formatTokens(event.outputTokens)}
                mono
              />
            )}
            {typeof event.durationMs === "number" && event.durationMs !== null && (
              <Stat
                label={
                  <span className="inline-flex items-center gap-0.5">
                    <Timer className="w-3 h-3" />
                  </span>
                }
                value={formatDurationMs(event.durationMs, { style: "compact" })}
                mono
              />
            )}
            {typeof event.observationChars === "number" && (
              <Stat
                label="chars"
                value={formatTokens(event.observationChars)}
                mono
              />
            )}
            {event.requestId && (
              <Stat
                label={
                  <span className="inline-flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    req
                  </span>
                }
                value={event.requestId.slice(0, 8)}
                mono
                title={event.requestId}
              />
            )}
          </div>

          {event.error && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400 font-mono whitespace-pre-wrap break-words">
              {event.error}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  mono,
  tone,
  title,
}: {
  label: React.ReactNode;
  value: string;
  mono?: boolean;
  tone?: "emerald";
  title?: string;
}) {
  return (
    <span className="inline-flex items-center gap-0.5" title={title}>
      <span className="text-muted-foreground/80">{label}:</span>
      <span
        className={cn(
          mono && "font-mono",
          tone === "emerald" && "text-emerald-500",
          !tone && "text-foreground",
        )}
      >
        {value}
      </span>
    </span>
  );
}
