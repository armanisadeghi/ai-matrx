"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AudioLines, Keyboard, Mic, MicOff, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { ambientAssistantMandateChain } from "./ambientAssistantMandates";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useMandate } from "@/features/agents/mandates/useMandate";
import { useMandateChain } from "@/features/agents/mandates/useMandateChain";
import { selectSubmissionPhase } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { sourceFeatureFromSurfaceName } from "@/features/agents/utils/source-feature-from-surface";
import { useOpenQuickChatSheet } from "@/features/overlays/openers/quickChat";
import { useAuthGuardedAction } from "@/features/auth/components/useAuthGuardedAction";
import { useSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useVoiceRelaySession } from "@/features/voice-agent/relay/useVoiceRelaySession";
import { VOICE_COMMUNICATOR_MANDATE_KEY } from "@/features/voice-agent/relay/useVoiceRelaySession";
import { VoiceOrb } from "@/features/voice-agent/components/VoiceOrb";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import type { SourceFeature } from "@/types/python-generated/source-attribution";
import { cn } from "@/lib/utils";

interface ActiveAmbientVoiceAssistantProps {
  primaryAgentId: string;
  communicatorAgentId: string;
  surfaceKey: string;
  sourceFeature: SourceFeature;
  onDismiss: () => void;
}

interface AmbientTextModeProps {
  conversationId: string | null;
  surfaceKey: string;
  onVoice: () => void;
}

function AmbientTextMode({
  conversationId,
  surfaceKey,
  onVoice,
}: AmbientTextModeProps) {
  return (
    <div className="flex items-center gap-2 opacity-75 transition-opacity hover:opacity-100 focus-within:opacity-100">
      <div className="pointer-events-auto min-w-0 flex-1">
        <SmartAgentInput
          conversationId={conversationId}
          presentation="ambient"
          ambientLayout="single-line"
          surfaceKey={surfaceKey}
          showConnectors={false}
          enablePasteImages={false}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        className="pointer-events-auto h-9 shrink-0 gap-1.5 rounded-full border border-primary/25 bg-glass px-3 text-xs font-medium text-primary shadow-glass backdrop-blur-glass backdrop-saturate-glass transition-[border-color,background-color,transform] hover:scale-[1.03] hover:border-primary/60 hover:bg-glass-hover"
        onClick={onVoice}
        aria-label="Switch to voice"
      >
        <AudioLines className="h-3.5 w-3.5" />
        Voice
      </Button>
    </div>
  );
}

interface DismissButtonProps {
  onDismiss: () => void;
}

function DismissButton({ onDismiss }: DismissButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="pointer-events-auto absolute -right-2 -top-2 z-20 h-7 w-7 rounded-full border border-glass-edge bg-card/95 text-muted-foreground opacity-80 shadow-glass backdrop-blur-glass transition-[color,opacity,transform] hover:scale-105 hover:bg-card hover:text-foreground hover:opacity-100"
      onClick={onDismiss}
      aria-label="Dismiss assistant until refresh"
      title="Dismiss until refresh"
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}

function GuestAmbientVoiceAssistant({
  primaryAgentId,
  surfaceKey,
  sourceFeature,
  onDismiss,
}: Omit<ActiveAmbientVoiceAssistantProps, "communicatorAgentId">) {
  const openedConversationRef = useRef<string | null>(null);
  const openQuickChat = useOpenQuickChatSheet();
  const { conversationId, close } = useAgentLauncher(primaryAgentId, {
    surfaceKey,
    sourceFeature,
    ready: true,
    retainOnUnmount: true,
    preferFresh: true,
    config: {
      allowChat: true,
      responseDensity: "compact",
    },
  });
  const submissionPhase = useAppSelector(
    selectSubmissionPhase(conversationId ?? ""),
  );
  const requestVoiceSignIn = useAuthGuardedAction(() => undefined, {
    featureName: "Voice assistant",
    featureDescription:
      "Sign in to talk with the AI Matrx voice agent on any Education page.",
  });

  useEffect(() => {
    if (
      !conversationId ||
      submissionPhase !== "pending" ||
      openedConversationRef.current === conversationId
    ) {
      return;
    }
    openedConversationRef.current = conversationId;
    openQuickChat({
      initialConversationId: conversationId,
      title: "Assistant",
    });
    onDismiss();
  }, [conversationId, onDismiss, openQuickChat, submissionPhase]);

  const dismiss = () => {
    if (conversationId) close(conversationId);
    onDismiss();
  };

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[35] w-[min(470px,calc(100vw-2rem))] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <AmbientTextMode
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        onVoice={requestVoiceSignIn}
      />
      <DismissButton onDismiss={dismiss} />
    </div>
  );
}

function ActiveAmbientVoiceAssistant({
  primaryAgentId,
  communicatorAgentId,
  surfaceKey,
  sourceFeature,
  onDismiss,
}: ActiveAmbientVoiceAssistantProps) {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const openedConversationRef = useRef<string | null>(null);
  const openQuickChat = useOpenQuickChatSheet();
  const relay = useVoiceRelaySession({
    communicatorAgentId,
    primaryAgentId,
    surfaceKey,
    sourceFeature,
    questionPacing: "one_at_a_time",
  });
  const conversationId = relay.primaryConversationId;
  const submissionPhase = useAppSelector(
    selectSubmissionPhase(conversationId ?? ""),
  );
  const voiceLive = relay.status !== "idle" && relay.status !== "error";

  useEffect(() => {
    if (
      mode !== "text" ||
      !conversationId ||
      submissionPhase !== "pending" ||
      openedConversationRef.current === conversationId
    ) {
      return;
    }
    openedConversationRef.current = conversationId;
    openQuickChat({
      initialConversationId: conversationId,
      title: "Assistant",
    });
    onDismiss();
  }, [conversationId, mode, onDismiss, openQuickChat, submissionPhase]);

  const switchToText = () => {
    if (voiceLive) void relay.stop();
    setMode("text");
  };

  const dismiss = () => {
    if (voiceLive) void relay.stop();
    onDismiss();
  };

  const voiceLabel = relay.error
    ? relay.error.message
    : relay.brainBusy
      ? "The agent is thinking"
      : relay.status === "idle"
        ? "Tap the mic and speak"
        : relay.status === "requesting-mic"
          ? "Allow microphone access"
          : relay.status === "connecting"
            ? "Connecting"
            : relay.status === "listening"
              ? relay.micMuted
                ? "Microphone muted"
                : "Listening"
              : relay.status === "thinking"
                ? "Understanding"
                : relay.status === "speaking"
                  ? "Speaking"
                  : relay.status === "interrupting"
                    ? "One moment"
                    : "Tap to try again";

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[35] w-[min(470px,calc(100vw-2rem))] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {mode === "text" ? (
        <AmbientTextMode
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          onVoice={() => {
            setMode("voice");
            relay.toggle();
          }}
        />
      ) : (
        <div
          data-ambient-voice="true"
          className={cn(
            "pointer-events-auto relative flex h-12 items-center gap-2 overflow-hidden rounded-full border bg-glass px-1.5 shadow-glass-lg backdrop-blur-glass backdrop-saturate-glass",
            relay.error
              ? "border-destructive/45"
              : "border-primary/45 ring-2 ring-primary/10",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="relative z-10 h-9 shrink-0 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-glass-hover hover:text-foreground"
            onClick={switchToText}
            aria-label="Switch to text"
          >
            <Keyboard className="h-3.5 w-3.5" />
            Text
          </Button>

          <div className="h-5 w-px shrink-0 bg-border/60" />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-[border-color,background-color,transform] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              voiceLive
                ? "border-primary/55 bg-primary text-primary-foreground"
                : "border-primary/35 bg-card text-primary hover:border-primary/70",
            )}
            onClick={relay.toggle}
            aria-label={
              voiceLive ? "End voice conversation" : "Start voice conversation"
            }
            title={
              voiceLive ? "End voice conversation" : "Start voice conversation"
            }
          >
            <VoiceOrb status={relay.status} size={58} />
            {voiceLive ? (
              <Square className="relative z-10 h-3.5 w-3.5 fill-current" />
            ) : (
              <Mic className="relative z-10 h-4 w-4" />
            )}
          </Button>

          <div className="relative z-10 min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-xs font-medium",
                relay.error ? "text-destructive" : "text-foreground",
              )}
              aria-live="polite"
            >
              {voiceLabel}
            </p>
            <p className="truncate text-[0.6875rem] text-muted-foreground">
              Same agent, same page context
            </p>
          </div>

          {voiceLive ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative z-10 h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-glass-hover hover:text-foreground"
              onClick={relay.toggleMute}
              aria-label={
                relay.micMuted ? "Unmute microphone" : "Mute microphone"
              }
              title={relay.micMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {relay.micMuted ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
        </div>
      )}

      <DismissButton onDismiss={dismiss} />
    </div>
  );
}

export default function ScrollVoiceAssistantLauncherImpl() {
  const pathname = usePathname();
  const runtime = useSurfaceRuntime();
  const primary = useMandateChain(ambientAssistantMandateChain(pathname));
  const communicator = useMandate(VOICE_COMMUNICATOR_MANDATE_KEY);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const routeSlug = pathname.split("/").filter(Boolean)[0] ?? "chat";
  const sourceFeature =
    sourceFeatureFromSurfaceName(runtime?.surfaceName) ??
    sourceFeatureFromSurfaceName(`matrx-user/${routeSlug}`) ??
    "chat";
  const surfaceKey = `ambient-voice-assistant:${pathname}`;
  const loading = primary.loading || (isAuthenticated && communicator.loading);
  const primaryMandate = primary.mandate;
  const communicatorMandate = communicator.mandate;

  if (loading) {
    return (
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[35] h-9 w-[min(470px,calc(100vw-2rem))] -translate-x-1/2 animate-pulse rounded-full bg-glass shadow-glass backdrop-blur-glass" />
    );
  }

  const unavailableLauncher = (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[35] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="pointer-events-auto flex h-10 items-center rounded-full border border-border bg-card/90 px-3 text-xs text-muted-foreground shadow-glass backdrop-blur-glass">
        Assistant unavailable
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="pointer-events-auto absolute -right-2 -top-2 h-7 w-7 rounded-full border border-glass-edge bg-card shadow-glass"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss assistant until refresh"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  if (primary.error || !primaryMandate) {
    return unavailableLauncher;
  }

  if (isAuthenticated && (communicator.error || !communicatorMandate)) {
    return unavailableLauncher;
  }

  if (!isAuthenticated) {
    return (
      <GuestAmbientVoiceAssistant
        primaryAgentId={primaryMandate.agentId}
        surfaceKey={surfaceKey}
        sourceFeature={sourceFeature}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  if (!communicatorMandate) {
    return unavailableLauncher;
  }

  return (
    <ActiveAmbientVoiceAssistant
      primaryAgentId={primaryMandate.agentId}
      communicatorAgentId={communicatorMandate.agentId}
      surfaceKey={surfaceKey}
      sourceFeature={sourceFeature}
      onDismiss={() => setDismissed(true)}
    />
  );
}
