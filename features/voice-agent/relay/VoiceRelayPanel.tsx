"use client";

// features/voice-agent/relay/VoiceRelayPanel.tsx
//
// The live voice surface, pinned directly ABOVE the composer of an ordinary
// conversation (`AgentConversationColumn`'s `aboveInput` slot). Not a second
// chat, not a sidebar, not a takeover: the transcript above stays exactly as
// it is and the composer below stays usable, because the text is never hidden
// and typing must always remain available mid-session.
//
// It composes the canonical voice components — `VoiceOrb`, `VoiceStatusPill`,
// `VoiceMuteButton` — and adds no visual language of its own.
//
// SoR: common-docs/systems/agents/voice/STATE.md

import { PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceOrb } from "../components/VoiceOrb";
import { VoiceStatusPill } from "../components/VoiceStatusPill";
import { VoiceMuteButton } from "../components/VoiceMuteButton";
import type { VoiceStatus } from "../types";

export interface VoiceRelayPanelProps {
  /** The Communicator's realtime session status. */
  status: VoiceStatus;
  /** True while the PRIMARY agent (the brain) is thinking or streaming. */
  brainBusy: boolean;
  micMuted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  error?: { message: string } | null;
}

/**
 * What the orb should show.
 *
 * The brain thinking and the voice session idling are two different systems,
 * and the person cannot see either one. While the primary agent works, the
 * realtime session genuinely has nothing to do — reporting "listening" then
 * would be a lie in the most costly place, because the user would keep talking
 * into a turn that has already been sent. `thinking` is the honest state, and
 * it is the state the Communicator is mirroring over.
 */
function orbStatus(status: VoiceStatus, brainBusy: boolean): VoiceStatus {
  if (status === "error" || status === "idle") return status;
  if (status === "speaking" || status === "interrupting") return status;
  return brainBusy ? "thinking" : status;
}

export function VoiceRelayPanel({
  status,
  brainBusy,
  micMuted,
  onToggleMute,
  onEnd,
  error,
}: VoiceRelayPanelProps) {
  const shown = orbStatus(status, brainBusy);

  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <VoiceOrb status={shown} size={38} className="shrink-0" />

      <div className="min-w-0 flex-1">
        <VoiceStatusPill status={shown} micMuted={micMuted} />
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {error
            ? error.message
            : brainBusy
              ? "Your agent is working on that — keep going when you're ready."
              : "Speak naturally. You can still type below at any time."}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <VoiceMuteButton muted={micMuted} onToggle={onToggleMute} size={32} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEnd}
          className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
        >
          <PhoneOff className="h-3.5 w-3.5" />
          End
        </Button>
      </div>
    </div>
  );
}
