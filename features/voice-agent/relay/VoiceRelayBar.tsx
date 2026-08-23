"use client";

// features/voice-agent/relay/VoiceRelayBar.tsx
//
// The generic drop-in voice control for ANY conversation surface (Arman's
// ruling 2: voice lives wherever a real conversation happens, layered onto
// the surface — the text is never hidden, this bar sits beside it). One
// compact row: enable → mic → status → mute. Resolves the Communicator via
// Mandate `voice.communicator` and REFUSES (with the reason) when it cannot.
//
// Mount it with the SAME surfaceKey as the surface's conversation column so
// spoken and typed turns share one conversation. First consumer: the
// Masterwork Scout interview panel. SoR:
// common-docs/systems/agents/voice/STATE.md

import { useState } from "react";
import { Mic, Square, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMandate } from "@/features/agents/mandates/useMandate";
import { VoiceMuteButton } from "../components/VoiceMuteButton";
import type { SourceFeature } from "@/types/python-generated/source-attribution";
import type { QuestionPacing } from "./types";
import {
  useVoiceRelaySession,
  VOICE_COMMUNICATOR_MANDATE_KEY,
} from "./useVoiceRelaySession";

export interface VoiceRelayBarProps {
  /** The brain — the surface's primary agent. */
  primaryAgentId: string;
  /**
   * The surface's LIVE conversation. Pass it whenever the surface owns one
   * (pins the relay to the right brain even while surface focus catches up).
   */
  conversationId?: string;
  /** MUST match the surface's conversation column so turns are shared. */
  surfaceKey: string;
  sourceFeature: SourceFeature;
  /** Surface default per ruling 3. */
  questionPacing?: QuestionPacing;
  /**
   * `bar` draws the standalone section chrome. `toolbar` embeds the same
   * controls in an existing toolbar without adding another layout row.
   */
  variant?: "bar" | "toolbar";
}

function ActiveVoiceRelay({
  communicatorAgentId,
  primaryAgentId,
  conversationId,
  surfaceKey,
  sourceFeature,
  questionPacing,
}: VoiceRelayBarProps & { communicatorAgentId: string }) {
  const relay = useVoiceRelaySession({
    communicatorAgentId,
    primaryAgentId,
    conversationId,
    surfaceKey,
    sourceFeature,
    questionPacing,
  });
  const live = relay.status !== "idle" && relay.status !== "error";

  return (
    <>
      <Button
        size="sm"
        variant={live ? "destructive" : "default"}
        onClick={relay.toggle}
      >
        {live ? (
          <>
            <Square className="mr-1.5 h-3.5 w-3.5" /> End voice
          </>
        ) : (
          <>
            <Mic className="mr-1.5 h-3.5 w-3.5" /> Talk
          </>
        )}
      </Button>
      {live ? (
        // The canonical mute control — state-correct icon + aria-label.
        <VoiceMuteButton
          muted={relay.micMuted}
          onToggle={relay.toggleMute}
          size={30}
        />
      ) : null}
      <span className="text-xs text-muted-foreground">
        {relay.error
          ? relay.error.message
          : relay.brainBusy
            ? "thinking…"
            : relay.status}
      </span>
    </>
  );
}

export function VoiceRelayBar(props: VoiceRelayBarProps) {
  const [enabled, setEnabled] = useState(false);
  const communicator = useMandate(VOICE_COMMUNICATOR_MANDATE_KEY);

  return (
    <div
      className={
        props.variant === "toolbar"
          ? "flex items-center gap-1"
          : "flex items-center gap-2 border-b border-border px-3 py-1.5"
      }
    >
      {!enabled ? (
        <Button size="sm" variant="ghost" onClick={() => setEnabled(true)}>
          <AudioLines className="mr-1.5 h-3.5 w-3.5" /> Voice
        </Button>
      ) : communicator.loading ? (
        <span className="text-xs text-muted-foreground">
          Connecting the voice layer…
        </span>
      ) : communicator.error || !communicator.mandate ? (
        // An unresolvable mandate REFUSES loudly — no fallback persona, ever.
        <span className="text-xs text-destructive">
          Voice is unavailable: {communicator.error ?? "no Communicator bound"}
        </span>
      ) : (
        <ActiveVoiceRelay
          {...props}
          communicatorAgentId={communicator.mandate.agentId}
        />
      )}
    </div>
  );
}
