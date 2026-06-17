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

import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Loader2, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useAppDispatch,
  useAppSelector,
  useAppStore,
} from "@/lib/redux/hooks";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { useGlobalRecording } from "@/providers/GlobalRecordingProvider";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { useAutoVoiceResponse } from "../../hooks/useAutoVoiceResponse";
import { ingestExternalRecordingThunk } from "../../redux/thunks";
import { RecordActionSheet, type RecordActionKey } from "./RecordActionSheet";

interface ExperimentalAgentScreenProps {
  sessionId: string;
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

  const speaker = useAutoVoiceResponse({
    conversationId,
    enabled: autoVoice,
  });
  const speaking = speaker.isPlaying || speaker.isLoading;

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
  //   save / both  → persist as a real studio recording (Tab-1 pipeline) so it
  //                  lands as a card in the Record tab with audio + raw + cleaned.
  //   agent / both → stage the transcript in the input AND open + focus it so the
  //                  cursor is ready (the input is hidden by default on this tab).
  //   now → fire it to the agent as a turn immediately (hands-free voice flow).
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
          if (conversationId) {
            dispatch(setUserInputText({ conversationId, text }));
            // Reveal the input — AgentTextarea auto-focuses on mount, so the
            // cursor lands in the field ready to edit/send.
            setInputOpen(true);
          }
        }
        if (key === "now") {
          void assistant.send(text);
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
      setSheetOpen(true);
    }
  }, [isRecording]);

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
          surfaceKey={`studio-assistant-experimental:${sessionId}`}
          constrainWidth
          edgeToEdgeScroll
          hideInput={!inputOpen}
          smartInputProps={{ sendButtonVariant: "blue" }}
        />
      </div>

      {/* Single record control */}
      <div className="shrink-0 border-t border-border bg-card/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
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

        <div className="flex items-center justify-center gap-4">
          {/* Auto-voice toggle — read responses aloud. Dimmed when off. */}
          <button
            type="button"
            onClick={() => {
              if (speaking) void speaker.stop();
              setAutoVoice((v) => !v);
            }}
            aria-pressed={autoVoice}
            aria-label={
              autoVoice ? "Turn off voice replies" : "Turn on voice replies"
            }
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-95",
              autoVoice
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-muted-foreground/60",
            )}
          >
            {speaking ? (
              <Volume2 className="h-6 w-6 animate-pulse" />
            ) : autoVoice ? (
              <Volume2 className="h-6 w-6" />
            ) : (
              <VolumeX className="h-6 w-6" />
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
              "flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-95",
              isRecording
                ? "bg-red-500 text-white"
                : blockedByOther || recording.isFinalizing
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground",
            )}
          >
            {isRecording ? (
              <Square className="h-6 w-6 fill-current" />
            ) : recording.isFinalizing ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Mic className="h-7 w-7" />
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
              "flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-95",
              inputOpen
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground/60",
            )}
          >
            <Keyboard className="h-6 w-6" />
          </button>
        </div>
        {blockedByOther && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
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
