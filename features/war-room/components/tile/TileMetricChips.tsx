"use client";

// features/war-room/components/tile/TileMetricChips.tsx
//
// The "instrument readings" that turn a tile header into a glanceable monitor.
// A compact, single-line strip of micro-chips driven entirely by LIVE Redux
// data (via useTileMetrics): subtask progress, note fill, transcript presence,
// audio-session count, context state. Nothing here is cosmetic — every chip is
// a real reading the operator can act on without opening the tile.
//
// Hierarchy rule: chips are muted by default and only "light up" (gain a
// semantic accent) when they carry signal worth the eye — done subtasks, a live
// transcript, an overridden context. Empty readings stay quiet so the few
// meaningful ones pop. At the tightest header widths the strip self-hides the
// lowest-priority chips via container queries.

import { CheckSquare, FileText, Mic, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TileMetrics } from "@/features/war-room/hooks/useTileMetrics";

function Chip({
  Icon,
  children,
  active,
  title,
  className,
}: {
  Icon: typeof CheckSquare;
  children: React.ReactNode;
  active?: boolean;
  title: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 h-4 text-[10px] font-medium tabular-nums leading-none shrink-0 transition-colors",
        active ? "text-foreground" : "text-muted-foreground/70",
        className,
      )}
    >
      <Icon className="size-2.5 shrink-0" />
      {children}
    </span>
  );
}

export function TileMetricChips({ m }: { m: TileMetrics }) {
  return (
    <div className="flex items-center gap-1 min-w-0 overflow-hidden">
      {/* Subtask progress — lights up green when complete. */}
      {m.subtasksTotal > 0 ? (
        <Chip
          Icon={CheckSquare}
          active={m.subtasksDone > 0}
          title={`${m.subtasksDone} of ${m.subtasksTotal} subtasks complete`}
          className={cn(m.subtasksDone === m.subtasksTotal && "text-success")}
        >
          {m.subtasksDone}/{m.subtasksTotal}
        </Chip>
      ) : null}

      {/* Note fill — present only when there's real content. Hidden first when tight. */}
      {m.noteChars > 0 ? (
        <Chip
          Icon={FileText}
          active
          title={`Note has ${m.noteChars.toLocaleString()} characters`}
          className="@max-[15rem]:hidden"
        >
          {m.noteChars > 999 ? `${Math.round(m.noteChars / 100) / 10}k` : m.noteChars}
        </Chip>
      ) : null}

      {/* Transcript / audio — warning accent when a live transcript exists. */}
      {m.audioCount > 0 ? (
        <Chip
          Icon={Mic}
          active={m.hasTranscript}
          title={
            m.hasTranscript
              ? `${m.audioCount} audio session${m.audioCount > 1 ? "s" : ""} · transcript captured`
              : `${m.audioCount} audio session${m.audioCount > 1 ? "s" : ""}`
          }
          className={cn(m.hasTranscript && "text-warning", "@max-[13rem]:hidden")}
        >
          {m.audioCount > 1 ? m.audioCount : m.hasTranscript ? "•" : ""}
        </Chip>
      ) : null}

      {/* Context — only shown when set; primary when this tile overrides. */}
      {m.hasContext ? (
        <Chip
          Icon={Building2}
          active={m.contextOverridden}
          title={
            m.contextOverridden
              ? `Tile context overridden · ${m.scopeCount} scope${m.scopeCount === 1 ? "" : "s"}`
              : `Context inherited · ${m.scopeCount} scope${m.scopeCount === 1 ? "" : "s"}`
          }
          className={cn(m.contextOverridden && "text-primary", "@max-[17rem]:hidden")}
        >
          {m.scopeCount > 0 ? m.scopeCount : ""}
        </Chip>
      ) : null}
    </div>
  );
}
