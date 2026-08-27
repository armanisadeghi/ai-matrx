"use client";

/**
 * ListenSummaryWindow — the floating "summarize this for listening" player.
 *
 * ONE panel, two entry moods (the context menu + the assistant action bar):
 *   - "Summarize for listening" — the summary streams into the panel as text;
 *     the user presses Play when it's ready.
 *   - "Summarize & listen" (`initialAutoPlay`) — stream-to-stream: the summary
 *     agent's tokens are spoken as they arrive, via the app-root streaming
 *     speaker (`useAutoVoiceResponse` consuming the `voicePlaybackBus`), so
 *     audio starts before the summary finishes writing.
 *
 * Doctrine kept:
 *   - The text renders through `LiveRunDisplay variant="bare"` — the canonical
 *     stream pipeline, never a bespoke renderer.
 *   - Audio goes through the canonical paths only: live speech via the ONE
 *     app-root speaker (bus request), replay via `speak()` → the unified
 *     playback queue. Transport controls drive the audio session registry —
 *     the same controls the Media panel uses.
 *   - Ephemeral window: a live stream cannot be restored across reloads.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { useLiveRunStatus } from "@/features/agents/components/live-run/useLiveRunStatus";
import { selectSpokenText } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { speak } from "@/features/audio/service/speak";
import { useAudioSessions } from "@/features/audio/session/useAudioSessions";
import {
  clearVoicePlaybackRequestFor,
  getVoicePlaybackRequest,
  requestVoicePlayback,
  stopVoicePlayback,
} from "@/features/transcript-studio/state/voicePlaybackBus";
import { skipPlayback } from "@/features/audio/playback/playbackQueue";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { availableVoices } from "@/lib/cartesia/voices";
import { LANGUAGE_OPTIONS } from "@/features/settings/agent-writable-settings";
import { resolveVoiceId, TTS_DEFAULT_SPEED } from "@/lib/cartesia/config";

const SUMMARY_STYLE_DEFAULT = "Extremely Concise Summary";

export interface ListenSummaryWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** The bound `spoken_summary` agent that writes the listening summary. */
  initialAgentId?: string | null;
  /** Role label for the title bar (e.g. "Listening summary"). */
  initialAgentName?: string | null;
  /** The selected text / message content to summarize. */
  initialSourceText?: string | null;
  /** Summary style variable (defaults to the proven concise style). */
  initialStyle?: string | null;
  /** Stream-to-stream: speak the summary aloud AS it is written. */
  initialAutoPlay?: boolean;
}

export default function ListenSummaryWindow({
  isOpen,
  onClose,
  initialAgentId,
  initialAgentName,
  initialSourceText,
  initialStyle,
  initialAutoPlay = false,
}: ListenSummaryWindowProps) {
  if (!isOpen) return null;
  return (
    <ListenSummaryWindowInner
      onClose={onClose}
      agentId={initialAgentId ?? null}
      agentName={initialAgentName ?? null}
      sourceText={initialSourceText ?? null}
      style={initialStyle ?? SUMMARY_STYLE_DEFAULT}
      autoPlay={initialAutoPlay}
    />
  );
}

function ListenSummaryWindowInner({
  onClose,
  agentId,
  agentName,
  sourceText,
  style,
  autoPlay,
}: {
  onClose: () => void;
  agentId: string | null;
  agentName: string | null;
  sourceText: string | null;
  style: string;
  autoPlay: boolean;
}) {
  const { run, conversationId, error: runError } = useLiveAgentRun();
  const launchedRef = useRef(false);
  const conversationRef = useRef<string | null>(null);

  // ── Launch the summary run once, on open ─────────────────────────────────
  // For the stream-to-stream path, the read-aloud request is published inside
  // `onConversationCreated` — synchronously, BEFORE the request row exists —
  // so the app-root speaker's baseline can never mark our streaming turn as
  // already-handled (enable-after-start would skip it).
  useEffect(() => {
    if (launchedRef.current) return;
    if (!agentId || !sourceText?.trim()) return;
    launchedRef.current = true;
    void run({
      agentId,
      surfaceKey: "listen-summary-window",
      sourceFeature: "chat",
      initiation: "user",
      expect: "text",
      variables: { content: sourceText, style },
      onConversationCreated: (cid) => {
        conversationRef.current = cid;
        if (autoPlay) {
          // includeActive: the run and the read-aloud request are ONE gesture;
          // the app-root speaker must speak this turn even when it mounts
          // after the request already exists (lazy audio chunk).
          requestVoicePlayback({
            conversationId: cid,
            enabled: true,
            includeActive: true,
          });
        }
      },
    }).catch(() => {
      // Surfaced through the hook's `error` state + the request's own error
      // in LiveRunDisplay — nothing extra to do here.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref-guarded single launch; `run` is not referentially stable.
  }, [agentId, sourceText, style, autoPlay]);

  // Closing the panel ends the listening session: stand the app-root speaker
  // down and cut audio ONLY if this panel is still the active requester (never
  // stomp a sibling surface that took over the bus after us).
  useEffect(
    () => () => {
      const cid = conversationRef.current;
      if (cid && getVoicePlaybackRequest().conversationId === cid) {
        stopVoicePlayback();
        clearVoicePlaybackRequestFor(cid);
      }
    },
    [],
  );

  // ── Run status + settled summary text ────────────────────────────────────
  const { requestId, isActive, statusText, errorMessage } = useLiveRunStatus(
    conversationId,
    null,
    launchedRef.current && !conversationId,
  );
  const summaryText = useAppSelector((state) =>
    requestId ? selectSpokenText(requestId)(state) : "",
  );
  const summaryDone =
    Boolean(requestId) && !isActive && !errorMessage && !runError;
  const summaryReady = summaryDone && summaryText.trim().length > 0;
  const failed = Boolean(errorMessage || runError);

  // ── Audio transport (bound to the app-wide session registry) ─────────────
  // `audioEngaged` gates the binding so the panel never adopts a session some
  // OTHER surface is playing; once this panel starts audio (auto-play or the
  // Play button), the registry's current TTS session is ours to control.
  const [audioEngaged, setAudioEngaged] = useState(autoPlay);
  const [hasPlayed, setHasPlayed] = useState(false);
  const { currentPlayback, control } = useAudioSessions();
  const session =
    audioEngaged &&
    currentPlayback &&
    (currentPlayback.source === "auto-voice" ||
      currentPlayback.source === "queue" ||
      currentPlayback.source === "chat-tts")
      ? currentPlayback
      : null;
  const audioStatus = session?.status ?? null;
  const isSpeaking = audioStatus === "active";
  const isPaused = audioStatus === "paused";
  const isAudioLoading = audioStatus === "loading" || audioStatus === "queued";
  const audioLive = isSpeaking || isPaused || isAudioLoading;

  useEffect(() => {
    if (isSpeaking) setHasPlayed(true);
  }, [isSpeaking]);

  // Auto-play fallback: the user asked to LISTEN. If the summary settles and
  // the live stream-to-stream leg never engaged (the run can finish before the
  // lazy app-root speaker binds), play the finished summary through the queue.
  // Grace-delayed so a live leg that is still connecting can claim first.
  const summaryTextRef = useRef(summaryText);
  const liveSessionRef = useRef(session);
  const hasPlayedRef = useRef(hasPlayed);
  useEffect(() => {
    summaryTextRef.current = summaryText;
    liveSessionRef.current = session;
    hasPlayedRef.current = hasPlayed;
  });
  const autoFallbackFiredRef = useRef(false);
  useEffect(() => {
    if (!autoPlay || !summaryReady || autoFallbackFiredRef.current) return;
    const timer = setTimeout(() => {
      if (autoFallbackFiredRef.current) return;
      if (hasPlayedRef.current || liveSessionRef.current) return;
      autoFallbackFiredRef.current = true;
      speak({ text: summaryTextRef.current, label: "Listening summary" });
      setAudioEngaged(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [autoPlay, summaryReady]);

  const handlePlay = useCallback(() => {
    if (!summaryText.trim()) return;
    speak({
      text: summaryText,
      label: "Listening summary",
      purpose: "assistant",
    });
    setAudioEngaged(true);
  }, [summaryText]);

  const handleTransport = useCallback(() => {
    if (session && isSpeaking) {
      control(session.id, "pause");
      return;
    }
    if (session && isPaused) {
      control(session.id, "resume");
      return;
    }
    handlePlay();
  }, [session, isSpeaking, isPaused, control, handlePlay]);

  const handleStop = useCallback(() => {
    if (!session) return;
    control(session.id, "stop");
  }, [session, control]);

  // ── Footer copy — one honest line for every state ────────────────────────
  const audioLabel = failed
    ? "Summary failed"
    : isSpeaking
      ? isActive
        ? "Speaking as it writes"
        : "Speaking"
      : isPaused
        ? "Paused"
        : isAudioLoading
          ? "Preparing voice…"
          : isActive
            ? autoPlay
              ? "Starting voice…"
              : "Summarizing…"
            : summaryReady
              ? hasPlayed
                ? "Finished — listen again"
                : "Ready to listen"
              : "Preparing summary…";

  const playDisabled =
    failed || (!audioLive && !summaryReady) || (!session && isAudioLoading);
  const showReplayIcon = !audioLive && summaryReady && hasPlayed;
  const primaryBusy = isAudioLoading || (autoPlay && isActive && !audioLive);

  const title = statusText && isActive ? `Listen — ${statusText}` : "Listen";

  // ── Voice settings pane (header toggle) ──────────────────────────────────
  // Swaps the BODY only — the transport footer stays live, so audio keeps
  // playing and stays controllable while the user tunes voice and speed.
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <WindowPanel
      id="listen-summary-window"
      title={title}
      overlayId="listenSummaryWindow"
      width={460}
      height={560}
      minWidth={340}
      minHeight={380}
      onClose={onClose}
      actionsRight={
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-pressed={settingsOpen}
          title={settingsOpen ? "Back to the summary" : "Voice settings"}
          aria-label={settingsOpen ? "Back to the summary" : "Voice settings"}
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors [&_svg]:h-3 [&_svg]:w-3",
            settingsOpen
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Settings2 strokeWidth={2.25} />
        </button>
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Summary text — the canonical stream pipeline, nothing bespoke.
            The settings pane overlays via CSS `hidden`, never an unmount —
            LiveRunDisplay's viewer retention must keep holding the live
            request rows while the user tunes settings mid-run. */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {settingsOpen ? <ListenVoiceSettings /> : null}
          <div className={cn("h-full min-h-0", settingsOpen && "hidden")}>
            {!agentId ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No listening-summary agent is bound for this surface yet. Bind
                one from the Agents menu, then try again.
              </p>
            ) : (
              <LiveRunDisplay
                conversationId={conversationId}
                pending={!conversationId && !failed}
                variant="bare"
                className="h-full"
                bodyClassName="max-h-none h-full overflow-y-auto px-4 py-3"
              />
            )}
          </div>
        </div>

        {/* Transport — one delicate glass strip; the panel's single control row. */}
        <div className="shrink-0 border-t border-glass-edge bg-glass px-3 py-2.5 backdrop-blur-glass backdrop-saturate-glass">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleTransport}
              disabled={playDisabled}
              aria-label={
                isSpeaking ? "Pause" : isPaused ? "Resume" : "Listen"
              }
              title={isSpeaking ? "Pause" : isPaused ? "Resume" : "Listen"}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-sm transition-all",
                "bg-primary hover:opacity-90 active:scale-95",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {primaryBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSpeaking ? (
                <Pause className="h-4 w-4" />
              ) : showReplayIcon ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-[1px]" />
              )}
            </button>

            {audioLive ? (
              <button
                type="button"
                onClick={handleStop}
                aria-label="Stop"
                title="Stop"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
              >
                <Square className="h-3 w-3" />
              </button>
            ) : null}

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-xs font-medium",
                  failed ? "text-destructive" : "text-foreground",
                )}
              >
                {audioLabel}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {agentName ?? "Listening summary"}
              </p>
            </div>

            <EqualizerBars active={isSpeaking} />
          </div>
        </div>
      </div>
    </WindowPanel>
  );
}

/**
 * Voice settings pane — the SAME setting paths the canonical Settings → Voice
 * tab edits (`features/settings/tabs/VoiceTab.tsx`), rendered through the same
 * official settings primitives. Every change auto-saves to the user's profile
 * and is the app-wide default: `speak()` and the app-root streaming speaker
 * read these preferences at each utterance, so the next playback (or Listen
 * again) uses the new voice/speed everywhere, not just in this panel.
 */
const VOICE_OPTIONS = availableVoices.map((v) => ({
  value: v.id,
  label: v.name,
  description: v.description,
}));

const PREVIEW_TEXT =
  "Here's how your listening voice sounds. Summaries, notes, and replies will all be read like this.";

function ListenVoiceSettings() {
  const [voice, setVoice] = useSetting<string>("userPreferences.voice.voice");
  const [speed, setSpeed] = useSetting<number>("userPreferences.voice.speed");
  const [language, setLanguage] = useSetting<string>(
    "userPreferences.voice.language",
  );

  // Show the voice that will ACTUALLY speak: an unset preference resolves to
  // the assistant default, so surface that instead of a blank select.
  const effectiveVoiceId = resolveVoiceId(voice, "assistant");

  const handlePreview = useCallback(() => {
    // Deliberately STOP whatever is playing before enqueueing, instead of
    // letting the new utterance take over: a takeover (or a queued-behind
    // state) auto-opens the Media panel over this one, which reads as noise
    // for an explicit in-panel preview. Stopped first, the preview starts
    // instantly with no cross-path event.
    stopVoicePlayback();
    void skipPlayback().then(() => {
      speak({ text: PREVIEW_TEXT, label: "Voice preview" });
    });
  }, []);

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 py-3">
      <SettingsSection title="Listening voice">
        <SettingsSelect
          label="Voice"
          description="Used everywhere speech plays, app-wide."
          value={effectiveVoiceId}
          onValueChange={setVoice}
          options={VOICE_OPTIONS}
          width="lg"
        />
        <SettingsSlider
          label="Speech speed"
          description="1.0 = original pace. Our default is 1.2."
          value={speed || TTS_DEFAULT_SPEED}
          onValueChange={setSpeed}
          min={0.6}
          max={1.5}
          step={0.05}
          precision={2}
          minLabel="Slower"
          midLabel="Default"
          maxLabel="Faster"
        />
        <SettingsSelect
          label="Language"
          value={language}
          onValueChange={setLanguage}
          options={LANGUAGE_OPTIONS}
          last
        />
      </SettingsSection>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Saved to your profile automatically. Changes apply from the next
          playback.
        </p>
        <button
          type="button"
          onClick={handlePreview}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <AudioLines className="h-3.5 w-3.5" />
          Preview voice
        </button>
      </div>
    </div>
  );
}

/** Tiny live-audio indicator — animated bars while speech is audible. */
function EqualizerBars({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-end gap-[2.5px] transition-opacity",
        active ? "opacity-100" : "opacity-25",
      )}
      aria-hidden
    >
      <style>{EQ_KEYFRAMES}</style>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full bg-primary"
          style={{
            height: "100%",
            transformOrigin: "bottom",
            animation: active
              ? `mtxListenEq 0.9s ease-in-out ${i * 0.13}s infinite`
              : "none",
            transform: active ? undefined : `scaleY(${0.25 + (i % 3) * 0.2})`,
          }}
        />
      ))}
    </span>
  );
}

const EQ_KEYFRAMES = `@keyframes mtxListenEq {
  0%, 100% { transform: scaleY(0.3); }
  30% { transform: scaleY(1); }
  60% { transform: scaleY(0.5); }
}`;
