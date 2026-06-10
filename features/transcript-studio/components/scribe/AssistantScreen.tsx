"use client";

import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  Loader2,
  Maximize2,
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
import { MicTapButton } from "@/components/icons/tap-buttons";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
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

  const liveTranscript = useAppSelector((s) => s.recordings.liveTranscript);
  const [sending, setSending] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  // Studio Read-aloud uses the standard, prefs-aware speaker (reading purpose →
  // Skylar by default; user's chosen voice wins). It cleans markdown itself.
  const speaker = useCartesiaSpeaker({ purpose: "reading" });
  const reading = speaker.isPlaying || speaker.isLoading;

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
      await speaker.stop();
      return;
    }
    await speaker.speak(docContent);
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
      {/* Compact capture bar — a small tap-target up top replaces the old
          full-width "Add recording" button. It also hosts the live
          recording state and the post-recording review offer so they never
          shove the conversation around at the bottom. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/40 px-2 py-1">
        {recorder.isOwnedRecording ? (
          <>
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
          </>
        ) : reviewOffer ? (
          <>
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
          </>
        ) : (
          <>
            <span className="flex-1 truncate text-xs text-muted-foreground">
              Add a recording without leaving the assistant
            </span>
            <MicTapButton
              onClick={() => void recorder.start()}
              disabled={recorder.isAnyRecording}
              ariaLabel="Add recording"
              tooltip="Add recording"
            />
          </>
        )}
      </div>

      {/* Resizable vertical split: working document (top) ↔ conversation
          (bottom). Drag the handle to give either side more room; the
          document can be dragged all the way closed. Full-screen editing
          stays available via the expand button. */}
      <Group
        id={`scribe-assistant-split:${sessionId}`}
        orientation="vertical"
        className="min-h-0 flex-1"
        resizeTargetMinimumSize={{ coarse: 24, fine: 10 }}
      >
        {/* Working document panel */}
        <Panel
          id="doc"
          defaultSize="30%"
          minSize="8%"
          collapsible
          collapsedSize="0%"
        >
          <div className="flex h-full flex-col bg-muted/30">
            <div className="flex shrink-0 items-center justify-between px-4 py-2">
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
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
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
        </Panel>

        {/* Drag handle — a grabbable bar with a centered grip. */}
        <Separator
          className={cn(
            "relative bg-border transition-colors touch-none focus:outline-none",
            "h-2.5 cursor-row-resize",
            "data-[separator=hover]:bg-primary/60",
            "data-[separator=active]:bg-primary",
            "data-[separator=dragging]:bg-primary",
            "after:absolute after:left-1/2 after:top-1/2 after:h-1 after:w-10",
            "after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full",
            "after:bg-muted-foreground/40 after:content-['']",
          )}
        />

        {/* Conversation */}
        <Panel id="convo" minSize="20%">
          <div className="h-full overflow-y-auto px-1 pb-6 pt-2">
            <AgentConversationDisplay
              conversationId={conversationId}
              surfaceKey={`studio-assistant:${sessionId}`}
              compact
            />
          </div>
        </Panel>
      </Group>

      {/* Input — the same composer used on the Chat page, pinned to the
          bottom (never a centered landing state). */}
      <div className="shrink-0 border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <SmartAgentInput
          conversationId={conversationId}
          surfaceKey={`studio-assistant:${sessionId}`}
        />
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
