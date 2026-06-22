"use client";
// features/voice-agent/components/VoiceControlCluster.tsx
//
// Session toggle (AudioLines / stop) + optional mute control. Mute sits
// to the left of the main button and only appears while a session is live.

import { cn } from "@/lib/utils";
import type { VoiceStatus } from "../types";
import { VoiceMicButton } from "./VoiceMicButton";
import { VoiceMuteButton } from "./VoiceMuteButton";

interface VoiceControlClusterProps {
  status: VoiceStatus;
  micMuted: boolean;
  onToggleSession: () => void;
  onToggleMute: () => void;
  className?: string;
}

function isLiveSession(status: VoiceStatus): boolean {
  return (
    status === "listening" ||
    status === "thinking" ||
    status === "speaking" ||
    status === "interrupting"
  );
}

export function VoiceControlCluster({
  status,
  micMuted,
  onToggleSession,
  onToggleMute,
  className,
}: VoiceControlClusterProps) {
  const showMute = isLiveSession(status);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {showMute ? (
        <VoiceMuteButton muted={micMuted} onToggle={onToggleMute} />
      ) : null}
      <VoiceMicButton status={status} onToggle={onToggleSession} />
    </div>
  );
}
