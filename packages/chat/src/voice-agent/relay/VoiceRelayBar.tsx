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
// common-docs/systems/chat/voice/STATE.md

import { useEffect, useRef, useState } from "react";
import { Mic, Square, AudioLines } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { useMandate } from "../../mandates/useMandate";
import { VoiceMuteButton } from "../components/VoiceMuteButton";
import type { SourceFeature } from "@ai-matrx/agents/generated/source-attribution";
import type { QuestionPacing } from "./types";
import {
  useVoiceRelaySession,
  VOICE_COMMUNICATOR_MANDATE_KEY,
} from "./useVoiceRelaySession";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";

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
   * `composer` is the Smart Agent Input's "Live audio": idle it is ONE icon
   * button beside the mic (no word, no extra width); pressed, the same live
   * controls as `toolbar` (Arman, 2026-10-07: one voice control per surface).
   */
  variant?: "bar" | "toolbar" | "composer";
  /** Controlled on/off (the composer's + menu turns it on when the row is folded). */
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}

function ActiveVoiceRelay({
  communicatorAgentId,
  primaryAgentId,
  conversationId,
  surfaceKey,
  sourceFeature,
  questionPacing,
  onEnd,
  autoStart,
}: VoiceRelayBarProps & { communicatorAgentId: string; onEnd?: () => void; autoStart?: boolean }) {
  const relay = useVoiceRelaySession({
    communicatorAgentId,
    primaryAgentId,
    conversationId,
    surfaceKey,
    sourceFeature,
    questionPacing,
  });
  const live = relay.status !== "idle" && relay.status !== "error";
  // The composer's Live audio press IS the request to talk: start once, no
  // second "Talk" press.
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    relay.toggle();
  }, [autoStart, relay]);

  return (
    <>
      <Button
        variant={live ? "danger" : "primary"}
        icon={live ? <Square /> : <Mic />}
        onClick={() => {
          relay.toggle();
          // Ending voice puts the composer's control back to its one icon.
          if (live) onEnd?.();
        }}
      >
        {live ? "End voice" : "Talk"}
      </Button>
      {live ? (
        // The canonical mute control — state-correct icon + aria-label.
        <VoiceMuteButton
          muted={relay.micMuted}
          onToggle={relay.toggleMute}
          size={30}
        />
      ) : null}
      {/* A state word only when it says something: "idle" beside "Talk"
          says nothing. */}
      {relay.error || relay.brainBusy || relay.status !== "idle" ? (
        <span className="text-xs text-muted-foreground">
          {relay.error
            ? relay.error.message
            : relay.brainBusy
              ? "thinking…"
              : relay.status}
        </span>
      ) : null}
    </>
  );
}

export function VoiceRelayBar(props: VoiceRelayBarProps) {
  const [ownEnabled, setOwnEnabled] = useState(false);
  const enabled = props.enabled ?? ownEnabled;
  const setEnabled = (next: boolean) => {
    if (props.enabled === undefined) setOwnEnabled(next);
    props.onEnabledChange?.(next);
  };

  // Idle costs nothing: the Communicator is resolved only once voice is on,
  // so a page full of composers never fetches it.
  if (!enabled && props.variant === "composer") {
    return (
      <Button
        variant="quiet"
        icon={<AudioLines />}
        aria-label="Live audio"
        title="Live audio — talk and hear the answer"
        onClick={() => setEnabled(true)}
      />
    );
  }

  return (
    <div
      className={
        props.variant === "toolbar" || props.variant === "composer"
          ? "flex items-center gap-1"
          : "flex items-center gap-2 border-b border-border px-3 py-1.5"
      }
    >
      {!enabled ? (
        <Button icon={<AudioLines />} variant="quiet" onClick={() => setEnabled(true)}> Voice
        </Button>
      ) : (
        <EnabledVoiceRelay
          {...props}
          onEnd={props.variant === "composer" ? () => setEnabled(false) : undefined}
        />
      )}
    </div>
  );
}

function EnabledVoiceRelay(props: VoiceRelayBarProps & { onEnd?: () => void }) {
  const communicator = useMandate(VOICE_COMMUNICATOR_MANDATE_KEY);
  if (communicator.loading) {
    return <span className="text-xs text-muted-foreground">Connecting the voice layer…</span>;
  }
  if (communicator.error || !communicator.mandate) {
    // An unresolvable mandate REFUSES loudly — no fallback persona, ever.
    return (
      <span className="text-xs text-destructive">
        Voice is unavailable: {communicator.error ?? "no Communicator bound"}
        <ErrorAlchemyMenu error={communicator.error} />
      </span>
    );
  }
  return (
    <ActiveVoiceRelay
      {...props}
      communicatorAgentId={communicator.mandate.agentId}
      autoStart={props.variant === "composer"}
    />
  );
}
