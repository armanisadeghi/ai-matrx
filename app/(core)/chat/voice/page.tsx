// app/(core)/chat/voice/page.tsx
//
// AI Matrx Introduction Agent — locked. No settings UI. This is the surface
// business users land on; the experience itself is the proof of what AI Matrx
// can do.
//
// Server Component shell — resolves the `voice.intro` agent slot before first
// paint, then hands off to the client for the realtime voice experience.
//
// 🚨 The agent is a normal `agent.definition` row and the SLOT decides which
// row. Nothing about this agent — its identity, its instructions, its voice —
// lives in this repo; editing it is a builder-level operation. There is no
// hardcoded agent id and no fallback prompt: an unresolvable slot renders the
// notice below rather than silently running some other agent.

import { AlertTriangle } from "lucide-react";
import { VoiceAgentSurface } from "@/features/voice-agent/components/VoiceAgentSurface";
import { resolveAgentSlotServer } from "@/features/agents/slots/service.server";

export default async function VoiceIntroPage() {
  let agentId: string;
  try {
    agentId = (await resolveAgentSlotServer("voice.intro")).agentId;
  } catch (error) {
    console.error(
      "[chat/voice] the voice.intro agent slot did not resolve:",
      error,
    );
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex max-w-md items-start gap-3 rounded-lg border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              The voice agent is unavailable
            </p>
            <p className="text-sm text-muted-foreground">
              Its agent slot could not be resolved, so we did not start a
              session. Please try again shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <VoiceAgentSurface preset="intro" agentId={agentId} />;
}
