"use client";

// VoicePlaybackButton — header control that appears while the Agent+ voice
// reply is loading/playing and lets the user stop it from anywhere. Subscribes
// to the React-free voicePlaybackBus (the speaker instance lives in the Agent+
// tab). Renders nothing when idle so it never takes header space unnecessarily.

import { useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getVoicePlayback,
  stopVoicePlayback,
  subscribeVoicePlayback,
} from "../../state/voicePlaybackBus";

// Always rendered in the Scribe header. Idle = a dimmed speaker (so the control
// always has its place). While a voice reply is loading/playing it lights up
// and turns into a pulsing stop button that halts audio from any tab.
export function VoicePlaybackButton() {
  const state = useSyncExternalStore(
    subscribeVoicePlayback,
    getVoicePlayback,
    getVoicePlayback,
  );

  return (
    <button
      type="button"
      onClick={state.active ? stopVoicePlayback : undefined}
      disabled={!state.active}
      aria-label={state.active ? "Stop voice playback" : "No voice playing"}
      title={state.active ? "Stop voice playback" : "Voice replies play here"}
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
        state.active
          ? "bg-secondary text-secondary-foreground active:scale-95"
          : "text-muted-foreground/50",
      )}
    >
      {state.playing && (
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-secondary/40"
        />
      )}
      {state.active ? (
        <Square className="relative h-3.5 w-3.5 fill-current" />
      ) : (
        <Volume2 className="relative h-4 w-4" />
      )}
    </button>
  );
}
