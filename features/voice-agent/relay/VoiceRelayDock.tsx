"use client";

// features/voice-agent/relay/VoiceRelayDock.tsx
//
// The voice layer as a dock pinned above an existing conversation's composer.
// Idle it is one quiet invitation; live it is `VoiceRelayPanel`. Either way the
// conversation above and the composer below are untouched — the whole point of
// the layer is that it is an OPTION on a normal conversation, never a takeover.
//
// It binds to a conversation the HOST already owns (`conversationId` is
// required, not resolved): the host's launcher is the one source of that
// conversation, so voice and text share it and one answer can never render in
// two places.
//
// SoR: common-docs/systems/agents/voice/STATE.md

import { AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMandate } from "@/features/agents/mandates/useMandate";
import type { SourceFeature } from "@/types/python-generated/source-attribution";
import { VoiceRelayPanel } from "./VoiceRelayPanel";
import {
  useVoiceRelaySession,
  VOICE_COMMUNICATOR_MANDATE_KEY,
} from "./useVoiceRelaySession";
import type { QuestionPacing } from "./types";

export interface VoiceRelayDockProps {
  /** The brain — the agent this conversation belongs to. */
  primaryAgentId: string;
  /** The host's OWN conversation. Required: never resolve a second one here. */
  conversationId: string;
  /** MUST be the host's surface key so voice and text share the conversation. */
  surfaceKey: string;
  sourceFeature: SourceFeature;
  questionPacing?: QuestionPacing;
}

function ActiveDock({
  communicatorAgentId,
  primaryAgentId,
  conversationId,
  surfaceKey,
  sourceFeature,
  questionPacing,
}: VoiceRelayDockProps & { communicatorAgentId: string }) {
  const relay = useVoiceRelaySession({
    communicatorAgentId,
    primaryAgentId,
    conversationId,
    surfaceKey,
    sourceFeature,
    questionPacing,
  });

  const live = relay.status !== "idle" && relay.status !== "error";

  if (!live) {
    return (
      <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card/60 px-3 py-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {relay.error
            ? relay.error.message
            : "Talk instead of typing — your agent answers out loud, and everything still shows up here as text."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={relay.toggle}
          className="h-8 shrink-0 gap-1.5"
        >
          <AudioLines className="h-3.5 w-3.5" />
          Start talking
        </Button>
      </div>
    );
  }

  return (
    <VoiceRelayPanel
      status={relay.status}
      brainBusy={relay.brainBusy}
      micMuted={relay.micMuted}
      onToggleMute={relay.toggleMute}
      onEnd={relay.toggle}
      error={relay.error}
    />
  );
}

export function VoiceRelayDock(props: VoiceRelayDockProps) {
  // The Communicator is a DB agent behind a Mandate. No fallback persona: if
  // it cannot resolve, the dock says so and offers nothing.
  const communicator = useMandate(VOICE_COMMUNICATOR_MANDATE_KEY);

  if (communicator.loading) return null;

  if (communicator.error || !communicator.mandate) {
    return (
      <div className="mb-2 rounded-xl border border-destructive/40 bg-card px-3 py-2 text-xs text-destructive">
        Voice is unavailable: the Communicator ({VOICE_COMMUNICATOR_MANDATE_KEY})
        did not resolve
        {communicator.error ? ` — ${communicator.error}` : ""}. Typing works as
        normal.
      </div>
    );
  }

  return (
    <ActiveDock {...props} communicatorAgentId={communicator.mandate.agentId} />
  );
}
