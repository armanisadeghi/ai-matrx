"use client";
// features/voice-agent/components/VoiceAgentSurface.tsx
//
// Top-level voice-agent layout. Composes:
//   • useVoiceAgentInstance — initializes the per-route slice instance
//   • useXaiVoiceSession — the orchestrator hook
//   • usePersistVoiceTranscript — async Supabase writes
//
// Renders the ambient mood layer (full-screen radial glow that signals
// listening / speaking), the transcript stream, the single mic control,
// the status pill, the error banner, and (playground only) a settings
// sheet trigger.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { useVoiceAgentInstance } from "../hooks/useVoiceAgentInstance";
import { useXaiVoiceSession } from "../hooks/useXaiVoiceSession";
import { usePersistVoiceTranscript } from "../hooks/usePersistVoiceTranscript";
import {
  selectVoiceError,
  selectVoiceStatus,
  selectVoiceTurns,
} from "../state/selectors";
import { VoiceAmbientGlow } from "./VoiceAmbientGlow";
import { VoiceMicButton } from "./VoiceMicButton";
import { VoiceStatusPill } from "./VoiceStatusPill";
import { VoiceTranscriptStream } from "./VoiceTranscriptStream";
import { VoiceErrorBanner } from "./VoiceErrorBanner";
import { PlaygroundSettingsSheet } from "./playground/PlaygroundSettingsSheet";
import type { VoiceAgentPreset } from "../types";

interface VoiceAgentSurfaceProps {
  preset: VoiceAgentPreset;
}

export function VoiceAgentSurface({ preset }: VoiceAgentSurfaceProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const instanceId = useVoiceAgentInstance({ preset });
  const { status, error, toggle } = useXaiVoiceSession({ instanceId });
  usePersistVoiceTranscript({ instanceId });

  const turns = useAppSelector((s) => selectVoiceTurns(s, instanceId));
  // Re-read directly so the surface re-renders when an error is set even if
  // it's set without a status flip.
  const liveError = useAppSelector((s) => selectVoiceError(s, instanceId));
  const liveStatus = useAppSelector((s) => selectVoiceStatus(s, instanceId));

  // Surface mic-permission errors as a toast (the banner shows the inline
  // version too — toast catches the user's eye while they're looking at the
  // permission prompt).
  useEffect(() => {
    if (!liveError) return;
    if (liveError.code === "mic-permission-denied") {
      toast.error("Microphone access denied", {
        description:
          "Allow microphone access in your browser settings, then tap the mic to try again.",
      });
    } else if (liveError.code === "mic-no-microphone") {
      toast.error("No microphone detected", {
        description: "Plug in a microphone, then tap the mic to try again.",
      });
    } else if (liveError.code === "token-unauthorized") {
      toast.error("Sign-in required", {
        description: "Your session expired. Refresh the page and try again.",
      });
    } else if (liveError.code === "token-service-unavailable") {
      // Server returned 503 — XAI_API_KEY is missing on the deployment.
      // Surface a clear message so the deployer (not the end user) sees
      // exactly what to fix instead of a generic "something went wrong".
      toast.error("Voice agent is not configured", {
        description:
          "This deployment is missing the voice service credentials. Contact support if you keep seeing this.",
      });
    }
  }, [liveError]);

  return (
    <div
      className={cn(
        "relative h-dvh flex flex-col overflow-hidden bg-background text-foreground",
      )}
    >
      {/* ─── Ambient mood layer ─────────────────────────────────────────
          Fullscreen, non-interactive. Sits behind every other surface
          child via stacking order (it's the first sibling and the rest
          carry `relative z-10`). Replaces the old centered orb so the
          mic button is the only thing that looks tappable. */}
      <VoiceAmbientGlow status={liveStatus} />

      {/* ─── Header ─────────────────────────────────────────────────── */}
      {/* pr-14 clears the shell's user-menu avatar (44px) that's anchored to the viewport right edge */}
      {/* `relative z-10` lifts all foreground UI above the ambient glow */}
      <header className="relative z-10 shrink-0 flex items-center justify-between px-4 pr-14 py-3 border-b border-border/40">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <h1 className="text-sm font-medium tracking-wide text-muted-foreground">
          {preset === "intro" ? "AI Matrx" : "Voice Playground"}
        </h1>
        {preset === "playground" ? (
          <PlaygroundSettingsSheet
            instanceId={instanceId}
            disabled={liveStatus !== "idle" && liveStatus !== "error"}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Voice settings"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            }
          />
        ) : (
          <span className="w-8" aria-hidden="true" />
        )}
      </header>

      {/* ─── Transcript (fades older messages to depth) ────────────── */}
      <section
        className={cn(
          "relative z-10 flex-1 min-h-0 overflow-y-auto",
          // Mask older content so the eye is drawn down toward the controls.
          "[mask-image:linear-gradient(to_bottom,transparent,#000_15%,#000_85%,transparent)]",
        )}
        aria-label="Voice transcript"
      >
        {turns.length === 0 ? (
          <EmptyTranscript preset={preset} />
        ) : (
          <VoiceTranscriptStream turns={turns} />
        )}
      </section>

      {/* ─── Hero: status + mic + error ─────────────────────────────
          The old centered orb visualizer was removed — the ambient glow
          layer behind the surface now carries the "I'm listening / I'm
          speaking" feedback. This leaves the mic button as the single,
          unambiguous control. */}
      <section
        className={cn(
          "relative z-10 shrink-0 flex flex-col items-center justify-end gap-5",
          "pb-10 pb-safe px-4",
        )}
      >
        <VoiceStatusPill status={liveStatus} />
        <VoiceMicButton status={liveStatus} onToggle={toggle} />
        <VoiceErrorBanner error={liveError} />
      </section>
    </div>
  );

  // Silence "dispatch is unused if no playground" — the dispatch is consumed
  // by the PlaygroundSettingsSheet through Redux, but we keep the import here
  // so future surface-level actions are one line away.
  void dispatch;
}

function EmptyTranscript({ preset }: { preset: VoiceAgentPreset }) {
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-2">
        <p className="text-base text-muted-foreground leading-relaxed">
          {preset === "intro"
            ? "Tap the mic to begin a conversation about your business and how AI can transform it."
            : "Voice playground — adjust the voice, tools, and instructions in settings before you start."}
        </p>
      </div>
    </div>
  );
}
