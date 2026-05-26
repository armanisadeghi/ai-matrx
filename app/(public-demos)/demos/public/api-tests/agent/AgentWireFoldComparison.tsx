"use client";

import { Fragment, useMemo } from "react";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { foldBackendStreamEvents } from "@/features/tool-call-visualization/testing/stream-processing/fold-stream-events";

type WireEvent = { event: string; data: unknown };

const CELL_JSON_MAX = 4000;

function truncateJson(value: unknown, maxChars = CELL_JSON_MAX): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= maxChars) return s;
    return `${s.slice(0, maxChars)}\n… (${s.length - maxChars} more chars)`;
  } catch {
    const fallback = String(value);
    return fallback.length <= maxChars
      ? fallback
      : `${fallback.slice(0, maxChars)}…`;
  }
}

interface AgentWireFoldComparisonProps {
  events: WireEvent[];
}

/**
 * Row-aligned wire vs fold: row `i` is wire event `i` and its `arrivalTimeline[i]`
 * from `foldBackendStreamEvents` (same order as the stream).
 */
export function AgentWireFoldComparison({
  events,
}: AgentWireFoldComparisonProps) {
  const fold = useMemo(
    () => foldBackendStreamEvents(events as TypedStreamEvent[]),
    [events],
  );

  if (events.length === 0) {
    return (
      <div className="min-h-0 flex flex-col overflow-hidden p-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
          Wire → fold (0)
        </p>
        <p className="text-xs text-muted-foreground italic">No events yet…</p>
      </div>
    );
  }

  const timeline = fold.arrivalTimeline;
  const mismatch = timeline.length !== events.length;

  return (
    <div className="min-h-0 flex flex-col overflow-hidden">
      <div className="grid grid-cols-2 border-b border-border bg-muted/40 flex-shrink-0">
        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Wire ({events.length})
        </div>
        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-l border-border">
          Fold arrival ({timeline.length})
        </div>
      </div>
      {mismatch && (
        <p className="text-[10px] text-destructive px-2 py-1 border-b border-border bg-destructive/10">
          Timeline length mismatch — fold out of sync with wire list.
        </p>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2">
          {events.map((ev, i) => (
            <Fragment key={i}>
              <div className="border-b border-border p-2 align-top bg-muted/10">
                <div className="text-[10px] font-mono text-primary font-semibold mb-1">
                  {ev.event}
                </div>
                <pre className="text-[9px] font-mono leading-snug whitespace-pre-wrap break-all text-foreground/85">
                  {truncateJson({ event: ev.event, data: ev.data })}
                </pre>
              </div>
              <div className="border-b border-l border-border p-2 align-top bg-background/50">
                {timeline[i] != null ? (
                  <pre className="text-[9px] font-mono leading-snug whitespace-pre-wrap break-all text-foreground/85">
                    {truncateJson(timeline[i])}
                  </pre>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic">
                    No arrival entry
                  </p>
                )}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
