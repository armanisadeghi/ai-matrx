"use client";

// ScribeLiveScreen — the "Live" mode of a scribe session.
//
// A realtime two-way VOICE conversation with xAI Grok, scoped to this
// session's working document. It reuses the platform's voice-agent
// primitives (hooks + inner components from `features/voice-agent/`); the
// only thing local to the studio is the layout (embedded inside the scribe
// shell, no full-screen back-header) and the working-document injection.
//
// Phase 1 (this build): the working document is injected into the agent's
// instructions and refreshed whenever it changes, so each session the agent
// starts knows the current document verbatim. Phase 2 (later) would add
// xAI tool/function-calling so the agent can fetch/update the document
// explicitly mid-conversation.

import { useEffect } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useVoiceAgentInstance } from "@/features/voice-agent/hooks/useVoiceAgentInstance";
import { useXaiVoiceSession } from "@/features/voice-agent/hooks/useXaiVoiceSession";
import { usePersistVoiceTranscript } from "@/features/voice-agent/hooks/usePersistVoiceTranscript";
import { updateConfig } from "@/features/voice-agent/state/voiceAgentSlice";
import {
  selectVoiceError,
  selectVoiceStatus,
  selectVoiceTurns,
} from "@/features/voice-agent/state/selectors";
import { VoiceOrb } from "@/features/voice-agent/components/VoiceOrb";
import { VoiceEdgeRibbon } from "@/features/voice-agent/components/VoiceEdgeRibbon";
import { VoiceMicButton } from "@/features/voice-agent/components/VoiceMicButton";
import { VoiceStatusPill } from "@/features/voice-agent/components/VoiceStatusPill";
import { VoiceTranscriptStream } from "@/features/voice-agent/components/VoiceTranscriptStream";
import { VoiceErrorBanner } from "@/features/voice-agent/components/VoiceErrorBanner";
import { VoiceDebugPanel } from "@/features/voice-agent/components/VoiceDebugPanel";
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";
import { cn } from "@/lib/utils";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";

interface ScribeLiveScreenProps {
  sessionId: string;
}

const LIVE_BASE_INSTRUCTIONS = `# Live Studio Collaborator

You are a live, voice-based collaborator working alongside the user inside a transcription studio session. The user is capturing recordings and building a single "working document" from them.

## Your role
- Talk through the material conversationally — help the user think, draft, refine, and reorganize the working document.
- Answer questions about what has been captured so far.
- Be concise and natural; this is a spoken conversation, not an essay.

## Pronunciation
- "Matrx" is spoken as the English word "Matrix". Never spell the letters.

## The working document
The current working document is provided below. Treat it as the source of truth for what the user has built so far. If it is empty, help the user get started. You cannot edit it directly in this live mode — when the user wants changes written in, tell them you'll note it and they can apply it, or suggest switching to the Agent tab where edits are saved.`;

function buildLiveInstructions(docContent: string): string {
  const doc = docContent.trim();
  return `${LIVE_BASE_INSTRUCTIONS}

---

## Current working document
${doc ? doc : "(empty — nothing has been written to the working document yet)"}`;
}

export function ScribeLiveScreen({ sessionId }: ScribeLiveScreenProps) {
  const dispatch = useAppDispatch();
  const assistant = useStudioAssistant(sessionId);
  const docContent = assistant.workingDocument?.content ?? "";

  // Playground preset → `updateConfig` is permitted, so we can refresh the
  // injected working document between sessions. Ephemeral (persist=false):
  // the studio is the system of record; we don't want stray voice
  // conversations cluttering chat history.
  const instanceId = useVoiceAgentInstance({
    preset: "playground",
    instructions: buildLiveInstructions(docContent),
    // Give the live voice agent the full set of realtime tools the platform
    // supports (xAI Realtime built-ins: web + X search), matching what the
    // normal agent can reach for live look-ups. Function/MCP tools (e.g. doc
    // editing) require xAI function-calling — the deferred Phase 2.
    tools: ["web_search", "x_search"],
    persist: false,
  });

  const { status, error, toggle } = useXaiVoiceSession({ instanceId });
  usePersistVoiceTranscript({ instanceId });

  const turns = useAppSelector((s) => selectVoiceTurns(s, instanceId));
  const liveError = useAppSelector((s) => selectVoiceError(s, instanceId));
  const liveStatus = useAppSelector((s) => selectVoiceStatus(s, instanceId));
  const debugMode = useAppSelector(selectIsDebugMode);
  void status;
  void error;

  // Keep the injected document fresh. The orchestrator reads instructions
  // from the slice at session start (`session.update`), so the next time the
  // user taps the mic the agent sees the latest document.
  useEffect(() => {
    dispatch(
      updateConfig({
        instanceId,
        instructions: buildLiveInstructions(docContent),
      }),
    );
  }, [dispatch, instanceId, docContent]);

  // Surface the common, actionable failures as toasts (the inline banner
  // shows the rest). Mirrors VoiceAgentSurface's handling for the codes a
  // user actually hits first.
  useEffect(() => {
    if (!liveError) return;
    const code = liveError.code;
    if (code === "mic-permission-denied") {
      toast.error("Microphone access denied", {
        description:
          "Allow microphone access in your browser settings, then tap the mic to try again.",
      });
    } else if (code === "mic-no-microphone") {
      toast.error("No microphone detected", {
        description: "Plug in a microphone, then tap the mic to try again.",
      });
    } else if (
      code === "token-service-unavailable" ||
      code === "service-unavailable"
    ) {
      toast.error("Live voice is not configured", {
        description:
          "The voice service credentials are missing on this deployment.",
      });
    }
  }, [liveError]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <VoiceEdgeRibbon status={liveStatus} />

      {/* Live diagnostics — gated behind app-wide debug mode. */}
      {debugMode && (
        <div className="relative z-20 shrink-0 px-2 pt-2">
          <VoiceDebugPanel instanceId={instanceId} />
        </div>
      )}

      {/* Transcript — fades older content so the eye is drawn to the mic. */}
      <section
        className={cn(
          "relative z-10 min-h-0 flex-1 overflow-y-auto",
          "[mask-image:linear-gradient(to_bottom,transparent,#000_15%,#000_85%,transparent)]",
        )}
        aria-label="Live voice transcript"
      >
        {turns.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6">
            <p className="max-w-md text-center text-base leading-relaxed text-muted-foreground">
              Tap the mic to talk through your recordings with Grok. It can see
              your working document and help you shape it — out loud.
            </p>
          </div>
        ) : (
          <VoiceTranscriptStream turns={turns} />
        )}
      </section>

      {/* Hero: status + mic + error. */}
      <section className="relative z-10 flex shrink-0 flex-col items-center justify-end gap-4 px-4 pb-6 pb-safe">
        <VoiceStatusPill status={liveStatus} />
        <div className="relative inline-flex items-center justify-center">
          <VoiceOrb status={liveStatus} />
          <div className="relative z-10">
            <VoiceMicButton status={liveStatus} onToggle={toggle} />
          </div>
        </div>
        <VoiceErrorBanner error={liveError} />
      </section>
    </div>
  );
}
