"use client";

/**
 * AudioCitationBlock — renders an agent's `<audiocite>` reference to a moment in
 * a scribe session's audio as a clickable chip. Click → seek the one shared
 * SessionAudioPlayer to that instant and play (auto-pausing at the cited end).
 *
 * The agent emits, inline in its reply:
 *   <audiocite start="125.4" end="138.0">where I described the pricing model</audiocite>
 *
 * `start`/`end` are session-relative seconds (the studio's single coordinate
 * system). The session id comes from `ScribeCitationContext` (the active scribe
 * session) unless the tag carries an explicit `session="…"` attribute — so a
 * citation is portable but needs no id in the common case.
 *
 * Decoupled from the player via `scribeAudioBus`: the citation lives in the
 * agent conversation subtree, the player is mounted elsewhere (and may be on an
 * inactive tab); the bus carries the seek across.
 */

import { Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { requestScribeAudioSeek } from "@/features/transcript-studio/state/scribeAudioBus";
import { useScribeCitationSessionId } from "@/features/transcript-studio/state/ScribeCitationContext";

interface AudioCitationBlockProps {
  /** Cited label (the tag body). */
  content: string;
  /** Attributes parsed from the opening tag: start, end, session. */
  metadata?: Record<string, string>;
}

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioCitationBlock({
  content,
  metadata,
}: AudioCitationBlockProps) {
  const contextSessionId = useScribeCitationSessionId();
  const start = Number.parseFloat(metadata?.start ?? "");
  const endRaw = Number.parseFloat(metadata?.end ?? "");
  const end = Number.isFinite(endRaw) ? endRaw : undefined;
  const sessionId = metadata?.session || contextSessionId;

  const label = (content || "").trim();
  const hasValidTime = Number.isFinite(start) && start >= 0;
  const playable = Boolean(sessionId) && hasValidTime;

  const onPlay = () => {
    if (!playable || !sessionId) return;
    requestScribeAudioSeek({
      sessionId,
      sessionSeconds: start,
      endSeconds: end,
      autoplay: true,
    });
  };

  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={!playable}
      title={
        playable
          ? `Play audio from ${formatClock(start)}${end != null ? `–${formatClock(end)}` : ""}`
          : "Audio reference"
      }
      className={cn(
        "my-0.5 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 align-baseline text-sm transition-colors",
        playable
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Volume2 className="h-3.5 w-3.5 shrink-0" />
      {label && <span className="truncate">{label}</span>}
      {hasValidTime && (
        <span className="shrink-0 font-mono text-xs tabular-nums opacity-80">
          {formatClock(start)}
        </span>
      )}
    </button>
  );
}

export default AudioCitationBlock;
