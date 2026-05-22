"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Maximize2,
  Mic,
  Pause,
  Play,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { AgentMicrophoneButton } from "@/features/agents/components/inputs/smart-input/AgentMicrophoneButton";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { useCartesia } from "@/hooks/tts/useCartesia";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { useStudioSession } from "../../hooks/useStudioSession";
import { FocusedDocumentEditor } from "./FocusedDocumentEditor";

interface AssistantScreenProps {
  sessionId: string;
}

const REVIEW_MESSAGE =
  "A new recording was just added to this session. Please review the latest transcript and update the working document accordingly.";

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AssistantScreen({ sessionId }: AssistantScreenProps) {
  const dispatch = useAppDispatch();
  const assistant = useStudioAssistant(sessionId);
  const conversationId = assistant.conversationId;
  const recorder = useStudioSession({ sessionId });

  const inputText = useAppSelector(
    conversationId ? selectUserInputText(conversationId) : () => "",
  );
  const liveTranscript = useAppSelector((s) => s.recordings.liveTranscript);
  const [sending, setSending] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  const tts = useCartesia();
  const [reading, setReading] = useState(false);

  const workingDoc = assistant.workingDocument;
  const docContent = workingDoc?.content ?? "";

  // Offer to send the just-finished recording to the assistant for review.
  const [reviewOffer, setReviewOffer] = useState(false);
  const wasRecording = useRef(false);
  useEffect(() => {
    if (wasRecording.current && !recorder.isOwnedRecording) {
      setReviewOffer(true);
    }
    wasRecording.current = recorder.isOwnedRecording;
  }, [recorder.isOwnedRecording]);

  const handleSend = async () => {
    if (!conversationId || !inputText.trim() || sending) return;
    setSending(true);
    try {
      await assistant.send();
      dispatch(setUserInputText({ conversationId, text: "" }));
    } finally {
      setSending(false);
    }
  };

  // Audio-first: speaking auto-sends on speech end (no extra tap).
  const handleSpoken = (text: string) => {
    if (!conversationId || !text.trim() || sending) return;
    setSending(true);
    void assistant
      .send(text)
      .finally(() => {
        dispatch(setUserInputText({ conversationId, text: "" }));
        setSending(false);
      });
  };

  const handleSendForReview = () => {
    setReviewOffer(false);
    if (!conversationId || sending) return;
    setSending(true);
    void assistant.send(REVIEW_MESSAGE).finally(() => {
      dispatch(setUserInputText({ conversationId, text: "" }));
      setSending(false);
    });
  };

  const handleReadAloud = async () => {
    if (!docContent.trim()) return;
    if (reading) {
      await tts.stopPlayback();
      setReading(false);
      return;
    }
    if (!tts.isAudioInitialized) await tts.initializeAudio();
    setReading(true);
    try {
      // Strip markdown/symbols so the document is spoken cleanly (matches the
      // app's standard TTS path).
      const spoken = parseMarkdownToText(docContent);
      await tts.sendMessage(spoken || docContent);
    } finally {
      // Playback runs async; reset the toggle when the user stops or it ends.
      setReading(false);
    }
  };

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Working document panel */}
      <div className="shrink-0 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Working document
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleReadAloud}
              disabled={!docContent.trim()}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                docContent.trim()
                  ? "bg-accent text-accent-foreground active:bg-accent/70"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {reading ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
              {reading ? "Stop" : "Read aloud"}
            </button>
            <button
              type="button"
              onClick={() => setFocusOpen(true)}
              disabled={!workingDoc}
              aria-label="Open focused editor"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                workingDoc
                  ? "bg-accent text-accent-foreground active:bg-accent/70"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="max-h-[28dvh] overflow-y-auto px-4 pb-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {docContent || (
              <span className="italic text-muted-foreground">
                Empty. Ask the assistant to draft, splice, or rework your
                recordings — it builds the document here.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto">
        <AgentConversationDisplay
          conversationId={conversationId}
          surfaceKey={`studio-assistant:${sessionId}`}
          compact
        />
      </div>

      {/* Add-recording strip — capture without leaving the assistant */}
      <div className="shrink-0 border-t border-border bg-card/60 px-3 py-2">
        {recorder.isOwnedRecording ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
              <span className="relative flex h-2 w-2">
                {!recorder.isPaused && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span className="font-mono tabular-nums">
                {formatClock(recorder.durationSec)}
              </span>
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {recorder.isPaused ? "Paused" : liveTranscript || "Listening…"}
            </span>
            <button
              type="button"
              onClick={recorder.isPaused ? recorder.resume : recorder.pause}
              aria-label={recorder.isPaused ? "Resume" : "Pause"}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground active:bg-accent"
            >
              {recorder.isPaused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={recorder.stop}
              aria-label="Stop recording"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white active:scale-95"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          </div>
        ) : reviewOffer ? (
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              Recording added. Send it to the assistant for review?
            </span>
            <button
              type="button"
              onClick={handleSendForReview}
              className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground active:bg-primary/90"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
            <button
              type="button"
              onClick={() => setReviewOffer(false)}
              aria-label="Dismiss"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void recorder.start()}
            disabled={recorder.isAnyRecording}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-border py-2 text-sm font-medium transition-colors",
              recorder.isAnyRecording
                ? "cursor-not-allowed text-muted-foreground"
                : "text-foreground active:bg-accent",
            )}
          >
            <Mic className="h-4 w-4" />
            Add recording
          </button>
        )}
      </div>

      {/* Audio-first input — mic, field, and send share one container */}
      <div className="shrink-0 border-t border-border bg-card/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <div className="flex items-end gap-1.5 rounded-3xl border border-border bg-background py-1.5 pl-1.5 pr-1.5 focus-within:border-primary">
          <AgentMicrophoneButton
            conversationId={conversationId}
            size="md"
            variant="icon-only"
            onTranscribed={handleSpoken}
          />
          <textarea
            value={inputText}
            onChange={(e) =>
              dispatch(
                setUserInputText({ conversationId, text: e.target.value }),
              )
            }
            placeholder="Speak or type…"
            rows={1}
            className="max-h-32 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            aria-label="Send"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
              inputText.trim() && !sending
                ? "bg-primary text-primary-foreground active:bg-primary/90"
                : "bg-muted text-muted-foreground",
            )}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1 px-2 text-center text-[11px] text-muted-foreground">
          Tap the mic and speak — it sends automatically.
        </p>
      </div>

      {focusOpen && workingDoc && (
        <FocusedDocumentEditor
          sessionId={sessionId}
          doc={workingDoc}
          onClose={() => setFocusOpen(false)}
        />
      )}
    </div>
  );
}
