"use client";

// ExperimentalAgentScreen — a single-button take on the agent tab.
//
// Concept under trial: instead of two separate record affordances (one that
// stores a permanent recording, one that talks to the agent in passing), this
// tab has ONE record button. When you stop, a sheet asks what to do with the
// transcript:
//   • Send to agent          — fire it as a turn now.
//   • Transcribe             — drop it into the input to edit before sending.
//   • Transcribe & send      — stage it AND send.
//
// Capture is EPHEMERAL (standalone context) — it does not create a stored
// studio recording segment; this tab is about conversing, not archiving.
// It shares the same conversation as the Agent tab via useStudioAssistant.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Keyboard, Loader2, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { useGlobalRecording } from "@/providers/GlobalRecordingProvider";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import {
  clearVoicePlaybackRequestFor,
  getVoicePlayback,
  requestVoicePlayback,
  stopVoicePlayback,
  subscribeVoicePlayback,
} from "../../state/voicePlaybackBus";
import { ingestExternalRecordingThunk } from "../../redux/thunks";
import { RecordActionSheet, type RecordActionKey } from "./RecordActionSheet";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

interface ExperimentalAgentScreenProps {
  sessionId: string;
  /** War Room grid tiles — shrink the bottom voice control row. */
  compact?: boolean;
  /**
   * Reveal the REAL chat input permanently (the full `SmartAgentInput` — its
   * `ConversationContextRail` with working document + scratchpad + context
   * layers + attachments, the textarea, resource chips, run controls). War Room
   * passes this so its agent tab IS the chat surface (working doc + scratchpad +
   * context never hidden), while Scribe stays voice-first (the input collapses
   * behind the keyboard toggle). Drives the real component via a prop — no fork.
   */
  revealInput?: boolean;
}

/** The finished turn: transcript + assembled audio + length, carried to the chooser. */
interface PendingRecordingResult {
  text: string;
  audioBlob: Blob | null;
  durationSec: number;
}

const STANDALONE_LABEL_PREFIX = "scribe-agent:";

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ExperimentalAgentScreen({
  sessionId,
  compact,
  revealInput = false,
}: ExperimentalAgentScreenProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const assistant = useStudioAssistant(sessionId);
  const conversationId = assistant.conversationId;
  const recording = useGlobalRecording();

  const ownedRef = useRef(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Post-stop chooser state. The sheet opens the moment recording STOPS; the
  // finished turn ("pendingResult" — transcript + audio + length) lands a couple
  // seconds later. The user's choice can arrive before OR after it — we reconcile
  // the two below.
  const [pendingResult, setPendingResult] =
    useState<PendingRecordingResult | null>(null);
  const chosenKeyRef = useRef<RecordActionKey | null>(null);
  // Agent+ is a voice-in / voice-out surface: no text field by default, and
  // responses are read back automatically. Both are toggleable from the bar.
  const [inputOpen, setInputOpen] = useState(false);
  const [autoVoice, setAutoVoice] = useState(true);

  // Read-aloud is owned at app-root (AudioOutputHost → useAutoVoiceResponse) so
  // playback SURVIVES this tab unmounting on a War Room tab switch. We don't
  // mount the speaker here anymore — we publish our (conversation, on/off) to
  // the bus, and read the live playback state back from it for the indicator.
  useEffect(() => {
    requestVoicePlayback({ conversationId, enabled: autoVoice });
  }, [conversationId, autoVoice]);
  // On unmount, stand the owner down for OUR conversation — but do NOT cut audio
  // already in flight (that's the whole reason it lives at app-root), and do NOT
  // stomp a sibling tile that became the active requester (Grid view shares this
  // one bus across tiles): `clearVoicePlaybackRequestFor` no-ops unless we're
  // still the active requester. A ref (kept current in an effect) lets the
  // empty-dep cleanup read the latest conversationId, not a mount-time stale one.
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(
    () => () => clearVoicePlaybackRequestFor(conversationIdRef.current),
    [],
  );
  const playback = useSyncExternalStore(
    subscribeVoicePlayback,
    getVoicePlayback,
    getVoicePlayback,
  );
  const speaking = playback.active;

  // Recording state from the global mirror — this screen only "owns" the
  // session when the active context is our ephemeral standalone capture.
  const ctx = useAppSelector((s) => s.recordings.context);
  const isRecordingGlobal = useAppSelector((s) => s.recordings.isRecording);
  const isPaused = useAppSelector((s) => s.recordings.isPaused);
  const durationSec = useAppSelector((s) => s.recordings.durationSec);
  const owned =
    ctx?.kind === "standalone" &&
    ctx.label === `${STANDALONE_LABEL_PREFIX}${sessionId}`;
  const isRecording = isRecordingGlobal && owned;
  const blockedByOther = isRecordingGlobal && !owned;

  // Apply a chosen action to the finished turn, then close the sheet.
  //   agent / both → SUBMIT it to the agent as a turn now (the hands-free voice
  //                  flow — auto-voice reads the reply). This is the default.
  //   save / both  → persist as a real studio recording (Tab-1 pipeline) so it
  //                  lands as a card in the Record tab with audio + raw + cleaned.
  //   input → stage the transcript in the input AND open + focus it to edit
  //           before sending (the input is hidden by default on this tab).
  const executeAction = useCallback(
    (key: RecordActionKey, result: PendingRecordingResult) => {
      const { text, audioBlob, durationSec } = result;
      if (text) {
        if (key === "save" || key === "both") {
          void dispatch(
            ingestExternalRecordingThunk({
              sessionId,
              audioBlob,
              text,
              durationSec,
            }),
          );
          toast.success("Saved to transcripts");
        }
        if (key === "agent" || key === "both") {
          void assistant.send(text);
        }
        if (key === "input") {
          if (conversationId) {
            dispatch(setUserInputText({ conversationId, text }));
            // Reveal the input — AgentTextarea auto-focuses on mount, so the
            // cursor lands in the field ready to edit/send.
            setInputOpen(true);
          }
        }
      }
      chosenKeyRef.current = null;
      setPendingResult(null);
      setSheetOpen(false);
    },
    [assistant, conversationId, dispatch, sessionId],
  );

  // The user tapped (or the timer auto-fired) a choice. Execute now if the turn
  // is already in; otherwise hold it and onComplete will pick it up.
  const handleChoose = useCallback(
    (key: RecordActionKey) => {
      chosenKeyRef.current = key;
      if (pendingResult !== null) executeAction(key, pendingResult);
    },
    [pendingResult, executeAction],
  );

  const startRecording = async () => {
    if (recording.isActive || recording.isFinalizing) return;
    ownedRef.current = true;
    try {
      await recording.start({
        context: {
          kind: "standalone",
          label: `${STANDALONE_LABEL_PREFIX}${sessionId}`,
        },
        onComplete: (result, audioBlob) => {
          ownedRef.current = false;
          const text = (result.text ?? "").trim();
          if (!text) {
            chosenKeyRef.current = null;
            setSheetOpen(false);
            toast("Nothing was transcribed.");
            return;
          }
          // Capture the length NOW: recordingFinalized (which resets durationSec)
          // runs right after this callback, so read it fresh from the store.
          const durationSec = store.getState().recordings.durationSec;
          const finished: PendingRecordingResult = {
            text,
            audioBlob: audioBlob ?? null,
            durationSec,
          };
          // The turn is ready. If a choice is already queued, run it; otherwise
          // surface it so the sheet's countdown / buttons act on the real turn.
          if (chosenKeyRef.current) {
            executeAction(chosenKeyRef.current, finished);
          } else {
            setPendingResult(finished);
          }
        },
        onError: (message) => {
          ownedRef.current = false;
          chosenKeyRef.current = null;
          setSheetOpen(false);
          toast.error(message);
        },
      });
    } catch {
      ownedRef.current = false;
      // start() throws when blocked by another in-flight recording — the
      // provider already routed a message through onError above.
    }
  };

  // Stop opens the chooser immediately — we don't wait for transcription.
  const handleStop = useCallback(() => {
    chosenKeyRef.current = null;
    setPendingResult(null);
    setSheetOpen(true);
    void recording.stop();
  }, [recording]);

  // Safety net: a recording WE own can also be stopped from outside this tree —
  // notably the global RecordingPill (mounted in app/Providers), which calls
  // recording.stop() directly and is the only stop control reachable while the
  // full-screen working-document editor covers this screen. Whenever an owned
  // recording transitions from active → inactive by ANY route, surface the
  // chooser so the captured turn is never silently dropped. onComplete then
  // fills in the transcript and the countdown takes over.
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (isRecording) {
      wasRecordingRef.current = true;
    } else if (wasRecordingRef.current) {
      wasRecordingRef.current = false;
      // Legitimate external-system sync: surface the chooser when our owned
      // recording stops via ANY route (e.g. the global RecordingPill). This
      // reacts to the Redux `isRecording` flag flipping — the exact "subscribe
      // to an external system, call setState" case the rule blesses.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSheetOpen(true);
    }
  }, [isRecording]);

  // Re-bind to a CHANGED session WITHOUT a remount. The War Room tile used to
  // pass `key={sessionId}` to force a full remount on session switch; that is
  // what killed read-aloud (it unmounted the speaker). Now the tile keeps this
  // component mounted and just changes the `sessionId` prop, so we must clear
  // the ephemeral per-session chooser/recording UI ourselves — otherwise a
  // pending sheet, a queued choice, or a stale "we own the mic" flag from the
  // previous session would leak into the new one. `useStudioAssistant`,
  // `requestVoicePlayback`, and the `owned` selector already track the new
  // sessionId via their own deps; this only resets local UI state.
  //
  // State reset uses React's official "adjust state while rendering" pattern
  // (comparing the previous `sessionId` held in `useState`, then calling the
  // set functions during render) — a single synchronous re-render, no
  // cascading-render or setState-in-effect lint hit, no refs touched in render.
  const [prevSession, setPrevSession] = useState(sessionId);
  if (prevSession !== sessionId) {
    setPrevSession(sessionId);
    setSheetOpen(false);
    setPendingResult(null);
    setInputOpen(false);
  }
  // The chooser/recording bookkeeping REFS are reset in an effect (refs must not
  // be written during render). Keyed on `sessionId` so it fires exactly on a
  // switch; harmless on first mount (refs already hold these defaults).
  useEffect(() => {
    chosenKeyRef.current = null;
    ownedRef.current = false;
    wasRecordingRef.current = false;
  }, [sessionId]);

  const surfaceKey = `studio-assistant-experimental:${sessionId}`;

  useEffect(() => {
    if (!conversationId) return;
    traceWarRoomRenderPath(
      11,
      "ExperimentalAgentScreen.tsx",
      "rendering AgentConversationColumn",
      {
        studioSessionId: sessionId,
        conversationId,
        surfaceKey,
      },
    );
  }, [sessionId, conversationId, surfaceKey]);

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          constrainWidth
          edgeToEdgeScroll
          hideInput={!inputOpen && !revealInput}
          smartInputProps={{ sendButtonVariant: "blue" }}
        />
      </div>

      {/* Single record control */}
      <div
        className={cn(
          "shrink-0 border-t border-border bg-card/95 backdrop-blur",
          compact
            ? "px-2 pt-1.5 pb-1"
            : "px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3",
        )}
      >
        {!compact ? (
          <div
            className={cn(
              "mb-2 flex items-center justify-center gap-2 text-xs transition-opacity",
              isRecording ? "opacity-100" : "opacity-40",
            )}
          >
            <span className="relative flex h-2 w-2">
              {isRecording && !isPaused && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  isRecording ? "bg-red-500" : "bg-muted-foreground",
                )}
              />
            </span>
            <span className="font-mono tabular-nums text-foreground">
              {formatClock(isRecording ? durationSec : 0)}
            </span>
            <span className="text-muted-foreground">
              {isRecording ? "Recording" : "Tap to record a turn"}
            </span>
          </div>
        ) : null}

        <div
          className={cn(
            "flex items-center justify-center",
            compact ? "gap-2" : "gap-4",
          )}
        >
          {/* Auto-voice toggle — read responses aloud. Dimmed when off. */}
          <button
            type="button"
            onClick={() => {
              if (speaking) stopVoicePlayback();
              setAutoVoice((v) => !v);
            }}
            aria-pressed={autoVoice}
            aria-label={
              autoVoice ? "Turn off voice replies" : "Turn on voice replies"
            }
            className={cn(
              "flex items-center justify-center rounded-full transition-transform active:scale-95",
              compact ? "h-9 w-9" : "h-16 w-16",
              autoVoice
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-muted-foreground/60",
            )}
          >
            {speaking ? (
              <Volume2
                className={
                  compact ? "h-4 w-4 animate-pulse" : "h-6 w-6 animate-pulse"
                }
              />
            ) : autoVoice ? (
              <Volume2 className={compact ? "h-4 w-4" : "h-6 w-6"} />
            ) : (
              <VolumeX className={compact ? "h-4 w-4" : "h-6 w-6"} />
            )}
          </button>

          <button
            type="button"
            onClick={isRecording ? handleStop : startRecording}
            disabled={
              (!isRecording && blockedByOther) || recording.isFinalizing
            }
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            className={cn(
              "flex items-center justify-center rounded-full transition-transform active:scale-95",
              compact ? "h-9 w-9" : "h-16 w-16",
              isRecording
                ? "bg-red-500 text-white"
                : blockedByOther || recording.isFinalizing
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground",
            )}
          >
            {isRecording ? (
              <Square
                className={
                  compact ? "h-4 w-4 fill-current" : "h-6 w-6 fill-current"
                }
              />
            ) : recording.isFinalizing ? (
              <Loader2
                className={
                  compact ? "h-4 w-4 animate-spin" : "h-6 w-6 animate-spin"
                }
              />
            ) : (
              <Mic className={compact ? "h-5 w-5" : "h-7 w-7"} />
            )}
          </button>

          {/* Text input toggle — Agent+ hides the field by default. Same size
              as the mic; reveals the SmartAgentInput above the bar. */}
          <button
            type="button"
            onClick={() => setInputOpen((v) => !v)}
            aria-pressed={inputOpen}
            aria-label={inputOpen ? "Hide text input" : "Show text input"}
            className={cn(
              "flex items-center justify-center rounded-full transition-transform active:scale-95",
              compact ? "h-9 w-9" : "h-16 w-16",
              inputOpen
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground/60",
            )}
          >
            <Keyboard className={compact ? "h-4 w-4" : "h-6 w-6"} />
          </button>
        </div>
        {blockedByOther && (
          <p
            className={cn(
              "text-center text-muted-foreground",
              compact ? "mt-1 text-[10px]" : "mt-2 text-xs",
            )}
          >
            Another recording is active. Stop it first.
          </p>
        )}
      </div>

      <RecordActionSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) {
            chosenKeyRef.current = null;
            setPendingResult(null);
          }
        }}
        preparing={pendingResult === null}
        onChoose={handleChoose}
      />
    </div>
  );
}
