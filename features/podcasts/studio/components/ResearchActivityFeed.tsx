"use client";

// features/podcasts/studio/components/ResearchActivityFeed.tsx
//
// Shows the REAL tool activity streaming off the backend during a run — the
// actual search queries, the actual URLs being read, the actual scrape tallies.
//
// This is strictly ADDITIVE. The stage rail's synthetic sub-steps
// (useStageDisplay) remain the guaranteed floor that always shows motion no
// matter what the stream does; this panel is extra truth layered on top. It
// renders NOTHING when the backend sends no tool events, so a silent backend
// degrades to exactly the previous behaviour rather than an empty shell.
//
// Ordering is deliberately "as it arrives" — the backend emits these in bursts
// (all "Browsing {url}" lines fire up front at task creation, then a quiet gap
// across the scrape gather). That's fine: this is a live log, not a checklist.

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Globe,
  Loader2,
  Search,
} from "lucide-react";
import type { ResearchActivityEntry } from "@/features/podcasts/studio/runs/useStudioRun";

type ActivityVisualState = "active" | "complete" | "error" | "history";

/**
 * Resolve visual lifecycle from the canonical call_id, not from one event in
 * isolation. A tool's old progress messages become history as soon as a later
 * tool_completed/tool_error arrives, so they can never keep spinning forever.
 */
export function activityVisualStates(
  entries: ResearchActivityEntry[],
  streaming: boolean,
): Map<string, ActivityVisualState> {
  const terminalByCall = new Map<string, "complete" | "error">();
  const latestNonTerminalByCall = new Map<string, string>();

  for (const entry of entries) {
    if (entry.event === "tool_completed") {
      terminalByCall.set(entry.callId, "complete");
    } else if (entry.event === "tool_error") {
      terminalByCall.set(entry.callId, "error");
    } else {
      latestNonTerminalByCall.set(entry.callId, entry.id);
    }
  }

  const states = new Map<string, ActivityVisualState>();
  for (const entry of entries) {
    const terminal = terminalByCall.get(entry.callId);
    if (entry.event === "tool_error") states.set(entry.id, "error");
    else if (entry.event === "tool_completed") states.set(entry.id, "complete");
    else if (terminal === "complete") states.set(entry.id, "complete");
    else if (terminal === "error") states.set(entry.id, "history");
    else if (
      streaming &&
      latestNonTerminalByCall.get(entry.callId) === entry.id
    )
      states.set(entry.id, "active");
    else states.set(entry.id, "history");
  }
  return states;
}

function iconFor(
  entry: ResearchActivityEntry,
  visualState: ActivityVisualState,
) {
  if (entry.event === "tool_error") {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  }
  if (entry.event === "tool_completed") {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  }
  if (entry.message.startsWith("Browsing ")) {
    return <Globe className="h-3.5 w-3.5 shrink-0 text-sky-500" />;
  }
  if (entry.message.startsWith("Searched:")) {
    return <Search className="h-3.5 w-3.5 shrink-0 text-primary" />;
  }
  if (visualState === "active") {
    return (
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
    );
  }
  if (visualState === "error") {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  }
  if (visualState === "complete") {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  }
  return (
    <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
  );
}

export function ResearchActivityFeed({
  entries,
  streaming,
}: {
  entries: ResearchActivityEntry[];
  streaming: boolean;
}) {
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const count = entries.length;
  const visualStates = activityVisualStates(entries, streaming);

  // Keep the newest line in view while the run is live. Only auto-scroll when
  // the user is already near the bottom, so scrolling back to read something
  // isn't yanked away by the next event.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [count, open]);

  // Nothing real to show → render nothing. The stage rail still carries the UI.
  if (count === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        {streaming ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-foreground/80">
          Live activity
        </span>
        <span className="text-xs text-muted-foreground">{count}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          ref={scrollRef}
          className="max-h-64 space-y-1.5 overflow-y-auto border-t border-border px-4 py-2.5"
        >
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2 text-xs text-muted-foreground"
            >
              <span className="mt-0.5">
                {iconFor(entry, visualStates.get(entry.id) ?? "history")}
              </span>
              <span className="min-w-0 break-words">{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
