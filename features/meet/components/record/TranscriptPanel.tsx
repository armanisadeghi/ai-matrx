"use client";

// features/meet/components/record/TranscriptPanel.tsx
//
// THE TRANSCRIPT AS A PERSON USES IT (Meet wave 3): speaker names, the clock,
// search within (match count, previous / next, every hit highlighted), and a
// line said while the recording ran plays from that moment. While the video
// plays, the line being spoken is marked. `?t=<line id>` (a search result, a
// link someone sent) scrolls to that line and marks it.
//
// Grouping and search are the package's (`groupTranscript`,
// `searchTranscript`, `recordingOffsetMs`) so every client agrees on them.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Play, Search, X } from "lucide-react";
import {
  absenceSentence,
  clockPosition,
  groupTranscript,
  recordingOffsetMs,
  searchTranscript,
  type MeetingRecordBundle,
  type TranscriptMatch,
} from "@ai-matrx/meet/react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function clockOfDay(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function Highlighted({
  text,
  ranges,
  current,
}: {
  text: string;
  ranges: TranscriptMatch["ranges"] | undefined;
  current: boolean;
}) {
  if (!ranges || ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  ranges.forEach(([start, end], index) => {
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <mark
        key={index}
        className={cn(
          "rounded-sm px-0.5 text-foreground",
          current ? "bg-amber-400/70" : "bg-amber-300/40",
        )}
      >
        {text.slice(start, end)}
      </mark>,
    );
    last = end;
  });
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function TranscriptPanel({
  bundle,
  focusId,
  currentMs,
  onSeek,
}: {
  bundle: MeetingRecordBundle;
  focusId: string | null;
  currentMs: number | null;
  onSeek: (ms: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const lineRefs = useRef(new Map<string, HTMLElement>());
  const blocks = groupTranscript(bundle.transcript, bundle.names);
  const matches = searchTranscript(bundle.transcript, query, bundle.names);
  const byId = new Map(matches.map((m) => [m.segmentId, m]));
  const currentMatch =
    matches.length > 0 ? matches[Math.min(cursor, matches.length - 1)] : null;
  const currentMatchId = currentMatch?.segmentId ?? null;

  // The line being spoken right now: the last one that started before the playhead.
  let speaking: string | null = null;
  if (currentMs !== null) {
    for (const line of bundle.transcript) {
      const offset = recordingOffsetMs(line.startedAt, bundle.recording);
      if (offset !== null && offset <= currentMs) speaking = line.id;
    }
  }

  useEffect(() => {
    if (focusId)
      lineRefs.current
        .get(focusId)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId]);

  useEffect(() => {
    if (currentMatchId)
      lineRefs.current
        .get(currentMatchId)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentMatchId]);

  const move = (step: number) =>
    setCursor((c) =>
      matches.length === 0 ? 0 : (c + step + matches.length) % matches.length,
    );

  if (blocks.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {absenceSentence(
          bundle,
          "transcript",
          "No transcript was captured for this meeting.",
        )}
      </p>
    );
  }

  const covered = bundle.transcript.filter(
    (line) => recordingOffsetMs(line.startedAt, bundle.recording) !== null,
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                move(e.shiftKey ? -1 : 1);
              }
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Search the transcript"
            aria-label="Search the transcript"
            className="h-8 pl-8 pr-7 text-sm"
          />
          {query ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {query.trim() ? (
          <>
            <span
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {matches.length === 0
                ? "No matches"
                : `${Math.min(cursor, matches.length - 1) + 1} of ${matches.length}`}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => move(-1)}
              disabled={matches.length === 0}
              aria-label="Previous match"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => move(1)}
              disabled={matches.length === 0}
              aria-label="Next match"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">
            {bundle.transcript.length} lines
          </span>
        )}
      </div>
      {bundle.recording?.state === "available" &&
      covered > 0 &&
      covered < bundle.transcript.length ? (
        <p className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          The recording covers {covered} of {bundle.transcript.length} lines.
          Lines with a play time jump to that moment.
        </p>
      ) : null}
      {bundle.transcript.length >= 1000 ? (
        <p className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          Showing the first 1,000 lines of this transcript.
        </p>
      ) : null}
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {blocks.map((block) => (
          <li key={block.id}>
            <p className="mb-0.5 flex items-baseline gap-2 text-xs">
              <span className="font-medium text-foreground">
                {block.speaker}
              </span>
              <time
                dateTime={block.startedAt}
                className="text-muted-foreground"
              >
                {clockOfDay(block.startedAt)}
              </time>
            </p>
            {block.lines.map((line) => {
              const offset = recordingOffsetMs(
                line.startedAt,
                bundle.recording,
              );
              const match = byId.get(line.id);
              const isCurrentMatch = currentMatchId === line.id;
              const focused = focusId === line.id;
              return (
                <p
                  key={line.id}
                  id={`line-${line.id}`}
                  ref={(el) => {
                    if (el) lineRefs.current.set(line.id, el);
                    else lineRefs.current.delete(line.id);
                  }}
                  className={cn(
                    "group -mx-1.5 flex gap-2 rounded px-1.5 py-0.5 text-sm leading-relaxed",
                    speaking === line.id && "bg-primary/10",
                    focused && "bg-primary/5 ring-1 ring-primary/50",
                    isCurrentMatch && "bg-amber-400/10",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <Highlighted
                      text={line.text}
                      ranges={match?.ranges}
                      current={isCurrentMatch}
                    />
                  </span>
                  {offset !== null ? (
                    <button
                      type="button"
                      onClick={() => onSeek(offset)}
                      className="flex shrink-0 items-center gap-0.5 self-start rounded px-1 text-[11px] tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={`Play from ${clockPosition(offset)}`}
                      title="Play the recording from here"
                    >
                      <Play className="h-3 w-3" aria-hidden="true" />
                      {clockPosition(offset)}
                    </button>
                  ) : null}
                </p>
              );
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}
