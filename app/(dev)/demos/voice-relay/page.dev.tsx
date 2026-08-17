"use client";

// /demos/voice-relay — Voice Communication Layer test surface.
//
// A realtime voice model (the Communicator, Mandate `voice.communicator`)
// speaks FOR a primary text agent: your speech routes to the primary agent,
// and the Communicator delivers its answers — one question at a time, with
// the question ledger. SoR:
// common-docs/systems/voice-communication-layer/FEATURE.md
//
// Pick any agent as the brain, tap the mic, and talk. The right pane is the
// primary agent's ordinary conversation (you can also type into it) — proof
// that the voice layer is an OPTION layered on top of a normal conversation.

import { useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMandate } from "@/features/agents/mandates/useMandate";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import {
  useVoiceRelaySession,
  VOICE_COMMUNICATOR_MANDATE_KEY,
} from "@/features/voice-agent/relay/useVoiceRelaySession";

// Registered source_feature (aidream-generated allow-list) — the voice-agent
// product feature is exactly what this surface is.
const SOURCE_FEATURE = "voice-agent" as const;

function RelayRoom({
  communicatorAgentId,
  primaryAgentId,
}: {
  communicatorAgentId: string;
  primaryAgentId: string;
}) {
  const surfaceKey = `voice-relay-demo:${primaryAgentId}`;
  const relay = useVoiceRelaySession({
    communicatorAgentId,
    primaryAgentId,
    surfaceKey,
    sourceFeature: SOURCE_FEATURE,
  });

  const live =
    relay.status !== "idle" && relay.status !== "error";

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex w-64 shrink-0 flex-col gap-3">
        <Button onClick={relay.toggle} variant={live ? "destructive" : "default"}>
          {live ? (
            <>
              <Square className="mr-2 h-4 w-4" /> End voice session
            </>
          ) : (
            <>
              <Mic className="mr-2 h-4 w-4" /> Start voice session
            </>
          )}
        </Button>
        {live ? (
          <Button variant="outline" onClick={relay.toggleMute}>
            {relay.micMuted ? (
              <>
                <Mic className="mr-2 h-4 w-4" /> Unmute mic
              </>
            ) : (
              <>
                <MicOff className="mr-2 h-4 w-4" /> Mute mic
              </>
            )}
          </Button>
        ) : null}
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Voice</span>
            <span className="text-foreground">{relay.status}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">Primary agent</span>
            <span className="text-foreground">
              {relay.brainBusy ? "thinking" : "ready"}
            </span>
          </div>
        </div>
        {relay.error ? (
          <div className="rounded-md border border-destructive/40 bg-card p-3 text-sm text-destructive">
            {relay.error.message}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        {relay.primaryConversationId ? (
          <AgentConversationColumn
            conversationId={relay.primaryConversationId}
            surfaceKey={surfaceKey}
            smartInputProps={{ variablesPanelStyle: "hidden" }}
          />
        ) : (
          <Skeleton className="h-full w-full" />
        )}
      </div>
    </div>
  );
}

export default function VoiceRelayDemoPage() {
  const communicator = useMandate(VOICE_COMMUNICATOR_MANDATE_KEY);
  const [primaryAgentId, setPrimaryAgentId] = useState("");
  const [activePrimary, setActivePrimary] = useState<string | null>(null);

  return (
    <div className="flex h-dvh flex-col gap-3 bg-textured p-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Voice Communication Layer
        </h1>
        <p className="text-sm text-muted-foreground">
          The Communicator (realtime voice) speaks for the primary agent you
          pick — your speech routes to the primary agent; the voice model never
          answers on its own.
        </p>
      </div>

      {communicator.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-96" />
          <Skeleton className="h-9 w-64" />
        </div>
      ) : communicator.error || !communicator.mandate ? (
        <div className="rounded-md border border-destructive/40 bg-card p-4 text-sm text-destructive">
          The Communicator mandate ({VOICE_COMMUNICATOR_MANDATE_KEY}) did not
          resolve: {communicator.error ?? "no holder bound"}. This surface
          refuses without it — there is no fallback persona.
        </div>
      ) : activePrimary ? (
        <div className="min-h-0 flex-1">
          <RelayRoom
            communicatorAgentId={communicator.mandate.agentId}
            primaryAgentId={activePrimary}
          />
        </div>
      ) : (
        <form
          className="flex max-w-xl items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (primaryAgentId.trim()) setActivePrimary(primaryAgentId.trim());
          }}
        >
          <Input
            value={primaryAgentId}
            onChange={(e) => setPrimaryAgentId(e.target.value)}
            placeholder="Primary agent id (the brain — any agent you can run)"
          />
          <Button type="submit" disabled={!primaryAgentId.trim()}>
            Open room
          </Button>
        </form>
      )}
    </div>
  );
}
