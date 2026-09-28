"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AudioLines, Keyboard, Mic, MicOff, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { ambientAssistantMandateChain } from "./ambientAssistantMandates";
import { useMandate } from "@/features/mandates/useMandate";
import { useMandateChain } from "@/features/mandates/useMandateChain";
import { selectSubmissionPhase } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { sourceFeatureFromSurfaceName } from "@/features/agents/utils/source-feature-from-surface";
import { useOpenQuickChatSheet } from "@/features/overlays/openers/quickChat";
import { useAuthGuardedAction } from "@/features/auth/components/useAuthGuardedAction";
import { useSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useVoiceRelaySession } from "@/features/voice-agent/relay/useVoiceRelaySession";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { VOICE_COMMUNICATOR_MANDATE_KEY } from "@/features/voice-agent/relay/useVoiceRelaySession";
import { VoiceOrb } from "@/features/voice-agent/components/VoiceOrb";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
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
  onDismiss,
}: Pick<ActiveAmbientVoiceAssistantProps, "onDismiss">) {
  const requestSignIn = useAuthGuardedAction(() => undefined, {
    featureName: "Education assistant",
    featureDescription:
      "Sign in to ask or talk with the AI Matrx assistant on any Education page.",
  });

  return (
    <div className="ambient-assistant-dock fixed left-1/2 z-[35] w-[min(470px,calc(100vw-2rem))] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-2 opacity-75 transition-opacity hover:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          className="pointer-events-auto h-9 min-w-0 flex-1 justify-start rounded-full border border-border bg-glass px-4 text-sm text-muted-foreground shadow-glass backdrop-blur-glass backdrop-saturate-glass hover:bg-glass-hover hover:text-foreground"
          onClick={requestSignIn}
        >
          Ask AI Matrx
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="pointer-events-auto h-9 shrink-0 gap-1.5 rounded-full border border-primary/25 bg-glass px-3 text-xs font-medium text-primary shadow-glass backdrop-blur-glass backdrop-saturate-glass transition-[border-color,background-color,transform] hover:scale-[1.03] hover:border-primary/60 hover:bg-glass-hover"
          onClick={requestSignIn}
          aria-label="Sign in to use voice"
        >
          <AudioLines className="h-3.5 w-3.5" />
          Voice
        </Button>
      </div>
      <DismissButton onDismiss={onDismiss} />
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
  // TEXT needs only the brain's conversation. The voice session (the
  // Communicator's realtime config and its broker token) is prepared ONLY
  // when the person opens Voice — mounting the dock used to mint a realtime
  // voice token on every page it appeared on (page-pass 2026-09-27).
  const { conversationId } = useAgentLauncher(primaryAgentId, {
    surfaceKey,
    sourceFeature,
    retainOnUnmount: true,
    preferFresh: true,
    config: { allowChat: true, responseDensity: "compact" },
  });
  const submissionPhase = useAppSelector(
    selectSubmissionPhase(conversationId ?? ""),
  );
  const quickChatOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "quickChat"),
  );

  useEffect(() => {
    if (submissionPhase !== "pending") openedConversationRef.current = null;
  }, [submissionPhase]);

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
    if (quickChatOpen) return;
    openQuickChat({
      initialConversationId: conversationId,
      title: "Assistant",
    });
  }, [conversationId, mode, openQuickChat, quickChatOpen, submissionPhase]);

  if (quickChatOpen && mode === "text") return null;

  return (
    <div className="ambient-assistant-dock fixed left-1/2 z-[35] w-[min(470px,calc(100vw-2rem))] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {mode === "text" ? (
        <>
          <AmbientTextMode
            conversationId={conversationId}
            surfaceKey={surfaceKey}
            onVoice={() => setMode("voice")}
          />
          <DismissButton onDismiss={onDismiss} />
        </>
      ) : (
        <AmbientVoiceSession
          primaryAgentId={primaryAgentId}
          communicatorAgentId={communicatorAgentId}
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          sourceFeature={sourceFeature}
          onText={() => setMode("text")}
          onDismiss={onDismiss}
        />
      )}
    </div>
  );
}

/** Text only — used when the voice agent cannot be resolved. */
function AmbientTextOnlyAssistant({
  primaryAgentId,
  surfaceKey,
  sourceFeature,
  onDismiss,
}: {
  primaryAgentId: string;
  surfaceKey: string;
  sourceFeature: SourceFeature;
  onDismiss: () => void;
}) {
  const { conversationId } = useAgentLauncher(primaryAgentId, {
    surfaceKey,
    sourceFeature,
    retainOnUnmount: true,
    preferFresh: true,
    config: { allowChat: true, responseDensity: "compact" },
  });
  return (
    <div className="ambient-assistant-dock fixed left-1/2 z-[35] w-[min(470px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="pointer-events-auto opacity-75 transition-opacity hover:opacity-100 focus-within:opacity-100">
        <SmartAgentInput
          conversationId={conversationId}
          presentation="ambient"
          ambientLayout="single-line"
          surfaceKey={surfaceKey}
          enablePasteImages={false}
        />
      </div>
      <DismissButton onDismiss={onDismiss} />
    </div>
  );
}

/**
 * The voice half — mounted only while Voice is open, so its realtime session
 * exists only then. The person starts talking with the mic button (a real
 * gesture, which iOS needs for audio).
 */
function AmbientVoiceSession({
  primaryAgentId,
  communicatorAgentId,
  conversationId: textConversationId,
  surfaceKey,
  sourceFeature,
  onText,
  onDismiss,
}: {
  primaryAgentId: string;
  communicatorAgentId: string;
  conversationId: string | null;
  surfaceKey: string;
  sourceFeature: SourceFeature;
  onText: () => void;
  onDismiss: () => void;
}) {
  const relay = useVoiceRelaySession({
    communicatorAgentId,
    primaryAgentId,
    ...(textConversationId ? { conversationId: textConversationId } : {}),
    surfaceKey,
    sourceFeature,
    questionPacing: "one_at_a_time",
  });
  const voiceLive = relay.status !== "idle" && relay.status !== "error";
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    stopRef.current = voiceLive ? () => void relay.stop() : null;
  });
  // Closing Voice (or leaving the page) ends a live session.
  useEffect(() => () => stopRef.current?.(), []);

  const switchToText = () => {
    if (voiceLive) void relay.stop();
    onText();
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
    <>
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
      <DismissButton onDismiss={dismiss} />
    </>
  );
}

function AuthenticatedAmbientVoiceAssistant({
  pathname,
  surfaceKey,
  sourceFeature,
  onDismiss,
  onRetry,
}: {
  pathname: string;
  surfaceKey: string;
  sourceFeature: SourceFeature;
  onDismiss: () => void;
  /** Resolve the assistant again (remounts this component). */
  onRetry: () => void;
}) {
  const primary = useMandateChain(ambientAssistantMandateChain(pathname));
  const communicator = useMandate(VOICE_COMMUNICATOR_MANDATE_KEY);
  const loading = primary.loading || communicator.loading;
  const primaryMandate = primary.mandate;
  const communicatorMandate = communicator.mandate;

  if (loading) {
    return (
      <div className="ambient-assistant-dock fixed left-1/2 z-[35] h-9 w-[min(470px,calc(100vw-2rem))] -translate-x-1/2 animate-pulse rounded-full bg-glass shadow-glass backdrop-blur-glass" />
    );
  }

  // NEVER A DEAD PILL (page-pass 2026-09-27). The dock used to print
  // "Assistant unavailable" with nothing to do about it. Two honest states:
  //   - no organization chosen yet → the organization notice, in place;
  //   - the assistant could not be resolved → the reason plus Try again.
  // Voice needs its own agent; when only that is missing, text still works.
  const organizationPending =
    primary.organizationPending || communicator.organizationPending;
  if (organizationPending) {
    return (
      <div className="ambient-assistant-dock fixed left-1/2 z-[35] w-[min(470px,calc(100vw-2rem))] -translate-x-1/2">
        <OrganizationRequiredNotice
          compact
          what="The page assistant"
          description="Pick the organization you are working in and it is ready."
          className="pointer-events-auto rounded-xl border border-border bg-card shadow-glass"
        />
        <DismissButton onDismiss={onDismiss} />
      </div>
    );
  }

  if (primary.error || !primaryMandate) {
    return (
      <div className="ambient-assistant-dock fixed left-1/2 z-[35] w-[min(470px,calc(100vw-2rem))] -translate-x-1/2">
        <div
          role="alert"
          className="pointer-events-auto flex min-h-10 items-center gap-2 rounded-full border border-border bg-card/95 py-1 pl-4 pr-1 text-xs text-muted-foreground shadow-glass backdrop-blur-glass"
        >
          <span className="min-w-0 flex-1 truncate">
            The page assistant didn&apos;t load
            {primary.error ? ` — ${primary.error}` : "."}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-full"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
        <DismissButton onDismiss={onDismiss} />
      </div>
    );
  }

  if (communicator.error || !communicatorMandate) {
    // Voice is unavailable; the text assistant still works — show it alone.
    return (
      <AmbientTextOnlyAssistant
        primaryAgentId={primaryMandate.agentId}
        surfaceKey={surfaceKey}
        sourceFeature={sourceFeature}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <ActiveAmbientVoiceAssistant
      primaryAgentId={primaryMandate.agentId}
      communicatorAgentId={communicatorMandate.agentId}
      surfaceKey={surfaceKey}
      sourceFeature={sourceFeature}
      onDismiss={onDismiss}
    />
  );
}

export default function ScrollVoiceAssistantLauncherImpl() {
  const pathname = usePathname();
  const runtime = useSurfaceRuntime();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [dismissed, setDismissed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (dismissed) return null;

  if (!isAuthenticated) {
    return <GuestAmbientVoiceAssistant onDismiss={() => setDismissed(true)} />;
  }

  const routeSlug = pathname.split("/").filter(Boolean)[0] ?? "chat";
  const sourceFeature =
    sourceFeatureFromSurfaceName(runtime?.surfaceName) ??
    sourceFeatureFromSurfaceName(`matrx-user/${routeSlug}`) ??
    "chat";

  return (
    <AuthenticatedAmbientVoiceAssistant
      key={attempt}
      onRetry={() => setAttempt((n) => n + 1)}
      pathname={pathname}
      surfaceKey={`ambient-voice-assistant:${pathname}`}
      sourceFeature={sourceFeature}
      onDismiss={() => setDismissed(true)}
    />
  );
}
