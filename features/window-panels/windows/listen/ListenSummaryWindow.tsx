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
import { Loader2, Pause, Play, RotateCcw, Square } from "lucide-react";
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
          requestVoicePlayback({ conversationId: cid, enabled: true });
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
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Summary text — the canonical stream pipeline, nothing bespoke. */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {!agentId ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No listening-summary agent is bound for this surface yet. Bind one
              from the Agents menu, then try again.
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
