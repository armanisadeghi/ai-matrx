"use client";

// features/war-room/components/tile/PulseGlyph.tsx
//
// The glanceable "is this thread alive?" glyph. Turns a TilePulse into one tight
// visual the eye reads in <100ms across a rail of 12:
//   · task with subtasks  → a progress ring (filled by completion)
//   · completed task       → a check
//   · active recording set → an animated equalizer
//   · notes only           → a filled dot
//   · empty                → a hollow ring
// Pure presentational, semantic colors only. This is what makes the peripheral
// rail tiles feel "live" instead of being a wall of identical rows.

import { Check, ListChecks, NotebookPen, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TilePulse } from "@/features/war-room/hooks/useTilePulse";

export function PulseGlyph({
  pulse,
  size = 18,
  className,
}: {
  pulse: TilePulse;
  size?: number;
  className?: string;
}) {
  // LIVE capture wins — the animated equalizer is the ONLY animated state, and
  // it requires the real recordingsSlice signal (not "has a session").
  if (pulse.isRecording) {
    return <Equalizer className={className} />;
  }

  if (pulse.hasTask) {
    if (pulse.taskDone) {
      return (
        <span
          className={cn(
            "grid place-items-center rounded-full bg-success/15 text-success",
            className,
          )}
          style={{ width: size, height: size }}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      );
    }
    if (pulse.subtaskTotal > 0) {
      return (
        <ProgressRing
          done={pulse.subtaskDone}
          total={pulse.subtaskTotal}
          size={size}
          className={className}
        />
      );
    }
    return (
      <span
        className={cn(
          "grid place-items-center rounded-full text-success",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <ListChecks className="size-3" />
      </span>
    );
  }

  if (pulse.noteChars > 0) {
    return (
      <span
        className={cn(
          "grid place-items-center rounded-full bg-info/12 text-info",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <NotebookPen className="size-3" />
      </span>
    );
  }

  // Has audio sessions / a transcript but NOT live — a quiet STATIC audio glyph
  // (no animation; it's not capturing right now).
  if (pulse.audioSessionCount > 0 || pulse.transcriptChars > 0) {
    return (
      <span
        className={cn(
          "grid place-items-center rounded-full bg-warning/12 text-warning",
          className,
        )}
        style={{ width: size, height: size }}
        title="Audio thread"
      >
        <AudioLines className="size-3" />
      </span>
    );
  }

  // Empty shell — a quiet hollow ring.
  return (
    <span
      className={cn(
        "rounded-full border-[1.5px] border-dashed border-muted-foreground/40",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}

function ProgressRing({
  done,
  total,
  size,
  className,
}: {
  done: number;
  total: number;
  size: number;
  className?: string;
}) {
  const pct = total > 0 ? done / total : 0;
  const stroke = 2.25;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const complete = done >= total && total > 0;
  return (
    <span
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
      title={`${done}/${total} subtasks`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={complete ? "text-success" : "text-primary"}
          style={{ transition: "stroke-dashoffset 350ms ease" }}
        />
      </svg>
    </span>
  );
}

function Equalizer({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-end gap-[2px] text-warning", className)}
      style={{ height: 14 }}
      title="Audio thread"
    >
      <Bar delay="0ms" h={6} />
      <Bar delay="120ms" h={12} />
      <Bar delay="240ms" h={8} />
    </span>
  );
}

function Bar({ delay, h }: { delay: string; h: number }) {
  return (
    <span
      className="w-[2.5px] rounded-full bg-current animate-pulse"
      style={{ height: h, animationDelay: delay, animationDuration: "1.1s" }}
    />
  );
}
