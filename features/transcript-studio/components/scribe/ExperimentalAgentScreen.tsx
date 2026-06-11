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

import { useRef, useState } from "react";
import { FileText, Loader2, Mic, Send, Square, Webhook } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { useGlobalRecording } from "@/providers/GlobalRecordingProvider";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { ActionSheet, type ActionSheetItem } from "./ActionSheet";

interface ExperimentalAgentScreenProps {
  sessionId: string;
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
  const assistant = useStudioAssistant(sessionId);
  const conversationId = assistant.conversationId;
  const recording = useGlobalRecording();

  const ownedRef = useRef(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const startRecording = async () => {
    if (recording.isActive || recording.isFinalizing) return;
    ownedRef.current = true;
    try {
      await recording.start({
        context: {
          kind: "standalone",
          label: `${STANDALONE_LABEL_PREFIX}${sessionId}`,
        },
        onComplete: (result) => {
          ownedRef.current = false;
          const text = (result.text ?? "").trim();
          if (!text) {
            toast("Nothing was transcribed.");
            return;
          }
          setPendingText(text);
          setSheetOpen(true);
        },
        onError: (message) => {
          ownedRef.current = false;
          toast.error(message);
        },
      });
    } catch {
      ownedRef.current = false;
      // start() throws when blocked by another in-flight recording — the
      // provider already routed a message through onError above.
    }
  };

  const sheetItems: ActionSheetItem[] = [
    {
      key: "send",
      label: "Send to agent",
      description: "Fire it as a turn now.",
      icon: <Webhook className="h-4 w-4" />,
      onSelect: () => {
        if (pendingText) void assistant.send(pendingText);
        setPendingText(null);
      },
    },
    {
      key: "transcribe",
      label: "Transcribe only",
      description: "Drop it into the input to edit before sending.",
      icon: <FileText className="h-4 w-4" />,
      onSelect: () => {
        if (pendingText && conversationId) {
          dispatch(setUserInputText({ conversationId, text: pendingText }));
        }
        setPendingText(null);
      },
    },
    {
      key: "transcribe-send",
      label: "Transcribe & send",
      description: "Stage it in the input and send.",
      icon: <Send className="h-4 w-4" />,
      onSelect: () => {
        if (pendingText && conversationId) {
          dispatch(setUserInputText({ conversationId, text: pendingText }));
          void assistant.send(pendingText);
        }
        setPendingText(null);
      },
    },
  ];

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

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={isRecording ? recording.stop : startRecording}
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
        </div>
        {blockedByOther && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Another recording is active. Stop it first.
          </p>
        )}
      </div>

      <ActionSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setPendingText(null);
        }}
        title="What should we do with this?"
        items={sheetItems}
      />
    </div>
  );
}
